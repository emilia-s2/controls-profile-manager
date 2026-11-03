'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),timers=require('timers');
const P=require('./ep-pages'),{sameCharacter}=require('./engine');
class EPController {
 constructor(mod,root,current,notify,update,options={}){
  this.mod=mod;this.root=root;this.current=current;this.notify=notify;this.update=update;this.now=options.now||Date.now;
  this.wire=options.wire||require('./ep-wire').configure(mod);this.ackTimeout=options.ackTimeout||8000;this.raw=null;this.preview=null;this.pending=null;this.closed=false;this.querying=false;this.catalogs=new Map();this.hooks=[];this.revision=0;this.ambiguous=false;
  const hook=(name,version,cb)=>{try{this.hooks.push(mod.hook(name,version,{order:-7000,filter:{fake:false,modified:false,silenced:false}},e=>{if(this.closed)return;try{cb(e);}catch(_){this.preview=null;if(this.raw)this.raw.uncertain=true;if(this.pending)this.finish('Os dados de EP não puderam ser validados. Entre novamente no personagem antes de continuar.',true);this.update();}}));}catch(_){} };
  hook('S_LOGIN_ACCOUNT_INFO',3,()=>{this.wire.fresh();this.update();});
  hook('S_LOGIN',mod.majorPatchVersion>=114?15:14,()=>this.login());
  hook('S_LOAD_EP_INFO',2,e=>this.initial(e));
  hook('TTB_S_LOAD_EP_PAGE',1,e=>this.page(e));
  hook('S_LEARN_EP_PERK',1,e=>this.learn(e));
  // Local evidence for the user's explicit application only. Observe even a
  // blocked/modified response; never treat those flags as a server confirmation.
  try{this.hooks.push(mod.hook('S_LEARN_EP_PERK','raw',{order:-9000,filter:{fake:false,modified:null,silenced:null}},(opcode,bytes)=>{
   if(this.pending&&Buffer.isBuffer(bytes))this.record(this.pending,{type:'server-response-observed',length:bytes.length,modified:!!bytes.$modified,silenced:!!bytes.$silenced,packetBase64:bytes.length<=32768?bytes.toString('base64'):null});
  }));}catch(_){}
  hook('S_RESET_EP_PERK',1,e=>{if(e.success&&this.ready()){if(this.pending)this.finish('O jogo confirmou um reset manual. Revise os EP novamente.',false);this.raw.pages.clear();this.raw.uncertain=true;this.raw.resetObserved=true;this.changed();}});
  hook('S_CHANGE_EP_POINT',1,e=>{if(this.ready()&&P.integer(e.totalPoints,0,10000000)){this.raw.totalPoints=e.totalPoints;this.changed();}});
  hook('S_PLAYER_CHANGE_EP',1,e=>{if(this.ready()&&P.integer(e.level,0,10000000)&&P.integer(e.totalPoints,0,10000000)){this.raw.epLevel=e.level;this.raw.totalPoints=e.totalPoints;this.changed();}});
  try{this.hooks.push(mod.hook('C_LEARN_EP_PERK','raw',{order:-7000,filter:{fake:false,modified:false,silenced:false}},()=>{if(this.pending){this.finish('Houve uma alteração manual de EP durante a aplicação. Confira a distribuição no jogo antes de tentar novamente.',true);this.ambiguous=true;}return undefined;}));}catch(_){}
 }
 changed(){this.revision++;this.preview=null;this.update();}
 login(){if(this.pending)this.finish('Aplicação de EP interrompida pela troca de personagem. Confira os pontos no jogo.',true);const meta=this.current();if(this.raw&&sameCharacter(this.raw.meta,meta)){this.raw.ready=false;}else this.raw=null;this.preview=null;this.ambiguous=false;this.changed();}
 ready(){return !!this.raw&&this.raw.ready&&sameCharacter(this.raw.meta,this.current())&&this.mod.game.isIngame!==false;}
 initial(e){
  if(!P.integer(e.totalPoints,0,10000000)||!P.integer(e.usedPoints,0,e.totalPoints)||!P.integer(e.level,0,10000000)||!P.integer(e.activePreset,0,4)||!P.integer(e.numUnlockedAdditionalPresets,0,4)||e.activePreset>e.numUnlockedAdditionalPresets)throw Error('ep-invalid-info');
  const rows=P.perks(e.perks,true),meta=this.current(),pages=this.raw&&sameCharacter(this.raw.meta,meta)?this.raw.pages:new Map();
  if(this.pending)this.finish('Os dados de EP foram recarregados. Revise novamente antes de aplicar.',false);
  pages.set(e.activePreset,{perks:rows,usedPoints:e.usedPoints,at:this.now()});this.raw={meta:Object.assign({},meta),ready:true,totalPoints:e.totalPoints,epLevel:e.level,activePreset:e.activePreset,unlockedPages:e.numUnlockedAdditionalPresets+1,pages,uncertain:false};this.ambiguous=false;this.changed();
 }
 page(e){
  if(!this.ready())return;if(!P.integer(e.activePreset,0,4)||!P.integer(e.numUnlockedAdditionalPresets,0,4)||e.activePreset>e.numUnlockedAdditionalPresets||!P.integer(e.usedPoints,0,this.raw.totalPoints))throw Error('ep-invalid-page');
  const rows=P.perks(e.perks,true);if(this.pending){this.finish('A página de EP mudou durante a aplicação. Entre novamente no personagem para conferir os dados antes de continuar.',true);this.ambiguous=true;}
  this.raw.activePreset=e.activePreset;this.raw.unlockedPages=e.numUnlockedAdditionalPresets+1;this.raw.pages.set(e.activePreset,{perks:rows,usedPoints:e.usedPoints,at:this.now()});if(this.raw.resetObserved){this.raw.uncertain=false;this.raw.resetObserved=false;}this.changed();
 }
 learn(e){
  if(!this.ready()||this.ambiguous)return;
  if(this.pending)this.record(this.pending,{type:'server-response-decoded',success:e.success===true,usedPoints:e.usedPoints,perks:Array.isArray(e.perks)&&e.perks.length<=512?e.perks:null});
  if(!e.success){if(this.pending)this.finish('O servidor recusou os EP. O mod não repetirá o pedido; confira os pontos no jogo.',false);return;}
  if(!P.integer(e.usedPoints,0,this.raw.totalPoints))throw Error('ep-invalid-confirmation');const rows=P.perks(e.perks,true),pending=this.pending;
  this.raw.pages.set(this.raw.activePreset,{perks:rows,usedPoints:e.usedPoints,at:this.now()});this.raw.uncertain=false;this.raw.resetObserved=false;this.changed();
  if(pending){const matches=pending.targetPage===this.raw.activePreset&&sameCharacter(pending.meta,this.current())&&e.usedPoints===pending.plan.targetCost&&P.digest(rows)===P.digest(pending.plan.desired);this.finish(matches?'EP aplicados e confirmados pelo servidor na página '+(this.raw.activePreset+1)+'.':'O servidor respondeu com uma distribuição diferente da revisão. Confira os EP no jogo; nenhum novo pedido será enviado.',false);}
 }
 record(attempt,event){
  if(!attempt||!attempt.journal||!attempt.journalFile)return;
  attempt.journal.events.push(Object.assign({at:this.now()},event));
  if(attempt.journal.events.length>32)attempt.journal.events.shift();
  const file=attempt.journalFile,tmp=file+'.tmp';
  try{const fd=fs.openSync(tmp,'wx');try{fs.writeFileSync(fd,JSON.stringify(attempt.journal,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
  catch(_){try{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}catch(_){} }
 }
 finish(message,uncertain){const p=this.pending;if(p){timers.clearTimeout(p.timer);this.record(p,{type:'finished',message,uncertain:!!uncertain,observed:this.ready()?this.raw.pages.get(this.raw.activePreset):null});}this.pending=null;this.preview=null;if(this.raw&&uncertain)this.raw.uncertain=true;this.notify(message);this.update();}
 export(){if(!this.ready()||this.raw.uncertain)return null;const r=this.raw;return P.create(r.meta.class,r.unlockedPages,[...r.pages].filter(([index])=>index<r.unlockedPages).map(([index,p])=>({index,perks:p.perks})));}
 snapshot(){if(!this.raw)return null;return {version:1,meta:Object.assign({},this.raw.meta),ready:this.raw.ready,totalPoints:this.raw.totalPoints,epLevel:this.raw.epLevel,activePreset:this.raw.activePreset,unlockedPages:this.raw.unlockedPages,uncertain:this.raw.uncertain||!!this.pending,pages:[...this.raw.pages].map(([index,p])=>({index,usedPoints:p.usedPoints,perks:p.perks,at:p.at}))};}
 restore(s){
  if(!s||s.version!==1||!sameCharacter(s.meta,this.current())||!P.integer(s.totalPoints,0,10000000)||!P.integer(s.epLevel,0,10000000)||!P.integer(s.unlockedPages,1,5)||!P.integer(s.activePreset,0,s.unlockedPages-1)||!Array.isArray(s.pages)||s.pages.length>s.unlockedPages)return false;
  try{const pages=new Map();for(const p of s.pages){if(!P.integer(p.index,0,s.unlockedPages-1)||pages.has(p.index)||!P.integer(p.usedPoints,0,s.totalPoints)||!P.integer(p.at,0,this.now()))return false;pages.set(p.index,{perks:P.perks(p.perks),usedPoints:p.usedPoints,at:p.at});}if(!pages.has(s.activePreset))return false;this.raw={meta:Object.assign({},s.meta),ready:s.ready===true,totalPoints:s.totalPoints,epLevel:s.epLevel,activePreset:s.activePreset,unlockedPages:s.unlockedPages,pages,uncertain:s.uncertain===true};return true;}catch(_){return false;}
 }
 state(){const r=this.ready()?this.raw:null,p=r&&r.pages.get(r.activePreset);return {ready:!!p,totalPoints:r?r.totalPoints:null,usedPoints:p?p.usedPoints:null,activePage:r?r.activePreset:null,unlockedPages:r?r.unlockedPages:null,receivedPages:r?r.pages.size:0,wireReady:this.wire.ready(),wireReason:this.wire.reason(),uncertain:r?r.uncertain:false,busy:!!this.pending||this.querying,phase:this.pending?'confirming':this.querying?'query':'idle',preview:this.preview?this.preview.public:null};}
 fingerprint(){if(!this.ready()||this.raw.uncertain)throw Error('ep-current-unavailable');const r=this.raw,p=r.pages.get(r.activePreset);if(!p)throw Error('ep-current-unavailable');return P.digest({meta:this.current(),page:r.activePreset,total:r.totalPoints,used:p.usedPoints,perks:p.perks,level:r.epLevel,userLevel:this.mod.game.me.level,revision:this.revision});}
 async query(ids){
  const missing=ids.filter(id=>!this.catalogs.has(id));
  for(let n=0;n<missing.length;n+=32){if(this.closed)throw Error('ep-reader-closed');const batch=missing.slice(n,n+32);let timer;
   let rows;try{rows=await Promise.race([Promise.resolve().then(()=>this.mod.queryData('/EpPerk/Perk@id=?/',[batch],true,true)),new Promise((_,reject)=>{timer=timers.setTimeout(()=>reject(Error('ep-catalog-unavailable')),6000);})]);}finally{timers.clearTimeout(timer);}
   if(!Array.isArray(rows)||rows.length>16000||JSON.stringify(rows).length>3*1024*1024)throw Error('ep-catalog-unavailable');P.catalog(rows);
   for(const row of rows)if(!batch.includes(row.attributes.id))throw Error('ep-invalid-catalog');
   for(const id of batch)this.catalogs.set(id,rows.filter(row=>row.attributes.id===id));
  }
  const rows=ids.reduce((out,id)=>out.concat(this.catalogs.get(id)||[]),[]);return P.catalog(rows);
 }
 async review(profile,sourcePage){
  if(this.closed||this.pending||this.querying)throw Error('ep-busy');
  if(!this.wire.ready())throw Error(this.wire.reason());
  if(!this.ready()||this.raw.uncertain)throw Error('ep-current-unavailable');
  if(profile.source.class!==this.current().class)throw Error('ep-class-mismatch');
  if(!profile.ep)throw Error('ep-profile-missing');const ep=P.validate(profile.ep,profile.source.class),source=ep.pages.find(p=>p.index===sourcePage);if(!source)throw Error('ep-page-missing');
  const before=this.fingerprint(),revision=this.revision,meta=this.current();this.preview=null;this.querying=true;this.update();
  try{const current=this.raw.pages.get(this.raw.activePreset),ids=[...new Set(source.perks.concat(current.perks).map(p=>p.id))];const cat=await this.query(ids);
   if(this.closed||this.revision!==revision||this.fingerprint()!==before)throw Error('ep-review-stale');
   const plan=P.plan(source.perks,{class:meta.class,totalPoints:this.raw.totalPoints,usedPoints:current.usedPoints,epLevel:this.raw.epLevel,userLevel:this.mod.game.me.level,perks:current.perks},cat);
   const token=crypto.randomBytes(16).toString('hex');this.preview={token,profileId:profile.id,epHash:profile.ep.sha256,sourcePage,targetPage:this.raw.activePreset,meta:Object.assign({},meta),fingerprint:before,expiresAt:this.now()+120000,plan,public:{token,profileId:profile.id,name:profile.name,sourcePage,targetPage:this.raw.activePreset,talents:plan.changes.length,levels:plan.levelsAdded,cost:plan.additionalCost,targetCost:plan.targetCost,remaining:plan.remaining}};
   return this.preview.public;
  }finally{this.querying=false;this.update();}
 }
 confirm(profile,token,sourcePage){
  const p=this.preview;
  if(this.closed||this.pending||this.querying||!p||p.token!==token||p.profileId!==profile.id||p.sourcePage!==sourcePage||!profile.ep||p.epHash!==profile.ep.sha256||this.now()>p.expiresAt||p.fingerprint!==this.fingerprint()||!sameCharacter(p.meta,this.current()))throw Error('ep-review-stale');
  P.validate(profile.ep,profile.source.class);if(!this.wire.ready())throw Error(this.wire.reason());
  const directory=path.join(this.root,'backups');fs.mkdirSync(directory,{recursive:true});if(!fs.lstatSync(directory).isDirectory()||fs.lstatSync(directory).isSymbolicLink())throw Error('ep-backup-failed');
  const file=path.join(directory,'ep-before-'+this.now()+'-'+crypto.randomBytes(6).toString('hex')+'.json');
  const backup={format:'controls-ep-before-application',version:1,at:this.now(),source:this.current(),profileId:profile.id,sourcePage,targetPage:p.targetPage,totalPoints:this.raw.totalPoints,before:this.raw.pages.get(p.targetPage),requested:p.plan.desired,note:'Registro anterior. EP confirmados exigem reset manual para diminuir; este arquivo não desfaz pontos automaticamente.'};
  const fd=fs.openSync(file,'wx');try{fs.writeFileSync(fd,JSON.stringify(backup,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  const logdir=path.join(this.root,'logs');fs.mkdirSync(logdir,{recursive:true});if(!fs.lstatSync(logdir).isDirectory()||fs.lstatSync(logdir).isSymbolicLink())throw Error('ep-backup-failed');
  const journalFile=path.join(logdir,path.basename(file).replace('ep-before-','ep-application-'));
  const journal={format:'controls-ep-application',version:1,createdAt:this.now(),source:this.current(),sourcePage,targetPage:p.targetPage,totalPoints:this.raw.totalPoints,targetCost:p.plan.targetCost,additionalCost:p.plan.additionalCost,requested:p.plan.changes,backup:path.basename(file),events:[]};
  fs.writeFileSync(journalFile,JSON.stringify(journal,null,2)+'\n',{flag:'wx'});
  this.preview=null;const pending=Object.assign({},p,{backup:file,timer:null,journal,journalFile});this.pending=pending;
  this.record(pending,{type:'confirmed-by-user'});
  pending.timer=timers.setTimeout(()=>{if(this.pending===pending)this.finish('O servidor ainda não confirmou os EP. Não repita a aplicação; confira os pontos ao entrar novamente no personagem.',true);},this.ackTimeout);
  this.update();
  try{const result=this.wire.send(p.plan.changes);this.record(pending,{type:'dispatch-returned',result:result||null});}
  catch(e){this.record(pending,{type:'dispatch-error',reason:String(e.message||e).slice(0,160)});if(this.pending===pending)this.finish('Não foi possível confirmar o envio dos EP. Confira os pontos ao entrar novamente no personagem antes de tentar outra aplicação.',true);throw e;}
 }
 cancel(){if(this.pending)throw Error('ep-busy');this.preview=null;this.revision++;this.update();}
 close(){this.closed=true;if(this.pending)timers.clearTimeout(this.pending.timer);this.pending=null;this.preview=null;for(const h of this.hooks)this.mod.unhook(h);}
}
module.exports={EPController};
