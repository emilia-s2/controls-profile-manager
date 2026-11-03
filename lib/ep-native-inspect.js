'use strict';
// Temporary read-only EP research. Never sends a gameplay packet or applies points.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),timers=require('timers');
const GAME='c:\\games\\tera asura\\tera\\binaries\\tera.exe';
const GAME_HASH='c778f923f2a495d7b1624c1e1ac944aae29819af7bdc25ad61f9cb8632cec491';
const BUILDS={[GAME]:GAME_HASH,'h:\\games\\tera astrix\\binaries\\tera.exe':'7c7165109b5893b0f5f0130a70c14c2f8ea3d3ef5cea4185f361e7ca15e1ba8d'};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
function validate(r,pid,expected=GAME_HASH){
 if(!r||r.format!=='controls-ep-native-v1'||r.ok!==true||r.pid!==pid||(!Object.values(BUILDS).includes(expected)||r.sha256!==expected)||!Array.isArray(r.hits)||r.hits.length>400||!Array.isArray(r.refs)||r.refs.length>512||!Array.isArray(r.functions)||r.functions.length>80)throw Error('invalid-native-report');
 let total=0;
 for(const h of r.hits)if(!h||typeof h.name!=='string'||h.name.length>100||typeof h.context!=='string'||h.context.length>512||!Number.isSafeInteger(h.rva)||h.rva<4096||h.rva>=96*1024*1024)throw Error('invalid-native-hit');
 for(const f of r.functions){if(!f||!Number.isSafeInteger(f.start)||!Number.isSafeInteger(f.end)||f.start<4096||f.end>96*1024*1024||f.end<=f.start||f.end-f.start>24000||typeof f.hex!=='string'||f.hex.length!==(f.end-f.start)*2||!/^[0-9a-f]+$/.test(f.hex))throw Error('invalid-native-function');total+=f.end-f.start;}
 if(total>500000)throw Error('native-report-too-large');
 return r;
}
class EPNativeInspect {
 constructor(mod,root,options={}){this.mod=mod;this.root=root;this.exec=options.execFile||require('child_process').execFile;this.closed=false;this.busy=false;this.child=null;this.session=null;}
 async run(mode='ep'){
  if(!['ep','player'].includes(mode))throw Error('invalid-reader-mode');
  if(this.closed)throw Error('reader-closed');if(this.busy)throw Error('reader-busy');
  const info=this.mod.clientInterface&&this.mod.clientInterface.info;
  if(!info||!Number.isSafeInteger(info.pid)||info.pid<5||info.pid>0xffffffff||info.arch!=='x64'||typeof info.path!=='string'||!BUILDS[path.resolve(info.path,'TERA.exe').toLowerCase()]||this.mod.majorPatchVersion!==100||this.mod.minorPatchVersion!==2||this.mod.dispatch.protocolVersion!==376012)throw Error('unsupported-ep-native-client');
  const reader=mode==='player'?'player-build-reader.exe':'ep-metadata-reader.exe';
  const file=path.join(this.root,'native',reader);
  const manifest=JSON.parse(fs.readFileSync(path.join(this.root,'manifest.json'),'utf8'));
  const expected=manifest.files['native/'+reader];
  if(typeof expected!=='string'||!/^[A-F0-9]{64}$/i.test(expected)||sha(fs.readFileSync(file))!==expected.toUpperCase())throw Error('ep-native-reader-hash');
  const directory=path.join(this.root,'logs');fs.mkdirSync(directory,{recursive:true});
  const stat=fs.lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('invalid-ep-log-directory');
  this.busy=true;
  const report={format:'controls-ep-native-inspection',version:1,mode,at:Date.now(),pid:info.pid,native:null,catalogs:[],scope:mode==='player'?'Read-only static inspection callbacks. No gameplay requests or player state writes.':'Read-only static EP metadata and local datacenter queries; no gameplay packets or points changed.'};
  let failed=null;
  try{
   const reply=await new Promise((resolve,reject)=>{
    let finished=false;
    const child=this.exec(file,['--pid',String(info.pid)],{shell:false,windowsHide:true,encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024},(error,stdout)=>{
     finished=true;this.child=null;if(this.closed)return reject(Error('reader-closed'));
     let value;try{value=JSON.parse(stdout);}catch(_){return reject(Error(error&&error.killed?'native-read-timeout':'invalid-native-json'));}
     if(error||value.ok!==true){report.nativeFailure={reason:String(value.reason||error&&error.code||'native-read-failed').slice(0,100),errorCode:value.errorCode};return reject(Error('native-read-failed'));}
     try{resolve(validate(value,info.pid,BUILDS[path.resolve(info.path,'TERA.exe').toLowerCase()]));}catch(e){reject(e);}
    });
    if(!finished)this.child=child;
   });
   report.native=reply;
   // Query only EP table names actually found in the verified image. No root wildcards.
   const candidates=new Set();
   if(mode==='ep')for(const h of reply.hits)for(const name of h.context.match(/[A-Za-z_][A-Za-z0-9_]{1,79}/g)||[])if(/^(?:EP|Ep|ep)[A-Za-z0-9_]*(?:Data|Table|Core|Perk)$/.test(name))candidates.add(name);
   for(const name of [...candidates].sort().slice(0,4)){
    if(this.closed)throw Error('reader-closed');
    let timeout;
    const query=async children=>{
     try{return await Promise.race([Promise.resolve().then(()=>this.mod.queryData('/'+name+'/',[],true,children)),new Promise((_,reject)=>{timeout=timers.setTimeout(()=>reject(Error('local-ep-query-timeout')),2500);})]);}
     finally{timers.clearTimeout(timeout);}
    };
    try{const head=await query(false);if(!Array.isArray(head)||head.length>16)throw Error('invalid-ep-table-header');if(!head.length){report.catalogs.push({name,found:false});continue;}
     const rows=await query(true);if(!Array.isArray(rows)||rows.length>16||JSON.stringify(rows).length>2*1024*1024)throw Error('ep-table-too-large');report.catalogs.push({name,found:true,rows});
    }catch(e){report.catalogs.push({name,error:String(e.message||e).slice(0,100)});}
   }
  }catch(e){failed=e;report.error=String(e.message||e).slice(0,100);}
  finally{this.busy=false;}
  if(this.closed)throw Error('reader-closed');
  if(!failed&&mode==='ep'){if(!this.session)this.session=new (require('./ep-query-session').EPQuerySession)(this.mod,directory,()=>this.run());report.querySession=this.session.info();}
  const target=path.join(directory,(mode==='player'?'player-native-':'ep-native-')+Date.now()+'-'+crypto.randomBytes(4).toString('hex')+'.json');
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');if(bytes.length>10*1024*1024)throw Error('ep-native-report-too-large');
  fs.writeFileSync(target,bytes,{flag:'wx'});
  if(failed){failed.report=target;throw failed;}
  return target;
 }
 close(){this.closed=true;if(this.session)this.session.close();if(this.child)this.child.kill();this.child=null;}
}
module.exports={EPNativeInspect,validate};
