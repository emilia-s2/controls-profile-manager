'use strict';
const crypto=require('crypto');
const FIELDS=['id','parentId','class','grade','takePoint'];
function integer(value,min,max){return typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;}
function parse(rows,job){
 if(!Array.isArray(rows)||!rows.length||rows.length>4096||typeof job!=='string'||!job)throw Error('invalid-glyph-catalog');
 const items=new Map();
 for(const row of rows){const a=row&&row.attributes;
  if(!a||a.class!==job||!integer(a.id,1,2147483647)||!integer(a.parentId,0,2147483647)||!integer(a.grade,0,20)||!integer(a.takePoint,0,1000)||a.id===a.parentId)throw Error('invalid-glyph-catalog');
  const item={id:String(a.id),parentId:a.parentId?String(a.parentId):null,grade:a.grade,cost:a.takePoint,class:job};
  if(items.has(item.id))throw Error('invalid-glyph-catalog');items.set(item.id,item);
 }
 function family(id){const seen=new Set();let item=items.get(String(id));while(item){if(seen.has(item.id)||seen.size>32)throw Error('invalid-glyph-catalog');seen.add(item.id);if(!item.parentId)return item.id;item=items.get(item.parentId);}return null;}
 for(const item of items.values())item.family=family(item.id);
 const normalized=[...items.values()].sort((a,b)=>Number(a.id)-Number(b.id)).map(a=>({name:'CrestItem',attributes:{id:Number(a.id),parentId:a.parentId?Number(a.parentId):0,class:job,grade:a.grade,takePoint:a.cost}}));
 return {job,items,rows:normalized,fingerprint:crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex')};
}
function choose(id,available,catalog){
 const source=catalog.items.get(id);if(!source)return null;
 if(available.has(id))return source;
 if(!source.family)return null;
 const candidates=[...available].map(id=>catalog.items.get(id)).filter(item=>item&&item.family===source.family);
 if(!candidates.length)return null;
 candidates.sort((a,b)=>b.grade-a.grade||a.cost-b.cost);
 if(candidates.length>1&&candidates[0].grade===candidates[1].grade&&candidates[0].cost===candidates[1].cost)return null;
 return candidates[0];
}
async function query(mod,job){
 let timer;try{
  const rows=await Promise.race([Promise.resolve().then(()=>mod.queryData('/CrestData/CrestItem@class=?/',[job],true,false,FIELDS)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('glyph-catalog-unavailable')),6000);})]);
  return {rows,catalog:parse(rows,job)};
 }finally{clearTimeout(timer);}
}
module.exports={parse,choose,query,FIELDS};
