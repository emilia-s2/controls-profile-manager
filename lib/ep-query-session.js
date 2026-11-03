'use strict';
// Temporary, nonce-bound local EP queries. No code evaluation or gameplay messages.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),timers=require('timers');
function validateQuery(q){
 if(!q||typeof q.path!=='string'||q.path.length>160||!/^\/(?:EpPerk\/Perk|StrSheet_EpPerkData\/String|EpData(?:\/[A-Za-z][A-Za-z0-9_]{0,39}){0,3})(?:@(?:id|level|class|category|templateId)=\?(?:&(?:id|level|class|category|templateId)=\?)*)?\/?$/.test(q.path)||!Array.isArray(q.args)||q.args.length>4||q.args.length!==(q.path.match(/\?/g)||[]).length||typeof q.children!=='boolean')throw Error('invalid-ep-query');
 const scalar=v=>(Number.isSafeInteger(v)&&v>=0&&v<=2147483647)||(typeof v==='string'&&/^[a-z]{1,32}$/.test(v));
 if(!q.args.every(v=>Array.isArray(v)?v.length>0&&v.length<=128&&v.every(scalar):scalar(v)))throw Error('invalid-ep-query-args');
 if(q.children&&q.path.startsWith('/EpPerk/')&&!/@id=\?/.test(q.path))throw Error('unbounded-ep-query');
 return q;
}
class EPQuerySession {
 constructor(mod,directory,nativeRead,options={}){
  this.mod=mod;this.directory=directory;this.nativeRead=nativeRead;this.now=options.now||Date.now;
  this.nonce=crypto.randomBytes(16).toString('hex');this.sequence=0;this.count=0;this.busy=false;this.closed=false;this.expiresAt=this.now()+15*60*1000;
  this.file=path.join(directory,'ep-query-request-'+this.nonce+'.json');
  fs.watchFile(this.file,{persistent:false,interval:1000},()=>this.consume().catch(()=>this.close()));
  this.timer=timers.setTimeout(()=>this.close(),15*60*1000);if(this.timer.unref)this.timer.unref();
 }
 info(){return {format:'controls-ep-query-session',nonce:this.nonce,requestFile:this.file,expiresAt:this.expiresAt,maxRequests:20,scope:'Only local EpData, EpPerk/Perk and StrSheet_EpPerkData/String, or the fixed static EP reader.'};}
 async consume(){
  if(this.closed||this.busy||this.now()>=this.expiresAt||this.count>=20)return false;
  let r;
  try{const stat=fs.lstatSync(this.file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)return false;r=JSON.parse(fs.readFileSync(this.file,'utf8'));if(r.format!=='controls-ep-query-request'||r.nonce!==this.nonce||!Number.isSafeInteger(r.sequence)||r.sequence<=this.sequence||!['query','image'].includes(r.action))return false;
   if(r.action==='query'){if(!Array.isArray(r.queries)||r.queries.length<1||r.queries.length>3)return false;r.queries.forEach(validateQuery);}
  }catch(_){return false;}
  this.sequence=r.sequence;this.count++;this.busy=true;
  const report={format:'controls-ep-query-result',nonce:this.nonce,sequence:r.sequence,at:this.now(),results:[]};
  try{
   if(r.action==='image'){report.nativeFile=await this.nativeRead();}
   else for(const q of r.queries){if(this.closed)break;let timer;try{
    const rows=await Promise.race([Promise.resolve().then(()=>this.mod.queryData(q.path,q.args,true,q.children)),new Promise((_,reject)=>{timer=timers.setTimeout(()=>reject(Error('ep-local-query-timeout')),5000);})]);
    if(!Array.isArray(rows)||rows.length>16000||JSON.stringify(rows).length>2*1024*1024)throw Error('ep-local-query-too-large');report.results.push({query:q,rows});
   }catch(e){report.results.push({query:q,error:String(e.message||e).slice(0,120)});}finally{timers.clearTimeout(timer);}}
  }catch(e){report.error=String(e.message||e).slice(0,120);}
  finally{this.busy=false;}
  if(!this.closed){const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');if(bytes.length<=7*1024*1024)fs.writeFileSync(path.join(this.directory,'ep-query-result-'+this.nonce+'-'+r.sequence+'.json'),bytes,{flag:'wx'});}
  return true;
 }
 close(){if(this.closed)return;this.closed=true;fs.unwatchFile(this.file);timers.clearTimeout(this.timer);}
}
module.exports={EPQuerySession,validateQuery};
