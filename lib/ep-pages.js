'use strict';
const crypto=require('crypto');
const integer=(n,min=0,max=2147483647)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function perks(rows,allowZero=false){
 if(!Array.isArray(rows)||rows.length>512)throw Error('ep-invalid-perks');
 const ids=new Set(),out=[];
 for(const p of rows){if(!p||!integer(p.id,1)||!integer(p.level,allowZero?0:1,65535)||ids.has(p.id))throw Error('ep-invalid-perks');ids.add(p.id);if(p.level)out.push({id:p.id,level:p.level});}
 return out.sort((a,b)=>a.id-b.id);
}
function content(ep){
 if(!ep||ep.format!=='controls-ep-pages'||ep.version!==1||typeof ep.class!=='string'||!/^[a-z]{1,32}$/.test(ep.class)||!integer(ep.unlockedPages,1,5)||!Array.isArray(ep.pages)||ep.pages.length<1||ep.pages.length>ep.unlockedPages)throw Error('ep-invalid-profile');
 const seen=new Set(),pages=[];
 for(const p of ep.pages){if(!p||!integer(p.index,0,ep.unlockedPages-1)||seen.has(p.index))throw Error('ep-invalid-profile');seen.add(p.index);pages.push({index:p.index,perks:perks(p.perks)});}
 pages.sort((a,b)=>a.index-b.index);
 return {format:ep.format,version:1,class:ep.class,unlockedPages:ep.unlockedPages,pages};
}
function create(job,unlockedPages,pages){const ep=content({format:'controls-ep-pages',version:1,class:job,unlockedPages,pages});ep.sha256=digest(ep);return ep;}
function validate(ep,job){const out=content(ep);if(ep.class!==job||typeof ep.sha256!=='string'||digest(out)!==ep.sha256)throw Error('ep-invalid-profile');return out;}
function catalog(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>16000)throw Error('ep-catalog-unavailable');
 const map=new Map(),normalized=[];
 for(const row of rows){const a=row&&row.attributes;if(!row||row.name!=='Perk'||!a||!integer(a.id,1)||!integer(a.level,1,65535)||!integer(a.spendEp,0,100000)||typeof a.usableClass!=='string'||!/^[A-Za-z]{1,32}$/.test(a.usableClass))throw Error('ep-invalid-catalog');
  const conditions=(row.children||[]).filter(c=>c.name==='Condition');if(conditions.length!==1)throw Error('ep-unknown-condition');
  const c=conditions[0];if((c.children||[]).length||!c.attributes||Object.keys(c.attributes).some(k=>!['epLevel','spentEp','totalEp','userLevel'].includes(k)))throw Error('ep-unknown-condition');
  for(const key of ['epLevel','spentEp','totalEp','userLevel'])if(!integer(c.attributes[key],0,10000000))throw Error('ep-unknown-condition');
  const key=a.id+':'+a.level;if(map.has(key))throw Error('ep-ambiguous-catalog');
  const item={id:a.id,level:a.level,cost:a.spendEp,class:a.usableClass.toLowerCase(),condition:Object.assign({},c.attributes)};map.set(key,item);normalized.push(item);
 }
 normalized.sort((a,b)=>a.id-b.id||a.level-b.level);
 return {map,fingerprint:digest(normalized)};
}
function cost(perk,cat,job){let sum=0;for(let n=1;n<=perk.level;n++){const r=cat.map.get(perk.id+':'+n);if(!r||![job,'common'].includes(r.class))throw Error('ep-talent-unavailable');sum+=r.cost;if(!integer(sum,0,10000000))throw Error('ep-invalid-cost');}return sum;}
function plan(source,current,cat){
 const desired=perks(source),existing=perks(current.perks),want=new Map(desired.map(p=>[p.id,p.level]));
 if(typeof current.class!=='string'||!integer(current.totalPoints,0,10000000)||!integer(current.usedPoints,0,current.totalPoints)||!integer(current.epLevel,0,10000000)||!integer(current.userLevel,1,1000))throw Error('ep-current-unavailable');
 for(const p of existing)if(p.level>(want.get(p.id)||0))throw Error('ep-reset-required');
 const old=new Map(existing.map(p=>[p.id,p.level]));let oldCost=0,targetCost=0,levelsAdded=0;
 for(const p of existing)oldCost+=cost(p,cat,current.class);
 if(oldCost!==current.usedPoints)throw Error('ep-cost-mismatch');
 const changes=[];
 for(const p of desired){targetCost+=cost(p,cat,current.class);const was=old.get(p.id)||0;if(p.level>was){
  if(levelsAdded+p.level-was>16384)throw Error('ep-too-many-levels');
  for(let n=was+1;n<=p.level;n++){const c=cat.map.get(p.id+':'+n).condition;if(current.epLevel<c.epLevel||current.usedPoints<c.spentEp||current.totalPoints<c.totalEp||current.userLevel<c.userLevel)throw Error('ep-requirements-not-met');}
  levelsAdded+=p.level-was;changes.push({id:p.id,level:p.level});
 }}
 if(targetCost>current.totalPoints)throw Error('ep-insufficient-points');
 if(!changes.length)throw Error('ep-already-matches');
 return {desired,changes,levelsAdded,additionalCost:targetCost-oldCost,targetCost,remaining:current.totalPoints-targetCost};
}
module.exports={integer,digest,perks,create,validate,catalog,plan,cost};
