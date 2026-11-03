'use strict';
const path = require('path');
const Locale=require('./i18n');
const Host = require('tera-mod-ui').Host;
module.exports = class Panel extends Host {
    constructor(mod, state, action) {
        super(mod, 'index.html', { title: 'Controls Profile • '+Locale.t(Locale.resolve(mod),'Teclas e barras'), width: 800, height: 820,
            minWidth: 650, minHeight: 560, resizable: true, backgroundColor: '#202b34', autoHideMenuBar: true,
            webPreferences: { nodeIntegration: true, contextIsolation: false, devTools: false }
        }, false, path.join(__dirname, '..', 'ui'));
        this.on('ready', () => this.send('state', state()));
        this.on('action', (name, payload) => action(name, payload));
    }
    _handleEvent(event, name, ...args) {
        if (this.window && event.sender === this.window.webContents && (name === 'ready' || name === 'action')) this.emit(name, ...args);
    }
    setLanguage(language) { if(this.window&&!this.window.isDestroyed())this.window.setTitle('Controls Profile • '+Locale.t(language,'Teclas e barras')); }
    show() {
        super.show();
        if (this.window) { if (this.window.isMinimized()) this.window.restore(); this.window.show(); this.window.focus(); }
    }
    destructor() { super.destructor(); this.removeAllListeners(); }
};
