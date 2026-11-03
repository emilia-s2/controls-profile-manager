'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PACKETS = Object.freeze({
    S_LOAD_CLIENT_ACCOUNT_SETTING: true,
    S_LOAD_CLIENT_USER_SETTING: true,
    C_SAVE_CLIENT_ACCOUNT_SETTING: false,
    C_SAVE_CLIENT_USER_SETTING: false
});
const MAX_RECORDS = 64;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_MARKS = 32;
const DURATION = 15 * 60 * 1000;
const sha = data => crypto.createHash('sha256').update(data).digest('hex');

function identity(value) {
    value = value || {};
    return {
        character: typeof value.character === 'string' ? value.character.slice(0, 100) : null,
        playerId: Number.isSafeInteger(value.playerId) ? value.playerId : null,
        templateId: Number.isSafeInteger(value.templateId) ? value.templateId : null,
        class: typeof value.class === 'string' ? value.class.slice(0, 60) : (Number.isSafeInteger(value.class) ? value.class : null),
        serverId: Number.isSafeInteger(value.serverId) ? value.serverId : null
    };
}

class Recorder {
    constructor(directory, environment, now = Date.now) {
        this.now = now;
        this.directory = directory;
        this.environment = environment;
        this.createdAt = now();
        this.startedAt = null;
        this.active = true;
        this.reason = null;
        this.bytes = 0;
        this.sequence = 0;
        this.records = [];
        this.marks = [];
        this.actions = [];
        this.seen = new Map();
        this.latest = new Map();
        this.rejected = 0;
        this.dirty = true;
        this.sessionDirectory = null;
        this.writes = 0;
    }

    accept(name, opcode, buffer, incoming, fake, who) {
        if (!this.active || fake || !Object.prototype.hasOwnProperty.call(PACKETS, name)) return false;
        if (this.startedAt !== null && this.now() - this.startedAt >= DURATION) {
            this.stop('time-limit');
            return false;
        }
        if (incoming !== PACKETS[name] || !Buffer.isBuffer(buffer) || buffer.length < 4 ||
            buffer.length > 65535 || buffer.readUInt16LE(0) !== buffer.length ||
            !Number.isInteger(opcode) || opcode < 0 || opcode > 65535 || buffer.readUInt16LE(2) !== opcode) {
            this.rejected++;
            this.dirty = true;
            return false;
        }
        if (this.startedAt === null) this.startedAt = this.now();
        who = identity(who);
        const whoKey = JSON.stringify(who);
        const digest = sha(buffer);
        const key = name + ':' + whoKey + ':' + digest;
        const previous = this.seen.get(key);
        if (previous) {
            previous.count++;
            previous.lastAt = this.now();
            this.latest.set(name + ':' + whoKey, previous.id);
            this.dirty = true;
            return false;
        }
        if (this.records.length >= MAX_RECORDS || this.bytes + buffer.length > MAX_BYTES) {
            this.stop('size-limit');
            return false;
        }
        const record = {
            id: ++this.sequence, name, opcode, incoming, who,
            firstAt: this.now(), lastAt: this.now(), count: 1,
            length: buffer.length, sha256: digest,
            packetBase64: buffer.toString('base64')
        };
        this.records.push(record);
        this.seen.set(key, record);
        this.latest.set(name + ':' + whoKey, record.id);
        this.bytes += buffer.length;
        this.dirty = true;
        return true;
    }

    mark(label, who) {
        if (!/^(base|tecla|barra|restaurado)$/.test(label)) throw Error('Use mark base, mark tecla, mark barra ou mark restaurado.');
        if (this.marks.length >= MAX_MARKS) throw Error('Limite de marcas atingido; salve o relatório.');
        who = identity(who);
        const whoKey = JSON.stringify(who);
        const latest = {};
        for (const name of Object.keys(PACKETS)) latest[name] = this.latest.get(name + ':' + whoKey) || null;
        this.marks.push({ label, at: this.now(), who, latest });
        this.dirty = true;
    }

    stop(reason = 'manual') {
        this.active = false;
        this.reason = reason;
        this.dirty = true;
    }
    recordAction(type,selection,who,details={}) {
        if(!this.active||this.actions.length>=64||!['review','confirmed','applied','cancelled','refused'].includes(type))return false;
        if(selection!==null&&!['keys','bars','both','glyphs','all','keys-glyphs','bars-glyphs'].includes(selection))return false;
        const entry={at:this.now(),type,selection,who:identity(who)};
        for(const key of ['profileId','backupId'])if(typeof details[key]==='string'&&/^[a-f0-9]{32}$/.test(details[key]))entry[key]=details[key];
        if(typeof details.reason==='string')entry.reason=details.reason.replace(/[\r\n]/g,' ').slice(0,120);
        this.actions.push(entry);this.dirty=true;return true;
    }

    snapshot() {
        return {
            format: 'controls-profile-diagnostic', formatVersion: 1, moduleVersion: '0.5.0',
            environment: this.environment, createdAt: this.createdAt, startedAt: this.startedAt,
            active: this.active, reason: this.reason,
            limits: { maxRecords: MAX_RECORDS, maxBytes: MAX_BYTES, maxMarks: MAX_MARKS, durationMs: DURATION },
            bytes: this.bytes, rejected: this.rejected, records: this.records, marks: this.marks, actions:this.actions,learnedSkills: this.learnedSkills || [],learnedGlyphs:this.learnedGlyphs||[]
        };
    }

    flush() {
        if (!this.dirty) return this.reportPath;
        fs.mkdirSync(this.directory, { recursive: true });
        const root = fs.lstatSync(this.directory);
        if (!root.isDirectory() || root.isSymbolicLink()) throw Error('Pasta de diagnóstico inválida.');
        if (!this.sessionDirectory) {
            const folder = 'capture-' + new Date(this.createdAt).toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(6).toString('hex');
            const target = path.join(this.directory, folder);
            fs.mkdirSync(target);
            this.sessionDirectory = target;
            this.sessionRealPath = fs.realpathSync(target);
        }
        const session = fs.lstatSync(this.sessionDirectory);
        if (!session.isDirectory() || session.isSymbolicLink() || fs.realpathSync(this.sessionDirectory) !== this.sessionRealPath)
            throw Error('Pasta da captura foi alterada.');
        const target = path.join(this.sessionDirectory, 'diagnostic.json');
        if (fs.existsSync(target)) {
            const old = fs.lstatSync(target);
            if (!old.isFile() || old.isSymbolicLink()) throw Error('Destino do relatório inválido.');
        }
        const temporary = path.join(this.sessionDirectory, '.report-' + process.pid + '-' + (++this.writes) + '.tmp');
        try {
            fs.writeFileSync(temporary, JSON.stringify(this.snapshot(), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
            fs.renameSync(temporary, target);
        } catch (error) {
            try { fs.unlinkSync(temporary); } catch (_) { /* Only this exact temporary file. */ }
            throw error;
        }
        this.reportPath = target;
        this.dirty = false;
        return target;
    }
}

module.exports = { Recorder, PACKETS, MAX_RECORDS, MAX_BYTES, MAX_MARKS, DURATION, sha };
