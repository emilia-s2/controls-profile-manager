'use strict';
window.EPPanel=class EPPanel {
 constructor(send){this.send=send;this.data=null;this.invalid=new Set();this.el=id=>document.getElementById(id);
  this.el('ep-profile').onchange=()=>{this.discard();this.render();};this.el('ep-page').onchange=()=>{this.discard();this.render();};
  this.el('ep-review').onclick=()=>{this.el('ep-review').disabled=true;send('ep-review',{id:this.el('ep-profile').value,page:Number(this.el('ep-page').value)});};
  this.el('ep-cancel').onclick=()=>this.discard();
  this.el('ep-confirm').onclick=()=>{const e=this.data&&this.data.ep,p=e&&e.preview;if(!p||this.el('ep-confirm').disabled)return;this.el('ep-confirm').disabled=true;send('ep-confirm',{id:this.el('ep-profile').value,page:Number(this.el('ep-page').value),token:p.token});};
 }
 discard(){const p=this.data&&this.data.ep&&this.data.ep.preview;if(p){this.invalid.add(p.token);if(this.invalid.size>32)this.invalid.delete(this.invalid.values().next().value);}this.el('ep-review-card').hidden=true;this.el('ep-confirm').disabled=true;this.send('ep-cancel');}
 update(data){this.data=data;this.render();}
 render(){
  if(!this.data)return;const data=this.data,e=data.ep||{},profiles=data.profiles.filter(p=>p.hasEp),select=this.el('ep-profile'),old=select.value;
  UIText.text(select, '');for(const p of profiles){const o=document.createElement('option');o.value=p.id;UIText.text(o, p.name+' — '+p.character, true);select.appendChild(o);}if(profiles.some(p=>p.id===old))select.value=old;
  if(!profiles.length){const o=document.createElement('option');o.value='';UIText.text(o, 'Nenhum perfil com EP salvo');select.appendChild(o);}
  const p=profiles.find(p=>p.id===select.value),pages=this.el('ep-page'),prior=pages.value;UIText.text(pages, '');
  for(const page of p?p.epPages:[]){const o=document.createElement('option');o.value=String(page.index);UIText.text(o, 'Página '+(page.index+1)+' · '+page.talents+' talentos');pages.appendChild(o);}if(p&&p.epPages.some(p=>String(p.index)===prior))pages.value=prior;else if(p&&p.epPages.some(p=>p.index===e.activePage))pages.value=String(e.activePage);
  const busy=!!e.busy||!!data.pending||!!data.savePending;
  select.disabled=busy;pages.disabled=busy||!p;
  this.el('ep-review').disabled=busy||!p||!e.ready||!e.wireReady||!!e.uncertain;
  UIText.text(this.el('ep-received'), e.ready?'EP recebidos: '+e.receivedPages+' de '+e.unlockedPages+' páginas. Página ativa: '+(e.activePage+1)+'. Pontos: '+e.usedPoints+' de '+e.totalPoints+' usados.':'Aguardando os EP do personagem. Entre novamente no personagem para receber os dados.');
  UIText.text(this.el('ep-save-help'), 'Para incluir EP em um novo perfil, visite na janela EP do TERA cada página que deseja guardar e depois salve o perfil acima. O mod guarda somente as páginas recebidas; ele não troca páginas por você.');
  let status='Escolha o perfil e uma página salva. Os EP serão aplicados somente na página que está ativa no TERA.';
  if(!e.wireReady)status=e.wireReason==='ep-phoenix-deferred'?'A aplicação de EP no Phoenix será validada separadamente. Teclas, barras e glifos continuam disponíveis.':e.wireReason==='ep-fresh-connection-required'?'Para habilitar a aplicação recém-instalada, feche e reabra apenas o TERA uma vez com o Toolbox aberto.':'A aplicação de EP ainda não foi validada para este cliente. Teclas, barras e glifos continuam disponíveis.';
  else if(e.uncertain)status='A aplicação anterior ainda precisa ser conferida. Entre novamente no personagem antes de tentar outra.';
  else if(e.busy)status=e.phase==='confirming'?'Aguardando a confirmação de EP do servidor.':'Consultando os custos e requisitos dos EP…';
  UIText.text(this.el('ep-status'), status);
  const review=e.preview,visible=review&&!this.invalid.has(review.token)&&review.profileId===select.value&&review.sourcePage===Number(pages.value)&&!busy;
  this.el('ep-review-card').hidden=!visible;this.el('ep-confirm').disabled=!visible;
  if(visible){UIText.text(this.el('ep-description'), '“'+review.name+'” · página salva '+(review.sourcePage+1)+' → página ativa '+(review.targetPage+1)+' do personagem '+data.character+'.');UIText.text(this.el('ep-details'), review.levels+' níveis a acrescentar em '+review.talents+' talentos. Custo: '+review.cost+' EP. Total após aplicar: '+review.targetCost+'. Restarão '+review.remaining+' pontos.');UIText.text(this.el('ep-confirm'), 'Aplicar '+review.cost+' EP agora');}
 }
};
