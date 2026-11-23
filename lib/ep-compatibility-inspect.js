'use strict';
// Explicit local diagnostic. It reads the destination catalog and confirmed EP;
// it never sends points, switches pages or edits an existing profile.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),P=require('./ep-pages');
async function collect(mod,ep,store,root,current,closed=()=>false){
 if(ep.pending||ep.querying)throw Error('ep-busy');
 const meta=current();if(!meta.class)throw Error('ep-current-unavailable');
 const profiles=store.list().profiles.filter(p=>p.source.class===meta.class).slice(0,20),ids=new Set();
 for(const p of profiles)if(p.ep)for(const page of P.validate(p.ep,p.source.class).pages)for(const perk of page.perks)ids.add(perk.id);
 const snapshot=ep.snapshot();if(snapshot)for(const page of snapshot.pages)for(const perk of page.perks)ids.add(perk.id);
 if(ids.size>512)throw Error('ep-catalog-unavailable');
 const report={format:'controls-ep-compatibility',version:1,at:Date.now(),source:meta,environment:{majorPatch:mod.majorPatchVersion,minorPatch:mod.minorPatchVersion,protocol:mod.dispatch.protocolVersion},state:ep.state(),observed:snapshot,profiles:[],rows:[],scope:'Read-only destination catalog and confirmed EP. No requests to allocate, reset or switch pages.'};
 let cat=null;
 if(ids.size){try{cat=await ep.query([...ids]);for(const id of ids)report.rows.push(...(ep.catalogs.get(id)||[]));}catch(e){report.catalogError=String(e.message||e).slice(0,100);}}
 if(closed())return null;
 for(const profile of profiles){
  const out={id:profile.id,name:profile.name,hasEp:!!profile.ep,pages:[]};report.profiles.push(out);
  if(!profile.ep)continue;
  for(const page of profile.ep.pages){const result={index:page.index,talents:page.perks.length};out.pages.push(result);
   if(!cat){result.reason=report.catalogError||'ep-catalog-unavailable';continue;}
   try{result.requiredPoints=page.perks.reduce((sum,p)=>sum+P.cost(p,cat,meta.class),0);}catch(e){result.reason=String(e.message||e).slice(0,100);continue;}
   const observed=snapshot&&snapshot.pages.find(p=>p.index===snapshot.activePreset);
   if(!snapshot||!snapshot.ready||snapshot.uncertain||!observed){result.reason='ep-current-unavailable';continue;}
   try{result.plan=P.plan(page.perks,{class:meta.class,totalPoints:snapshot.totalPoints,usedPoints:observed.usedPoints,epLevel:snapshot.epLevel,userLevel:mod.game.me.level,perks:observed.perks},cat);}catch(e){result.reason=String(e.message||e).slice(0,100);}
  }
 }
 const folder=path.join(root,'logs');fs.mkdirSync(folder,{recursive:true});const stat=fs.lstatSync(folder);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('invalid-ep-log-directory');
 const bytes=Buffer.from(JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');if(bytes.length>3*1024*1024)throw Error('ep-catalog-unavailable');
 const file=path.join(folder,'ep-compatibility-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex')+'.json');fs.writeFileSync(file,bytes,{flag:'wx'});return file;
}
module.exports={collect};
