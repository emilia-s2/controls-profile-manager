'use strict';
const fs=require('fs'),path=require('path'),F=require('./settings-format'),G=require('./glyph-presets');
async function collect(mod,engine,store,root,closed=()=>false){
 const me=mod.game.me,meta={character:me.name,playerId:me.playerId,templateId:me.templateId,class:me.class,serverId:mod.game.serverId,protocol:mod.dispatch.protocolVersion,majorPatch:mod.majorPatchVersion,minorPatch:mod.minorPatchVersion};
 const available=engine.glyphSet(meta);if(!available)throw Error('known-glyphs-unavailable');
 const profiles=store.list().profiles.filter(p=>p.source.class===meta.class).slice(0,50),sourceIds=new Set();
 for(const p of profiles){const section=F.parsePacket(Buffer.from(p.packetBase64,'base64')).sections.find(s=>s.name===G.NAME);if(section)for(const page of G.read(section))for(const glyph of page.glyphs)sourceIds.add(glyph.id);}
 const ids=[...new Set([...available,...sourceIds])].map(Number);if(ids.length>4096)throw Error('glyph-catalog-too-large');
 const rows=[],scheduled=new Set(ids);
 for(let offset=0;offset<ids.length;){
  if(closed())return null;const batch=ids.slice(offset,offset+128);let timer;
  offset+=batch.length;
  const operation=Promise.resolve().then(()=>mod.queryData('/CrestData/CrestItem@id=?/',[batch],true,false));
  let reply;try{reply=await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('glyph-catalog-timeout')),6000);})]);}finally{clearTimeout(timer);}
  if(closed())return null;
  if(!Array.isArray(reply)||reply.length>512)throw Error('invalid-glyph-catalog');
  const requested=new Set(batch);
  for(const row of reply){if(!row||row.name!=='CrestItem'||!row.attributes||!requested.has(Number(row.attributes.id)))throw Error('invalid-glyph-catalog');rows.push(row);
   const parent=Number(row.attributes.parentId);if(Number.isSafeInteger(parent)&&parent>0&&!scheduled.has(parent)){scheduled.add(parent);ids.push(parent);if(ids.length>4096)throw Error('glyph-catalog-too-large');}
  }
 }
 const report={format:'controls-glyph-catalog-inspection',version:1,at:Date.now(),meta,sourceProfiles:profiles.map(p=>({id:p.id,name:p.name})),sourceIds:[...sourceIds],availableIds:[...available],rows};
 const bytes=Buffer.from(JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');if(bytes.length>2*1024*1024)throw Error('glyph-catalog-too-large');
 if(closed())return null;const folder=path.join(root,'logs');fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,'glyph-catalog-'+new Date(report.at).toISOString().replace(/[:.]/g,'-')+'-'+process.pid+'.json');fs.writeFileSync(file,bytes,{flag:'wx'});return file;
}
module.exports={collect};
