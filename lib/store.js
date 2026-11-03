'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const F = require('./settings-format'), C = require('./controls-profile');
const G = require('./glyph-presets');
const EP=require('./ep-pages');
const MAX_FILE = 160 * 1024;
const ID = /^[0-9a-f]{32}$/;
function snapshot(packet) {
    const p = F.parsePacket(packet);
    const kept = p.fields.filter(f => {
        if (f.number === 1 || f.number === 2) return true;
        return p.sections.some(s => s.rootField === f && [C.KEYS, C.BARS, C.GLYPHS].includes(s.name));
    });
    const body = Buffer.concat(kept.map(f => f.raw));
    const header = Buffer.from(p.packet.subarray(0, 8));
    header.writeUInt16LE(body.length + 8); header.writeUInt16LE(body.length, 6);
    const result = Buffer.concat([header, body]);
    const parsed = F.parsePacket(result);
    if (![2,3].includes(parsed.sections.length) || !parsed.sections.find(s => s.name === C.KEYS) || !parsed.sections.find(s => s.name === C.BARS))
        throw Error('missing-profile-sections');
    C.readSlots(parsed.sections.find(s => s.name === C.BARS));
    const glyphs=parsed.sections.find(s=>s.name===C.GLYPHS);if(glyphs)G.read(glyphs);
    return result;
}
function validMeta(meta) {
    return meta && meta.protocol === 376012 && meta.majorPatch === 100 && meta.minorPatch === 2 &&
        typeof meta.class === 'string' && meta.class.length > 0 && meta.class.length <= 60 && typeof meta.character === 'string' &&
        meta.character.length > 0 && meta.character.length <= 100 && Number.isSafeInteger(meta.playerId) && Number.isSafeInteger(meta.serverId);
}
function validate(profile) {
    if (!profile || profile.format !== 'controls-profile' || ![1,2].includes(profile.version) || !ID.test(profile.id) ||
        typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 80 || !validMeta(profile.source) ||
        !Number.isSafeInteger(profile.createdAt) || profile.createdAt < 0 ||
        typeof profile.packetBase64 !== 'string' || profile.packetBase64.length > 90000) throw Error('invalid-profile');
    const packet = Buffer.from(profile.packetBase64, 'base64');
    if (packet.toString('base64') !== profile.packetBase64 || F.digest(packet) !== profile.sha256) throw Error('invalid-profile-hash');
    if (!snapshot(packet).equals(packet)) throw Error('profile-has-extra-sections');
    const hasGlyphs=F.parsePacket(packet).sections.some(s=>s.name===C.GLYPHS);
    if(hasGlyphs!==(profile.version===2))throw Error('profile-version-mismatch');
    if(profile.ep!==undefined)EP.validate(profile.ep,profile.source.class);
    return packet;
}
class Store {
    constructor(root) { this.root = root; }
    directory(kind) {
        if (!['profiles', 'backups'].includes(kind)) throw Error('invalid-directory');
        const directory = path.join(this.root, kind); fs.mkdirSync(directory, { recursive: true });
        const stat = fs.lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('invalid-storage-directory');
        return directory;
    }
    write(kind, object) {
        if (!ID.test(object.id)) throw Error('invalid-id');
        const directory = this.directory(kind), target = path.join(directory, object.id + '.json');
        const bytes = Buffer.from(JSON.stringify(object, null, 2) + '\n');
        if (bytes.length > MAX_FILE) throw Error('profile-too-large');
        // Unique IDs and exclusive writes: an existing personal profile is never replaced.
        const fd = fs.openSync(target, 'wx', 0o600);
        try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
        catch (error) { fs.closeSync(fd); try { fs.unlinkSync(target); } catch (_) {} throw error; }
        fs.closeSync(fd);
        return object;
    }
    read(kind, id) {
        if (!ID.test(id)) throw Error('invalid-id');
        const target = path.join(this.directory(kind), id + '.json'), stat = fs.lstatSync(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE) throw Error('invalid-profile-file');
        return JSON.parse(fs.readFileSync(target, 'utf8'));
    }
    list() {
        const profiles = [], rejected = [];
        for (const file of fs.readdirSync(this.directory('profiles')).filter(f => /^[0-9a-f]{32}\.json$/.test(f)).slice(0, 1000)) {
            try { const profile = this.profile(file.slice(0, -5)); profiles.push(profile); }
            catch (_) { rejected.push(file); }
        }
        return { profiles: profiles.sort((a, b) => b.createdAt - a.createdAt), rejected: rejected.length };
    }
    save(name, packet, meta, ep=null) {
        name = String(name || '').trim();
        if (!name || name.length > 80 || !validMeta(meta)) throw Error('invalid-name-or-character');
        const bytes = snapshot(packet);
        const version=F.parsePacket(bytes).sections.some(s=>s.name===C.GLYPHS)?2:1;
        const profile = { format: 'controls-profile', version, id: crypto.randomBytes(16).toString('hex'),
            name, createdAt: Date.now(), source: Object.assign({}, meta), packetBase64: bytes.toString('base64'), sha256: F.digest(bytes) };
        if(ep){EP.validate(ep,meta.class);profile.ep=JSON.parse(JSON.stringify(ep));}
        validate(profile); return this.write('profiles', profile);
    }
    profile(id) { const p = this.read('profiles', id); if (p.id !== id) throw Error('profile-id-mismatch'); validate(p); return p; }
    remove(id) {
        this.profile(id); // Refuse malformed, unknown or linked files.
        fs.unlinkSync(path.join(this.directory('profiles'), id + '.json'));
    }
    backup(packet, meta, selection) {
        if (!validMeta(meta)) throw Error('invalid-backup');C.sectionsFor(selection);
        F.parsePacket(packet);
        return this.write('backups', { format: 'controls-profile-backup', version: 1, id: crypto.randomBytes(16).toString('hex'),
            createdAt: Date.now(), source: Object.assign({}, meta), selection, packetBase64: packet.toString('base64'), sha256: F.digest(packet) });
    }
    lastBackup(meta) {
        let latest = null;
        for (const name of fs.readdirSync(this.directory('backups')).filter(n => /^[0-9a-f]{32}\.json$/.test(n)).slice(0, 1000)) {
            try {
                const b = this.read('backups', name.slice(0, -5));
                if (b.format !== 'controls-profile-backup' || b.version !== 1 || !validMeta(b.source) ||
                    b.source.playerId !== meta.playerId || b.source.serverId !== meta.serverId || b.source.character !== meta.character ||
                    typeof b.packetBase64 !== 'string' || b.packetBase64.length > 90000) continue;
                C.sectionsFor(b.selection);
                const packet = Buffer.from(b.packetBase64, 'base64');
                if (F.digest(packet) !== b.sha256) continue;
                snapshot(packet);
                if (!latest || b.createdAt > latest.createdAt) latest = b;
            } catch (_) { /* Never alter invalid backups. */ }
        }
        return latest;
    }
}
module.exports = { Store, snapshot, validate, validMeta };
