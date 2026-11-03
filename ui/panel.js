'use strict';
const bridge = new (require('tera-mod-ui').Renderer)();
const $ = id => document.getElementById(id);
let state = null, deleting = null, savingName = null;
const invalidReviews=new Set();
const className = value => ({ elementalist: 'Mystic', sorcerer: 'Sorcerer', warrior: 'Warrior', priest: 'Priest' }[value] || value || UIText.t('classe não identificada'));
const modeName = value => ({ keys: 'somente teclas', bars: 'somente habilidades nas barras', both: 'teclas e habilidades nas barras',glyphs:'somente páginas de glifos',all:'teclas, barras e páginas de glifos','keys-glyphs':'teclas e páginas de glifos','bars-glyphs':'barras e páginas de glifos' }[value] || value);
function send(name, payload = {}) { bridge.send('action', name, payload); }
const epPanel=new window.EPPanel(send);
function selected() { return state && state.profiles.find(p => p.id === $('profile').value); }
function discardReview() {
    if(!state||!state.preview)return;
    invalidReviews.add(state.preview.token);
    if(invalidReviews.size>32)invalidReviews.delete(invalidReviews.values().next().value);
    state=Object.assign({},state,{preview:null});$('preview-card').hidden=true;$('confirm').disabled=true;send('discard-review');
}
function selectionChanged() {
    const p = selected(); UIText.text($('profile-detail'), p ? p.character + ' · ' + className(p.class) + ' · ' + new Date(p.createdAt).toLocaleString(UIText.locale) + (p.hasGlyphs?' · inclui páginas de glifos':' · sem glifos; salve um novo perfil para incluí-los') : 'Salve um perfil para começar.');
    for(const option of $('selection').options)if(['all','glyphs','keys-glyphs','bars-glyphs'].includes(option.value))option.disabled=!p||!p.hasGlyphs;
    if($('selection').selectedOptions.length&&$('selection').selectedOptions[0].disabled)$('selection').value='both';
    const busy=!!state.pending||!!state.savePending||!!(state.ep&&state.ep.busy),needsGlyphs=['all','glyphs','keys-glyphs','bars-glyphs'].includes($('selection').value),glyphBlocked=needsGlyphs&&state.glyphPolicyReady===false;
    $('preview').disabled = !p || !state.ready || busy || glyphBlocked;
    $('delete').disabled = !p || !!state.pending || !!state.savePending;
    $('restore-status').hidden=state.ready&&!busy&&!glyphBlocked;
    UIText.text($('restore-status'), !state.ready?'Para habilitar a restauração, volte à seleção e entre no mesmo personagem para receber as configurações. Não repita o comando de reload.':state.savePending?'Conclua ou cancele o salvamento preparado antes de revisar uma restauração.':state.pending?'Conclua ou cancele a aplicação preparada antes de revisar outra.':state.glyphCatalogReady===false?'Consultando o catálogo local dos glifos. Aguarde; teclas e barras podem ser escolhidas separadamente.':'Para revisar os glifos, volte à seleção e entre no mesmo personagem uma vez para receber o limite de pontos.');
}
bridge.on('state', data => {
    UIText.apply(data.language||'pt');
    $('language').value=data.languagePreference||'auto';$('language').disabled=false;
    UIText.text($('language-auto'),'Automático: '+(UIText.names[data.language||'pt']||'English'));
    UIText.text($('version'),data.version||'0.5.0');
    if(data.preview&&invalidReviews.has(data.preview.token))data=Object.assign({},data,{preview:null});
    if (state && (state.character !== data.character || state.class !== data.class)) { savingName = null; $('save-card').hidden = true; }
    state = data;epPanel.update(data);
    UIText.text($('character'), data.character ? data.character + ' · ' + className(data.class) : 'Entre no mundo com um personagem');
    UIText.text($('session'), data.ready ? 'Configurações recebidas às ' + new Date(data.observedAt).toLocaleTimeString(UIText.locale) + ' · habilidades ativas: ' + data.skills + ' · glifos disponíveis: '+(data.glyphsReady?data.glyphsAvailable:'aguardando dados do jogo') : 'Aguardando configurações. Volte à seleção e entre novamente se necessário.');
    UIText.text($('feedback'), data.feedback);
    const old = $('profile').value;
    UIText.text($('profile'), '');
    if (!data.profiles.length) { const option = document.createElement('option'); option.value = ''; UIText.text(option, 'Nenhum perfil salvo'); $('profile').appendChild(option); }
    for (const p of data.profiles) {
        const option = document.createElement('option'); option.value = p.id; UIText.text(option, p.name + ' — ' + p.character + ' (' + className(p.class) + ')', true); $('profile').appendChild(option);
    }
    if (data.profiles.some(p => p.id === old)) $('profile').value = old;
    const busy = !!data.pending || !!data.savePending || !!(data.ep&&data.ep.busy);
    $('save').disabled = !data.ready || busy;
    $('undo').disabled = !data.ready || busy;
    $('selection').disabled = busy;
    if (busy || !data.ready) { savingName = null; $('save-card').hidden = true; }
    $('save-pending-card').hidden = !data.savePending;
    if (data.savePending) UIText.text($('save-pending-description'), '“' + data.savePending.name + '” · personagem: ' + data.savePending.character + ' · entre novamente até ' + new Date(data.savePending.expiresAt).toLocaleTimeString(UIText.locale) + '.');
    selectionChanged();
    if(data.preview&&!data.preview.undo&&(data.preview.selection!==$('selection').value||data.preview.profileId!==$('profile').value)){discardReview();data=state;}
    $('preview-card').hidden = !data.preview;
    $('confirm').disabled=!data.preview;
    if (data.preview) {
        const p = data.preview;
        UIText.text($('confirm'), 'Preparar '+modeName(p.selection));
        UIText.text($('preview-description'), 'Aplicar “' + p.name + '” em ' + p.target + ': ' + modeName(p.selection) + '.');
        UIText.text($('preview-details'), p.details.skills === null ? 'As posições das habilidades serão mantidas.' :
            p.details.skills + ' posições de habilidades compatíveis · ' + (p.details.adaptedRanks || 0) + ' posições ajustadas ao nível disponível · ' + p.details.omitted + ' posições do perfil não confirmadas · ' +
            p.details.preserved + ' itens/outras ações e ' + (p.details.preservedUnconfirmed || 0) + ' atalhos não listados preservados no destino.');
        const conflicts = p.details.conflicts || [];
        $('preview-conflicts').hidden = !conflicts.length && !p.details.restoredBarsSnapshot;
        UIText.text($('preview-conflicts'), p.details.restoredBarsSnapshot ? 'Esta reversão repõe as barras do backup, incluindo os atalhos de itens, ações e montarias. Um novo backup será salvo antes de aplicar.' :
            (conflicts.length === 1 ? '1 atalho ocupa uma posição do perfil e será substituído' : conflicts.length + ' atalhos ocupam posições do perfil e serão substituídos') + ' por habilidades disponíveis após sua confirmação. Itens e montarias continuam no personagem; somente seus atalhos nessas posições serão trocados. O backup permite desfazer.');
        $('preview-glyphs').hidden=p.details.glyphPages===null||p.details.glyphPages===undefined;
        if(!$('preview-glyphs').hidden)UIText.text($('preview-glyphs'), p.details.glyphPages+' páginas de glifos · '+p.details.glyphCount+' glifos disponíveis · '+p.details.glyphOmitted+' indisponíveis omitidos · '+p.details.glyphPreservedPages+' páginas mantidas por falta de glifos compatíveis. Depois de entrar, selecione e ative a página no TERA para validar os pontos.');
        const adapted=p.details.glyphAdapted||[],pointSkipped=p.details.glyphPointSkipped||[],costs=p.details.glyphCosts||[];
        $('preview-tiers').hidden=!costs.length;
        UIText.text($('preview-tiers'), adapted.length+' glifos ajustados à versão disponível · '+pointSkipped.length+' omitidos pelo limite de pontos · '+(p.details.glyphDuplicates||0)+' versões repetidas omitidas. '+costs.map(c=>'Página '+c.page+': '+(c.preserved?'mantida como estava':c.used+'/'+c.limit+' pontos')).join(' · ')+'. A ordem do perfil é respeitada ao escolher o que cabe. Ative a página pelo TERA.');
    }
    $('pending-card').hidden = !data.pending;
    if (data.pending) UIText.text($('pending-description'), '“' + data.pending.name + '” · '+modeName(data.pending.selection)+' · personagem: ' + data.pending.character + ' · entre novamente até ' + new Date(data.pending.expiresAt).toLocaleTimeString(UIText.locale) + '.');
    if (deleting && !data.profiles.some(p => p.id === deleting)) { deleting = null; $('delete-card').hidden = true; }
});
$('refresh').onclick = () => send('refresh');
$('save').onclick = () => {
    const name = $('name').value.trim();
    if (!name) { $('name').setCustomValidity(UIText.t('Dê um nome ao perfil.')); $('name').reportValidity(); return; }
    $('name').setCustomValidity(''); savingName = name;
    UIText.text($('save-description'), 'Perfil “' + name + '” · personagem: ' + state.character + '.');
    $('save-card').hidden = false; $('save-card').scrollIntoView({ block: 'nearest' });
};
$('name').oninput = () => $('name').setCustomValidity('');
$('save-received').onclick = () => { if (savingName !== null) send('save', { name: savingName, confirmReceived: true }); savingName = null; $('save-card').hidden = true; };
$('save-after-return').onclick = () => { if (savingName !== null) send('prepare-save', { name: savingName }); savingName = null; $('save-card').hidden = true; };
$('save-cancel').onclick = () => { savingName = null; $('save-card').hidden = true; };
$('save-continue').onclick = $('apply-continue').onclick = () => send('continue-game');
$('save-pending-cancel').onclick = () => send('cancel');
$('profile').onchange = () => { discardReview();selectionChanged(); };
$('selection').onchange = () => { discardReview();selectionChanged(); };
$('preview').onclick = () => send('preview', { id: $('profile').value, selection: $('selection').value });
$('undo').onclick = () => send('undo');
$('confirm').onclick = () => {
    if(!state.preview||$('confirm').disabled)return;
    const p=state.preview;$('confirm').disabled=true;
    send('confirm',{token:p.token,selection:p.undo?p.selection:$('selection').value,profileId:p.undo?null:$('profile').value});
};
$('cancel-preview').onclick = $('cancel-pending').onclick = () => send('cancel');
$('delete').onclick = () => {
    const p = selected(); if (!p) return;
    deleting = p.id; UIText.text($('delete-description'), 'Excluir “' + p.name + '”? Os backups serão preservados.'); $('delete-card').hidden = false;
};
$('delete-confirm').onclick = () => { if (deleting) send('delete', { id: deleting }); deleting = null; $('delete-card').hidden = true; };
$('delete-cancel').onclick = () => { deleting = null; $('delete-card').hidden = true; };
$('language').onchange=()=>{$('language').disabled=true;send('language',{language:$('language').value});};
bridge.send('ready');
