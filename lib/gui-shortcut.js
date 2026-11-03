'use strict';
const timers = require('timers');
// Opens the same panel as /8 controlprofile, without reloading the module.
module.exports = function registerGuiShortcut(mod, open) {
    if (!global.TeraProxy || !global.TeraProxy.GUIMode) return () => {};
    let electron;
    try { electron = require('electron'); } catch (_) { return () => {}; }
    if (!electron || !electron.app || !electron.globalShortcut) return () => {};
    const { app, globalShortcut } = electron, key = 'Control+Alt+K';
    let disposed = false, owned = false, warned = false;
    function warning() {
        if (warned) return;
        warned = true;
        mod.log('Controls Profile: Ctrl+Alt+K indisponível. Use /8 controlprofile para abrir a janela.');
    }
    function invoke() {
        if (disposed) return;
        try { open(); }
        catch (_) { mod.log('Controls Profile: não foi possível abrir a janela pelo atalho. Use /8 controlprofile.'); }
    }
    function ensure() {
        if (disposed || !app.isReady()) return;
        try {
            if (globalShortcut.isRegistered(key)) { if (!owned) warning(); return; }
            owned = globalShortcut.register(key, invoke);
            if (owned) warned = false; else warning();
        } catch (_) { warning(); }
    }
    app.once('ready', ensure);
    ensure();
    // Some modules clear all Electron shortcuts when disconnecting.
    const timer = timers.setInterval(ensure, 2500);
    if (timer.unref) timer.unref();
    return () => {
        if (disposed) return;
        disposed = true;
        timers.clearInterval(timer);
        app.removeListener('ready', ensure);
        if (owned) { try { globalShortcut.unregister(key); } catch (_) {} }
    };
};
