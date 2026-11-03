'use strict';
// Use the Toolbox's existing per-connection integrity pipeline. Never copy a captured counter/hash.
const fs=require('fs'),path=require('path');
const NAME='C_LEARN_EP_PERK',VERSION=10002,KEY=Symbol.for('emilia-s2.controls-profile.ep-wire.v1');
const DEF='array perks\n- uint32 id\n- uint32 level\n';
function deferred(mod){
 const info=mod.clientInterface&&mod.clientInterface.info;
 if(!info||typeof info.path!=='string')return false;
 // The separately maintained Phoenix client has its own launcher/cache marker.
 // This exception is independent of TERA.exe: Astrix and Phoenix share that binary.
 const root=path.resolve(info.path,'..');
 return fs.existsSync(path.join(root,'.phoenix-client-cache.lock'))||/(?:^|[\\/])Phoenix-Launcher(?:[\\/]|$)/i.test(root);
}
function verified(mod){
 const info=mod.clientInterface&&mod.clientInterface.info;
 if(!info||info.arch!=='x64'||typeof info.path!=='string'||!path.isAbsolute(info.path)||mod.majorPatchVersion!==100||mod.minorPatchVersion!==2||mod.dispatch.protocolVersion!==376012||typeof mod.dispatch.addDefinition!=='function'||typeof mod.dispatch.addOpcode!=='function'||deferred(mod))return false;
 // Packet compatibility follows the standard patch/protocol, not server name,
 // installation drive or distribution-specific executable hashes.
 try{return fs.statSync(path.join(info.path,'TERA.exe')).isFile();}catch(_){return false;}
}
function configure(mod,options={}){
 const d=mod.dispatch,c=d&&d.connection,code=d&&d.protocolMap&&d.protocolMap.name.get(NAME);
 let reason=deferred(mod)?'ep-phoenix-deferred':'ep-client-not-validated',owner=null;
 if(c&&code===20840&&(options.verifyBuild||verified)(mod)){
  owner=c[KEY];
  if(!owner){owner={version:1,code,armed:false,integrity:null,reason:'ep-fresh-connection-required'};c[KEY]=owner;}
  if(owner.version!==1||owner.code!==code)owner=null;
  if(owner&&!owner.armed&&c.integrity===null){try{arm();}catch(_){owner.reason='ep-wire-unavailable';}}
  if(owner)reason=owner.reason;
 }
 function arm(){
  if(d.protocolMap.padding[code]&&!owner.armed)throw Error('ep-wire-conflict');
  const before=d.protocolMap.padding[code];
  d.addOpcode(NAME,code,true);
  try{d.addDefinition(NAME,VERSION,path.join(__dirname,'..','protocol','C_LEARN_EP_PERK.10002.def'),true);}
  catch(e){d.addOpcode(NAME,code,before);throw e;}
  owner.armed=true;
 }
 function fresh(){
  if(!owner)return;
  const i=c.integrity;
  if(!i||typeof i.apply!=='function'||!Array.isArray(i.counters)||i.counters[code]!==0||!Number.isInteger(i.iv)){owner.reason='ep-wire-unavailable';return;}
  try{if(!owner.armed)arm();owner.integrity=i;owner.reason=null;}catch(_){owner.reason='ep-wire-unavailable';}
 }
 function ready(){return !!owner&&owner.armed&&owner.integrity===c.integrity&&!!c.integrity&&Number.isInteger(c.integrity.iv)&&Array.isArray(c.integrity.counters)&&Number.isInteger(c.integrity.counters[code])&&d.protocolMap.padding[code]===true;}
 if(owner&&owner.armed&&owner.integrity===c.integrity&&c.integrity)reason=null;
 return {fresh,ready,reason:()=>ready()?null:owner?owner.reason||'ep-fresh-connection-required':reason,
  send(perks){
   if(!ready())throw Error(this.reason());
   if(!Array.isArray(perks)||!perks.length||perks.length>512||perks.some(p=>!Number.isSafeInteger(p.id)||p.id<1||!Number.isSafeInteger(p.level)||p.level<1))throw Error('ep-invalid-request');
   // A successful serialization is not proof of a server write. Dispatch can
   // return false when another hook blocks a packet; Connection also skips
   // writes on a closed socket. Check both without retrying or changing it.
   if(c.state!==2||!c.serverConnection||c.serverConnection.destroyed)throw Error('ep-connection-unavailable');
   const before=c.integrity.counters[code],accepted=mod.toServer(NAME,VERSION,{perks});
   if(accepted!==true)throw Error('ep-send-blocked');
   const after=c.integrity.counters[code];
   if(after!==before+1)throw Error('ep-send-unconfirmed');
   return {accepted:true,counterBefore:before,counterAfter:after};
  },
  // Do not revert this mapping on hot-reload/unload. The core must keep normalizing
  // subsequent native EP requests until the connection ends, preserving its counter.
  version:VERSION};
}
module.exports={configure,verified,deferred,NAME,VERSION,DEF};
