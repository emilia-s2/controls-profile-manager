'use strict';
const path = require('path');
const { Recorder, PACKETS, DURATION } = require('./lib/recorder');
const { Store, validMeta } = require('./lib/store');
const { Engine, sameCharacter } = require('./lib/engine');
const timers = require('timers');
const Locale=require('./lib/i18n'),Preferences=require('./lib/preferences');
const ERRORS = {
    'ep-connection-unavailable':'A conexão com o servidor não está pronta para enviar EP. Nenhum pedido foi enviado.',
    'ep-send-blocked':'O Toolbox não encaminhou o pedido de EP. O registro local foi salvo; o mod não repetirá o envio.',
    'ep-send-unconfirmed':'Não foi possível comprovar o encaminhamento do pedido de EP. O registro local foi salvo; confira os pontos no jogo antes de continuar.',
    'ep-phoenix-deferred':'A aplicação de EP no Phoenix será validada separadamente. As outras funções continuam disponíveis.',
    "ep-client-not-validated": "A aplicação de EP ainda não foi validada para este cliente. As outras funções continuam disponíveis.",
    "ep-fresh-connection-required": "Para habilitar o envio de EP recém-instalado, feche e reabra apenas o TERA uma vez com o Toolbox aberto. Não use poção para isso.",
    "ep-wire-unavailable": "O envio de EP não pôde ser preparado nesta sessão. Nenhum ponto foi enviado.",
    "ep-wire-conflict": "O formato do envio de EP não pôde ser preparado nesta sessão. Nenhum ponto foi enviado.",
    "ep-current-unavailable": "Ainda não há uma distribuição de EP confirmada para revisar. Entre novamente no personagem e visite a página desejada na janela EP.",
    "ep-profile-missing": "Este perfil não contém EP. Visite as páginas que deseja guardar e salve um novo perfil.",
    "ep-page-missing": "Esta página de EP não está no perfil salvo.",
    "ep-class-mismatch": "Os EP exigem a mesma classe do perfil salvo.",
    "ep-reset-required": "A página atual tem talentos acima ou fora do perfil. Para reproduzi-lo, faça o reset manualmente antes. O mod não usa poções.",
    "ep-insufficient-points": "Os pontos disponíveis não bastam para reproduzir esta página de EP. Nenhum ponto foi enviado.",
    "ep-requirements-not-met": "O personagem ainda não atende aos requisitos dos EP salvos. Nenhum ponto foi enviado.",
    "ep-talent-unavailable": "Um talento ou nível salvo não está disponível no catálogo deste cliente. Nenhum ponto foi enviado.",
    "ep-cost-mismatch": "Os custos locais não correspondem aos pontos confirmados pelo servidor. Nenhum ponto foi enviado.",
    "ep-catalog-unavailable": "Não foi possível consultar os custos dos talentos de EP. Nenhum ponto foi enviado.",
    "ep-invalid-catalog": "O catálogo de EP não pôde ser validado. Nenhum ponto foi enviado.",
    "ep-unknown-condition": "Há um requisito de EP não reconhecido neste cliente. Nenhum ponto foi enviado.",
    "ep-already-matches": "A página ativa já corresponde aos EP desta página do perfil.",
    "ep-review-stale": "A revisão dos EP mudou ou expirou. Confira o perfil e a página, e revise novamente.",
    "ep-busy": "Aguarde a consulta ou a confirmação atual dos EP antes de iniciar outra ação.",
    "ep-invalid-profile": "Os dados de EP deste perfil não passaram na validação. Nenhum ponto foi enviado."
,
    'current-settings-unavailable': 'Ainda não recebi as configurações deste personagem. Volte à seleção e entre nele novamente.',
    'learned-skills-unavailable': 'Ainda não recebi a lista de habilidades. Volte à seleção e entre novamente antes de revisar as barras.',
    'class-mismatch': 'As barras e páginas de glifos exigem a mesma classe do perfil salvo. Você ainda pode escolher Somente teclas.',
    'known-glyphs-unavailable':'Ainda não recebi os glifos disponíveis deste personagem. Volte à seleção e entre novamente antes de revisar os glifos.',
    'no-compatible-glyphs':'Nenhum glifo salvo no perfil está disponível neste personagem. As páginas atuais foram preservadas. Tente novamente quando o jogo liberar os glifos correspondentes.',
    'glyph-catalog-unavailable':'Aguarde a consulta do catálogo de glifos deste cliente e revise novamente. Teclas e barras podem ser escolhidas separadamente.',
    'glyph-points-unavailable':'Ainda não recebi o limite de pontos de glifos deste personagem. Volte à seleção e entre nele novamente uma vez.',
    'glyph-points-insufficient':'Nenhum glifo disponível do perfil cabe no limite de pontos atual. As páginas foram preservadas.',
    'backup-glyph-points-unavailable':'O conjunto de glifos do backup não cabe no limite de pontos atual. Nenhuma reversão foi preparada.',
    'profile-has-no-glyphs':'Este perfil antigo não contém páginas de glifos. Salve um novo perfil para incluí-las; teclas e barras continuam disponíveis.',
    'unsupported-glyph-schema':'O formato das páginas de glifos não foi reconhecido. Nenhuma aplicação foi preparada.',
    'glyphs-changed':'A lista de glifos disponíveis mudou. Revise o perfil novamente.',
    'unsupported-protocol': 'Esta versão requer dados compatíveis com 100.2, protocolo 376012. Nenhuma configuração foi aplicada.',
    'already-matches': 'Os dados recebidos já correspondem ao perfil nas opções escolhidas.',
    'settings-changed': 'As configurações mudaram desde a revisão. Revise o perfil novamente antes de preparar.',
    'skills-changed': 'A lista de habilidades mudou. Revise o perfil novamente.',
    'preview-expired': 'A revisão expirou. Escolha o perfil e revise novamente.',
    'review-selection-changed':'O perfil ou a opção mudou desde a revisão. Clique em Revisar aplicação novamente antes de preparar.',
    'pending-expired-or-wrong-character': 'Preparação cancelada: prazo encerrado ou personagem diferente.',
    'backup-unavailable': 'Não há backup válido deste personagem para desfazer.',
    'backup-glyphs-unavailable':'Alguns glifos do backup não estão disponíveis neste personagem agora. Nenhuma reversão foi preparada.',
    'no-compatible-skills': 'Nenhuma habilidade do perfil foi confirmada na lista deste personagem.',
    'invalid-name-or-character': 'Entre com o personagem e informe um nome de perfil de até 80 caracteres.',
    'pending-exists': 'Há uma aplicação ou salvamento preparado. Conclua ou cancele antes de iniciar outra ação.'
};
module.exports = function ControlsProfile(mod) {
    Preferences.initialize(mod,__dirname);
    const log=text=>mod.log(Locale.translate(Locale.resolve(mod),text));
    const logError=text=>mod.error(Locale.translate(Locale.resolve(mod),text));
    const store = new Store(__dirname), engine = new Engine(store);
    const availablePackets = {}, hooks = [];
    const environment = { majorPatch: mod.majorPatchVersion, minorPatch: mod.minorPatchVersion,
        protocol: mod.dispatch.protocolVersion, publisher: mod.publisher, platform: mod.platform, availablePackets };
    let recorder = new Recorder(path.join(__dirname, 'logs'), environment);
    let lastIdentity = null, panel = null, feedback = 'Aguardando configurações do personagem.', disposed = false;
    let listingCache = null, disposeGuiShortcut = () => {};
    let glyphInspectionBusy = false;
    let epInspector = null, epNativeInspector = null, ep = null, playerInspector = null;
    const catalogRequests=new Map(),catalogAttempts=new Map();
    function loadCatalog(meta=current()) {
        const job=meta.class;if(disposed||typeof mod.queryData!=='function'||typeof job!=='string'||!job||job.length>60||engine.catalogs.has(job)||catalogRequests.has(job))return;
        if(Date.now()-(catalogAttempts.get(job)||0)<8000)return;catalogAttempts.set(job,Date.now());
        const request=require('./lib/glyph-catalog').query(mod,job).then(result=>{if(!disposed){const pending=engine.pending;engine.setGlyphCatalog(result.rows,{class:job});if(pending&&!engine.pending){clearPendingTimer();notify('Preparação cancelada: o catálogo de glifos mudou. Revise novamente.');}else update();}}).catch(e=>{if(!disposed)log('Controls Profile: catálogo de glifos indisponível nesta consulta: '+String(e.message||e).slice(0,100));}).finally(()=>{catalogRequests.delete(job);});
        catalogRequests.set(job,request);
    }
    let saveRequest = null, saveRequestTimer = null;
    let saveTimer = null, expiryTimer = null, pendingTimer = null;
    const modeName=value=>({keys:'somente teclas',bars:'somente habilidades nas barras',both:'teclas e barras',glyphs:'somente páginas de glifos',all:'teclas, barras e glifos','keys-glyphs':'teclas e glifos','bars-glyphs':'barras e glifos'}[value]||'opções escolhidas');
    function audit(type,selection=null,details={}) { if(recorder.recordAction(type,selection,current(),details))schedule(); }
    function current() {
        const game = mod.game, me = game.me || {};
        return { character: me.name || null, playerId: me.playerId, templateId: me.templateId, class: me.class,
            serverId: game.serverId, protocol: environment.protocol, majorPatch: environment.majorPatch, minorPatch: environment.minorPatch };
    }
    function captureIdentity(incoming) {
        const meta = current();
        if (validMeta(meta)) { lastIdentity = meta; return meta; }
        return !incoming && lastIdentity ? Object.assign({}, lastIdentity, { identityNote: 'last-known-before-lobby' }) : meta;
    }
    function notify(text) {
        feedback = text;
        const escaped = Locale.translate(Locale.resolve(mod),text).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        try { mod.command.message('Controls Profile: ' + escaped); } catch (_) { log(text); }
        update();
    }
    function error(error) {
        const key = error && error.message || '';
        audit('refused',engine.preview?engine.preview.selection:engine.pending?engine.pending.selection:null,{reason:key});
        if (key.startsWith('occupied-unconfirmed-slot:')) return notify('Um atalho que não consta na lista de habilidades ocupa uma posição do perfil. Ele foi preservado. Mova esse ícone no jogo e revise novamente.');
        if (key.startsWith('occupied-non-skill-slot:')) return notify('Um item ou outra ação ocupa o destino de uma habilidade (' + key.split(':').slice(1).join(':') + '). Mova esse ícone e revise novamente.');
        notify(ERRORS[key] || 'Não foi possível concluir a ação com dados válidos. Nenhuma nova aplicação foi preparada.');
        logError('Ação recusada: ' + key.replace(/[\r\n]/g, ' ').slice(0, 160));
    }
    function state() {
        const meta = current();
        if (!listingCache) listingCache = store.list();
        const listing = listingCache;
        const ready = !!engine.current && sameCharacter(meta, engine.current.meta);
        return { language:Locale.resolve(mod),languagePreference:Locale.preference(mod.settings.language),version: '0.5.0', character: meta.character, class: meta.class, ready,
            skills: engine.skillSet(meta) ? engine.skillSet(meta).size : 0, observedAt: ready ? engine.current.observedAt : null,
            glyphsReady:engine.glyphSet(meta)!==null,glyphsAvailable:engine.glyphSet(meta)?engine.glyphSet(meta).size:0,
            glyphCatalogReady:engine.catalogs.has(meta.class),glyphPoints:engine.glyphs&&sameCharacter(meta,engine.glyphs.meta)?engine.glyphs.points:null,
            glyphPolicyReady:engine.catalogs.has(meta.class)&&!!engine.glyphs&&sameCharacter(meta,engine.glyphs.meta)&&Number.isSafeInteger(engine.glyphs.points),
            ep:ep?ep.state():null,
            profiles: listing.profiles.map(p => ({ id: p.id, name: p.name, character: p.source.character, class: p.source.class, createdAt: p.createdAt,hasGlyphs:p.version===2,hasEp:!!p.ep,epPages:p.ep?p.ep.pages.map(page=>({index:page.index,talents:page.perks.length})):[],epTotalPages:p.ep?p.ep.unlockedPages:0 })),
            rejected: listing.rejected, feedback: ready && feedback === 'Aguardando configurações do personagem.' ? 'Configurações disponíveis. Você pode revisar outro perfil ou outras opções quando não houver uma preparação pendente.' : feedback, preview: engine.publicPreview(),
            savePending: saveRequest ? { name: saveRequest.name, character: saveRequest.target.character, expiresAt: saveRequest.expiresAt } : null,
            pending: engine.pending ? { name: engine.pending.name, character: engine.pending.target.character, selection:engine.pending.selection,expiresAt: engine.pending.expiresAt } : null };
    }
    function update() { if (panel && !disposed) { try { if(typeof panel.setLanguage==='function')panel.setLanguage(Locale.resolve(mod));panel.send('state', state()); } catch (_) {} } }
    function flush() {
        if (saveTimer) { timers.clearTimeout(saveTimer); saveTimer = null; }
        try { return recorder.flush(); }
        catch (_) { recorder.stop('write-error'); logError('Falha ao salvar diagnóstico local; captura pausada.'); return null; }
    }
    function schedule() {
        if (!saveTimer && !disposed) saveTimer = timers.setTimeout(() => { saveTimer = null; flush(); }, 1000);
        if (!expiryTimer && recorder.active && recorder.startedAt !== null) expiryTimer = timers.setTimeout(() => {
            expiryTimer = null; recorder.stop('time-limit'); flush();
        }, Math.max(0, DURATION - (Date.now() - recorder.startedAt)));
    }
    function clearPendingTimer() { if (pendingTimer) timers.clearTimeout(pendingTimer); pendingTimer = null; }
    function cancelSave() { saveRequest = null; if (saveRequestTimer) timers.clearTimeout(saveRequestTimer); saveRequestTimer = null; }
    function busy() { if (engine.pending || saveRequest) throw Error('pending-exists'); if(ep&&(ep.pending||ep.querying))throw Error('ep-busy'); }
    function finishDeferredSave(){
        if(!saveRequest||!saveRequest.loginConfirmed||!saveRequest.settingsReady)return;
        if(saveRequest.withEp&&(!ep||!ep.ready()))return;
        const request=saveRequest,meta=current();cancelSave();
        try{if(Date.now()>request.expiresAt||!sameCharacter(meta,request.target))throw Error('pending-expired-or-wrong-character');
            const profile=engine.save(request.name,meta,ep?ep.export():null);listingCache=null;
            notify('Perfil salvo com as configurações recarregadas: '+profile.name+'.'+(profile.ep?' EP incluídos: '+profile.ep.pages.length+' de '+profile.ep.unlockedPages+' páginas recebidas.':''));
        }catch(e){error(e);}
    }
    ep=new (require('./lib/ep-controller').EPController)(mod,__dirname,current,notify,()=>{finishDeferredSave();update();});
    function gui() {
        loadCatalog();
        if (!global.TeraProxy || !global.TeraProxy.GUIMode) return notify('Use o Toolbox com interface para abrir a janela.');
        if (!panel) { const Panel = require('./lib/panel'); panel = new Panel(mod, state, action); }
        panel.show(); update();
    }
    function action(name, payload = {}) {
        if (disposed) return;
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('invalid-action');
            const meta = current();
            switch (name) {
                case 'language':
                    try{Preferences.setLanguage(mod,__dirname,payload.language);notify('Idioma salvo.');}
                    catch(e){notify(e.message==='invalid-language'?'Idioma inválido. Use auto, pt, en ou es.':'Não foi possível salvar o idioma. A preferência anterior foi mantida.');}
                    break;
                case 'refresh': listingCache = null; update(); break;
                case 'save': {
                    busy();
                    if (payload.confirmReceived !== true) { notify('Se alterou teclas ou páginas de glifos, use Atualizar e salvar ao voltar. Para guardar os dados já recebidos, confirme essa opção na janela.'); break; }
                    const profile = engine.save(typeof payload.name === 'string' ? payload.name : '', meta,ep?ep.export():null);
                    listingCache = null;
                    notify('Perfil salvo: ' + profile.name + '. Foram usados os dados já recebidos do jogo. Teclas ou páginas de glifos recém-alteradas exigem voltar à seleção antes de salvar.'+(profile.ep?' EP incluídos: '+profile.ep.pages.length+' de '+profile.ep.unlockedPages+' páginas recebidas.':'')); break;
                }
                case 'prepare-save': {
                    busy(); engine.requireCurrent(meta);
                    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
                    if (!name || name.length > 80 || !validMeta(meta)) throw Error('invalid-name-or-character');
                    engine.preview = null;
                    saveRequest = { name, target: Object.assign({}, meta), expiresAt: Date.now() + 180000, loginConfirmed: false, settingsReady:false,withEp:!!(ep&&ep.ready()) };
                    saveRequestTimer = timers.setTimeout(() => { cancelSave(); if (!disposed) notify('Salvamento expirou. Nenhum perfil foi criado. Prepare novamente quando quiser.'); }, 180001);
                    notify('Salvamento preparado: ' + name + '. Volte à seleção e entre em ' + meta.character + ' em até 3 minutos. O perfil será salvo automaticamente com os dados recarregados.'); break;
                }
                case 'continue-game':
                    notify('No TERA, abra o menu com Esc e escolha a seleção de personagens. Entre novamente no mesmo personagem. Não precisa fechar o jogo nem o Toolbox.');
                    if (panel) panel.hide(); break;
                case 'preview':
                    busy(); if(ep)ep.cancel();
                    loadCatalog(meta);
                    engine.previewProfile(String(payload.id || ''), String(payload.selection || ''), meta); audit('review',engine.preview.selection,{profileId:engine.preview.profileId});update(); break;
                case 'discard-review':
                    if(!engine.pending&&engine.preview){engine.preview=null;notify('Escolha alterada. Clique em Revisar aplicação novamente.');}break;
                case 'undo':
                    busy();
                    engine.previewUndo(meta);audit('review',engine.preview.selection,{backupId:engine.preview.profileId});update(); break;
                case 'confirm':
                    if(ep&&(ep.pending||ep.querying))throw Error('ep-busy');
                    if (saveRequest) throw Error('pending-exists');
                    if(!engine.preview||payload.selection!==engine.preview.selection||(!engine.preview.undo&&payload.profileId!==engine.preview.profileId)){
                        engine.preview=null;throw Error('review-selection-changed');
                    }
                    engine.confirm(String(payload.token || ''), meta);
                    audit('confirmed',engine.pending.selection,{profileId:engine.pending.profileId});
                    clearPendingTimer();
                    pendingTimer = timers.setTimeout(() => { pendingTimer = null; if (engine.pending) { engine.cancel(); notify('Preparação expirada. Nenhuma configuração foi aplicada.'); } }, 180001);
                    notify('Preparado: '+modeName(engine.pending.selection)+' em '+engine.pending.target.character+'. Volte à seleção e entre no MESMO personagem em até 3 minutos. Um backup será gravado antes de aplicar.'); break;
                case 'cancel': if(ep)ep.cancel(); audit('cancelled',engine.pending?engine.pending.selection:engine.preview?engine.preview.selection:null);engine.cancel(); clearPendingTimer(); cancelSave(); notify('Preparação cancelada.'); break;
                case 'delete':
                    busy(); if(ep)ep.cancel();
                    store.remove(String(payload.id || '')); listingCache = null; engine.preview = null; notify('Perfil excluído. Backups anteriores foram preservados.'); break;
                case 'ep-review':
                    busy(); engine.preview=null;
                    ep.review(store.profile(String(payload.id||'')),payload.page).then(()=>{if(!disposed)notify('Confira a revisão dos EP. Pontos confirmados não podem ser desfeitos pelo mod.');}).catch(e=>{if(!disposed)error(e);});break;
                case 'ep-confirm':
                    busy();ep.confirm(store.profile(String(payload.id||'')),String(payload.token||''),payload.page);notify('Pedido de EP enviado. Aguardando a confirmação do servidor.');break;
                case 'ep-cancel':ep.cancel();break;
                default: throw Error('invalid-action');
            }
        } catch (e) { error(e); }
    }
    try {
        for (const name of Object.keys(PACKETS)) {
            try {
                hooks.push(mod.hook(name, 'raw', { order: -9000, filter: { fake: false, modified: false, silenced: false } },
                    (opcode, bytes, incoming, fake) => {
                        if (disposed || fake) return;
                        try {
                            const meta = captureIdentity(incoming);
                            if (recorder.active) { recorder.accept(name, opcode, bytes, incoming, fake, meta); schedule(); }
                            if (name === 'S_LOAD_CLIENT_USER_SETTING') {
                                const prepared=engine.pending;
                                const result = engine.incoming(bytes, meta);
                                if (!engine.pending) clearPendingTimer();
                                if(saveRequest&&saveRequest.loginConfirmed){saveRequest.settingsReady=true;finishDeferredSave();}
                                update();
                                if (result) { audit('applied',prepared.selection,{profileId:prepared.profileId,backupId:result.backupId});notify('Aplicado: '+modeName(prepared.selection)+'. Backup local salvo; confira as opções escolhidas.'+(result.crests?' Páginas de glifos restauradas. Selecione e ative a página no TERA para validar os pontos.':'')); return result.packet; }
                            } else if (name === 'C_SAVE_CLIENT_USER_SETTING') { engine.observe(bytes, meta); update(); }
                        } catch (e) {
                            clearPendingTimer();
                            // The original incoming/outgoing packet continues unchanged on every failure.
                            if (name === 'S_LOAD_CLIENT_USER_SETTING') {
                                try { engine.observe(bytes, captureIdentity(true)); } catch (_) {}
                            }
                            error(e);
                        }
                        return undefined;
                    }));
                availablePackets[name] = true;
            } catch (_) { availablePackets[name] = false; }
        }
        hooks.push(mod.hook('S_LOGIN', mod.majorPatchVersion >= 114 ? 15 : 14,
            { order: -8000, filter: { fake: false } }, () => {
                const meta = current(); if (validMeta(meta)) lastIdentity = meta;
                engine.login(meta); if (!engine.pending) clearPendingTimer(); update();
                loadCatalog(meta);
                if (saveRequest) {
                    if (Date.now() > saveRequest.expiresAt || !sameCharacter(meta, saveRequest.target)) {
                        cancelSave(); notify('Salvamento cancelado: prazo encerrado ou personagem diferente. Nenhum perfil foi criado.');
                    } else saveRequest.loginConfirmed = true;
                    update();
                }
            }));
        hooks.push(mod.hook('S_SKILL_LIST', 2, { order: -8000, filter: { fake: false } }, event => {
            const meta = current(); engine.learned(event.skills, meta);
            if (recorder.active && Array.isArray(event.skills) && event.skills.length <= 10000) {
                if (!recorder.learnedSkills) recorder.learnedSkills = [];
                if (recorder.learnedSkills.length < 8) recorder.learnedSkills.push({ at: Date.now(), who: meta,
                    skills: event.skills.map(s => ({ id: String(s.id), active: s.active === true })) });
                recorder.dirty = true; schedule();
            }
            update();
        }));
        try {
            hooks.push(mod.hook('S_CREST_INFO',2,{order:-8000,filter:{fake:false,modified:false,silenced:false}},event=>{
                try {
                    const meta=current(),cancelled=engine.knownGlyphs(event.crests,meta,event.points);loadCatalog(meta);
                    if(cancelled){clearPendingTimer();notify('Preparação cancelada: os glifos disponíveis mudaram. Revise o perfil novamente.');}
                    if(recorder.active){
                        if(!recorder.learnedGlyphs)recorder.learnedGlyphs=[];
                        if(recorder.learnedGlyphs.length<8)recorder.learnedGlyphs.push({at:Date.now(),who:meta,points:event.points,pointsActive:event.pointsActive,crests:event.crests.map(c=>({id:c.id,enable:c.enable}))});
                        recorder.dirty=true;schedule();
                    }
                    update();
                }catch(e){error(e);}
            }));
        }catch(_){log('Leitor de glifos indisponível. Teclas e barras continuam disponíveis.');}
        try {
            hooks.push(mod.hook('S_CREST_APPLY',2,{order:-8000,filter:{fake:false,modified:false,silenced:false}},event=>{
                try {
                    const result=engine.glyphApplied(event,current());
                    if(result.cancelled){clearPendingTimer();notify('Preparação cancelada: os glifos disponíveis mudaram. Revise o perfil novamente.');}
                    else if(result.changed)update();
                }catch(e){error(e);}
            }));
        }catch(_){log('Atualizações individuais de glifos indisponíveis; a lista completa continua sendo usada.');}
        mod.command.add('controlprofile', (command = 'gui', ...args) => {
            try {
                switch (String(command).toLowerCase()) {
                    case 'gui': gui(); break;
                    case 'inspectep':
                        if(!epInspector)epInspector=require('./lib/ep-inspect')(mod,__dirname,current);
                        if(args[0]==='native'){
                            if(!epNativeInspector)epNativeInspector=new (require('./lib/ep-native-inspect').EPNativeInspect)(mod,__dirname);
                            epNativeInspector.run().then(file=>{if(!disposed){notify('Metadados locais de EP salvos. Nenhum ponto foi alterado.');log('Diagnóstico EP: '+file);}}).catch(e=>{if(!disposed){notify('Leitura local de EP indisponível. Nenhum ponto foi alterado.');logError(String(e.message||e)+(e.report?' · diagnóstico: '+e.report:''));}});
                        }
                        else if(args[0]==='data'){epInspector.context().then(file=>{if(file&&!disposed)notify('Dados locais de EP salvos. Nenhum ponto foi alterado.');}).catch(e=>{if(!disposed)logError(String(e.message||e));});}
                        else if(args[0]==='report'){epInspector.report();notify('Diagnóstico EP salvo. Nenhum ponto foi alterado.');}
                        else if(args[0]==='stop'){epInspector.stop();notify('Diagnóstico EP encerrado.');}
                        else{epInspector.start();notify('Leitura EP ativa por 8 minutos. Abra EP e alterne páginas já salvas; os pontos não serão modificados pelo mod.');}
                        break;
                    case 'inspectplayer':
                        if(!playerInspector)playerInspector=require('./lib/player-build-inspect')(mod,__dirname,current);
                        if(args[0]==='stop'){playerInspector.stop();notify('Diagnóstico de inspeção encerrado.');}
                        else if(args[0]==='report'){playerInspector.report();notify('Diagnóstico de inspeção salvo.');}
                        else{
                            playerInspector.start();notify('Diagnóstico de inspeção ativo por 8 minutos. Apenas observa a inspeção normal; não aplica pontos.');
                            if(args[0]==='native'){
                                if(!epNativeInspector)epNativeInspector=new (require('./lib/ep-native-inspect').EPNativeInspect)(mod,__dirname);
                                epNativeInspector.run('player').then(file=>{if(!disposed){notify('Metadados locais de inspeção salvos. Nenhum ponto foi alterado.');log('Diagnóstico de inspeção: '+file);}}).catch(e=>{if(!disposed){notify('Leitura local de inspeção indisponível. A observação dos pacotes continua ativa.');logError(String(e.message||e));}});
                            }
                        }
                        break;
                    case 'inspectglyphs':
                        if(glyphInspectionBusy){notify('Consulta de glifos em andamento. Aguarde.');break;}
                        glyphInspectionBusy=true;
                        require('./lib/glyph-catalog-inspect').collect(mod,engine,store,__dirname,()=>disposed).then(file=>{if(file&&!disposed)notify('Catálogo local de glifos salvo. Nenhum glifo foi alterado.');}).catch(e=>{if(!disposed){notify('Não foi possível consultar o catálogo local de glifos.');logError(String(e.message||e));}}).finally(()=>{glyphInspectionBusy=false;});
                        break;
                    case 'save': action('prepare-save', { name: args.join(' ') }); break;
                    case 'cancel': action('cancel'); break;
                    case 'language': action('language',{language:args[0]||'auto'}); break;
                    case 'report': { const file = flush(); notify(file ? 'Diagnóstico local salvo em ' + file : 'Falha ao salvar diagnóstico.'); break; }
                    case 'mark': recorder.mark(String(args[0] || '').toLowerCase(), captureIdentity(true)); if (flush()) notify('Marca salva com os últimos dados recebidos.'); break;
                    case 'stop': recorder.stop(); flush(); notify('Diagnóstico pausado. A janela de perfis continua disponível.'); break;
                    case 'start':
                        if (recorder.records.length || recorder.marks.length) { recorder.stop('new-session'); if (!flush()) break; }
                        if (expiryTimer) timers.clearTimeout(expiryTimer); expiryTimer = null;
                        recorder = new Recorder(path.join(__dirname, 'logs'), environment); notify('Diagnóstico passivo armado.'); break;
                    case 'status': {
                        const s = state(); notify('0.5.0 · ' + (s.character || 'sem personagem') + ' · configurações ' + (s.ready ? 'recebidas' : 'pendentes') +
                            ' · glifos '+(s.glyphsReady?s.glyphsAvailable:'aguardando')+
                            ' · habilidades ativas ' + s.skills + ' · perfis ' + s.profiles.length + ' · leitores ' + Object.values(availablePackets).filter(Boolean).length + '/4.'); break;
                    }
                    default: notify('Use /8 controlprofile, save NOME, status, report, cancel, start, stop ou mark base/tecla/barra/restaurado.');
                }
            } catch (e) { error(e); }
        });
    } catch (e) { for (const h of hooks) mod.unhook(h); throw e; }
    disposeGuiShortcut = require('./lib/gui-shortcut')(mod, gui);
    // Toolbox passes this only to the replacement instance on the same dispatch.
    // No disk cache, pending application, review token or delayed save is restored.
    this.saveState = () => {if(mod.game.isIngame===false)return null;const saved=engine.snapshot(current());if(saved&&ep)saved.epSnapshot=ep.snapshot();return saved;};
    this.loadState = saved => {
        if (disposed || mod.game.isIngame === false || !engine.restoreSnapshot(saved, current())) return;
        if(ep&&saved.epSnapshot)ep.restore(saved.epSnapshot);
        lastIdentity = current();
        feedback = 'Configurações preservadas ao recarregar. Escolha o perfil e revise novamente; preparações anteriores foram canceladas.';
        update();
    };
    loadCatalog();
    log('Controls Profile 0.5.0: /8 controlprofile abre a janela. Nada é aplicado sem preparação confirmada.');
    this.destructor = () => {
        if(playerInspector)playerInspector.close();
        if(epInspector)epInspector.destructor();
        if(epNativeInspector)epNativeInspector.close();
        disposed = true; if(ep)ep.close(); disposeGuiShortcut(); engine.cancel(); clearPendingTimer();
        cancelSave();
        if (expiryTimer) timers.clearTimeout(expiryTimer);
        if (recorder.records.length || recorder.marks.length || recorder.learnedSkills || recorder.learnedGlyphs) { recorder.stop('unload'); flush(); }
        if (saveTimer) timers.clearTimeout(saveTimer);
        if (panel) panel.destructor();
        for (const h of hooks) mod.unhook(h);
        mod.command.remove('controlprofile');
    };
};
