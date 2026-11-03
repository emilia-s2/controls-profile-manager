'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),timers=require('timers');
const NAMES=['S_LOAD_EP_INFO','S_CHANGE_EP_POINT','S_LEARN_EP_PERK','S_RESET_EP_PERK','TTB_S_LOAD_EP_PAGE','S_PLAYER_CHANGE_EP','S_PLAYER_RESET_EP','S_OPEN_EPPERK_RESET_POPUP','C_LOAD_EP_INFO','C_LOAD_EP_PAGE','C_LEARN_EP_PERK','C_REQUEST_RESET_EPPERK','C_RESET_EP_PERK','C_EXPAND_EP_PAGE'];
module.exports=function EPInspect(mod,root,current){
 let report=null,file=null,active=false,closed=false,saveTimer=null,endTimer=null;const hooks=[],available={};
 function flush(){if(saveTimer){timers.clearTimeout(saveTimer);saveTimer=null;}if(!report||!file)return file;fs.writeFileSync(file,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');return file;}
 function stop(reason='manual'){active=false;if(endTimer)timers.clearTimeout(endTimer);endTimer=null;if(report)report.stopped={at:Date.now(),reason};return flush();}
 function accept(name,opcode,bytes,incoming,fake){
  if(!active||closed||fake||!Buffer.isBuffer(bytes))return;
  if(report.records.length>=128||report.bytes+bytes.length>256*1024){stop('limit');return;}
  const item={name,opcode,incoming:incoming===true,at:Date.now(),who:current(),packetBase64:bytes.toString('base64'),decoded:[]};
  if(name.startsWith('S_')||name.startsWith('TTB_S_'))for(const version of name==='S_LOAD_EP_INFO'?[2,1]:[1]){
   try{const data=mod.dispatch.fromRaw(name,version,bytes);if(data&&Array.isArray(data.perks)&&data.perks.length>2048)continue;item.decoded.push({version,data});}catch(_){}
  }
  report.records.push(item);report.bytes+=bytes.length;
  if(!saveTimer)saveTimer=timers.setTimeout(()=>{saveTimer=null;try{flush();}catch(_){active=false;mod.log('Controls Profile: falha ao gravar diagnóstico EP.');}},300);
 }
 for(const name of NAMES){try{hooks.push(mod.hook(name,'raw',{order:-9000,filter:{fake:false,modified:false,silenced:false}},(opcode,bytes,incoming,fake)=>{try{accept(name,opcode,bytes,incoming,fake);}catch(_){active=false;}return undefined;}));available[name]=true;}catch(_){available[name]=false;}}
 return {
  start(){if(closed)throw Error('closed');if(report)stop('new-session');const dir=path.join(root,'logs');fs.mkdirSync(dir,{recursive:true});file=path.join(dir,'ep-inspect-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex')+'.json');report={format:'controls-ep-inspection',version:1,createdAt:Date.now(),environment:{majorPatch:mod.majorPatchVersion,minorPatch:mod.minorPatchVersion,protocol:mod.dispatch.protocolVersion},who:current(),availablePackets:available,records:[],bytes:0,scope:'Passive EP packet observation; no points, pages or packets modified.'};active=true;endTimer=timers.setTimeout(()=>stop('time-limit'),480000);flush();return file;},
  report:flush,stop,
  async context(){
   const info={format:'controls-ep-context',at:Date.now(),who:current(),gameId:String(mod.game.me.gameId),roots:null};let timer;
   try{const result=await Promise.race([Promise.resolve().then(()=>mod.queryData('/*/',[],true,false,[])),new Promise((_,reject)=>{timer=timers.setTimeout(()=>reject(Error('local-query-timeout')),6000);})]);if(Array.isArray(result)&&result.length<=2048)info.roots=result.map(row=>row.name);else info.rootsError='unsupported-root-query';}catch(e){info.rootsError=String(e.message||e).slice(0,160);}finally{if(timer)timers.clearTimeout(timer);}
   if(closed)return null;const dir=path.join(root,'logs');fs.mkdirSync(dir,{recursive:true});const target=path.join(dir,'ep-context-'+Date.now()+'.json');fs.writeFileSync(target,JSON.stringify(info,null,2)+'\n',{flag:'wx'});return target;
  },
  destructor(){if(closed)return;closed=true;stop('unload');for(const hook of hooks)mod.unhook(hook);}
 };
};
