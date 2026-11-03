'use strict';
// Explicit, bounded passive research. Never request/apply a build or infer a
// remote player's build from our own EP/glyph messages or appearance bytes.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),timers=require('timers');
const NAMES=['C_SET_TARGET_INFO','C_REQUEST_USER_PAPERDOLL_INFO','C_REQUEST_USER_PAPERDOLL_INFO_WITH_GAMEID','S_USER_PAPERDOLL_INFO','S_SHOW_USER_EP_INFO','S_SHOW_CREST_LEARN','C_LOAD_EP_INFO','S_LOAD_EP_INFO','S_CREST_INFO','S_CREST_APPLY','S_LEARN_EP_PERK','TTB_S_LOAD_EP_PAGE'];
const OWN=new Set(['S_LOAD_EP_INFO','S_CREST_INFO','S_CREST_APPLY','S_LEARN_EP_PERK','TTB_S_LOAD_EP_PAGE']);
module.exports=function PlayerBuildInspect(mod,root,current){
 let active=false,closed=false,report=null,file=null,timer=null,saveTimer=null;const hooks=[],available={};
 function flush(){if(saveTimer){timers.clearTimeout(saveTimer);saveTimer=null;}if(file&&report)fs.writeFileSync(file,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');return file;}
 function stop(reason='manual'){active=false;if(timer)timers.clearTimeout(timer);timer=null;if(report)report.stopped={at:Date.now(),reason};return flush();}
 function accept(name,opcode,bytes,incoming,fake){
  if(!active||closed||fake||!Buffer.isBuffer(bytes))return;
  if(report.records.length>=128||report.bytes+bytes.length>1024*1024){stop('limit');return;}
  if(bytes.length>128*1024){report.oversized++;return;}
  const item={name,opcode,incoming:!!incoming,at:Date.now(),ownCharacter:current(),origin:OWN.has(name)?'own-character-data':'inspection-unclassified',modified:!!bytes.$modified,silenced:!!bytes.$silenced,packetBase64:bytes.toString('base64')};
  if(['C_REQUEST_USER_PAPERDOLL_INFO','C_REQUEST_USER_PAPERDOLL_INFO_WITH_GAMEID','C_SET_TARGET_INFO','S_USER_PAPERDOLL_INFO'].includes(name)){
   const version=name==='S_USER_PAPERDOLL_INFO'?11:name==='C_SET_TARGET_INFO'?1:3;
   try{const e=mod.dispatch.fromRaw(name,version,bytes);item.identity={name:e.name,gameId:e.gameId===undefined?undefined:String(e.gameId),target:e.target===undefined?undefined:String(e.target),serverId:e.serverId,playerId:e.playerId,templateId:e.templateId,level:e.level,talentLevel:e.talentLevel};}catch(e){item.decodeError=String(e.message||e).slice(0,100);}
  }
  report.records.push(item);report.bytes+=bytes.length;
  if(!saveTimer)saveTimer=timers.setTimeout(()=>{saveTimer=null;try{flush();}catch(_){active=false;}},300);
 }
 for(const name of NAMES){try{hooks.push(mod.hook(name,'raw',{order:-9000,filter:{fake:false,modified:null,silenced:null}},(opcode,bytes,incoming,fake)=>{try{accept(name,opcode,bytes,incoming,fake);}catch(_){active=false;}return undefined;}));available[name]=true;}catch(_){available[name]=false;}}
 return {start(){if(closed)throw Error('reader-closed');if(report)stop('new-session');const dir=path.join(root,'logs');fs.mkdirSync(dir,{recursive:true});const stat=fs.lstatSync(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('invalid-log-directory');file=path.join(dir,'player-inspect-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex')+'.json');report={format:'controls-player-build-inspection',version:1,createdAt:Date.now(),environment:{majorPatch:mod.majorPatchVersion,minorPatch:mod.minorPatchVersion,protocol:mod.dispatch.protocolVersion},availablePackets:available,records:[],bytes:0,oversized:0,scope:'Passive inspection packets only. Own glyph/EP events are labelled separately and never attributed to another player. No gameplay requests or restoration.'};active=true;timer=timers.setTimeout(()=>stop('time-limit'),8*60*1000);flush();return file;},report:flush,stop,close(){if(closed)return;closed=true;stop('unload');for(const h of hooks)mod.unhook(h);}};
};
