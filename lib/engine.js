'use strict';
const crypto = require('crypto');
const F = require('./settings-format'), C = require('./controls-profile'), S = require('./store');
const Catalog=require('./glyph-catalog');
function sameCharacter(a, b) { return S.validMeta(a) && S.validMeta(b) && a.playerId === b.playerId && a.serverId === b.serverId && a.character === b.character && a.class === b.class; }
function selectedHashes(packet, selection) {
    const names = C.sectionsFor(selection);
    const parsed = F.parsePacket(packet);
    return names.map(name => {
        const section = parsed.sections.find(s => s.name === name); if (!section) throw Error('missing-section:' + name);
        return name + ':' + F.digest(section.decoded);
    }).join('|');
}
class Engine {
    constructor(store, now = Date.now) {
        this.store = store; this.now = now; this.current = null; this.skills = null; this.glyphs = null; this.preview = null; this.pending = null; this.lastBackupId = null;this.catalogs=new Map();
    }
    login(meta) {
        this.current = null; this.skills = null; this.glyphs = null; this.preview = null;
        if (this.pending) {
            if (!sameCharacter(meta, this.pending.target)) this.pending = null;
            else this.pending.loginConfirmed = true;
        }
    }
    observe(packet, meta) {
        if (!S.validMeta(meta)) return;
        F.parsePacket(packet);
        this.current = { packet: Buffer.from(packet), meta: Object.assign({}, meta), observedAt: this.now() };
    }
    snapshot(meta) {
        if (!this.current || !sameCharacter(meta, this.current.meta)) return null;
        const skills = this.skillSet(meta), glyphs = this.glyphSet(meta);
        const catalog=this.catalogs.get(meta.class);
        return { version: 2, meta: Object.assign({}, this.current.meta), packet: Buffer.from(this.current.packet),
            observedAt: this.current.observedAt, skills: skills === null ? null : [...skills], glyphs: glyphs === null ? null : [...glyphs],
            glyphPoints:this.glyphs&&sameCharacter(meta,this.glyphs.meta)?this.glyphs.points:null,glyphCatalog:catalog?catalog.rows.map(row=>({name:row.name,attributes:Object.assign({},row.attributes)})):null };
    }
    restoreSnapshot(snapshot, meta) {
        if (!snapshot || ![1,2].includes(snapshot.version) || !sameCharacter(snapshot.meta, meta) || !Buffer.isBuffer(snapshot.packet) ||
            !Number.isSafeInteger(snapshot.observedAt) || snapshot.observedAt < 0 || snapshot.observedAt > this.now()) return false;
        function checked(values, limit, max) {
            if (values === null) return null;
            if (!Array.isArray(values) || values.length > limit) throw Error('invalid-reload-snapshot');
            const ids = new Set();
            for (const value of values) {
                if (typeof value !== 'string' || !/^[1-9][0-9]{0,9}$/.test(value) || BigInt(value) > max || ids.has(value)) throw Error('invalid-reload-snapshot');
                ids.add(value);
            }
            return ids;
        }
        try {
            F.parsePacket(snapshot.packet);
            const skills = checked(snapshot.skills, 10000, 4294967295n), glyphs = checked(snapshot.glyphs, 2048, 2147483647n);
            const points=snapshot.version===2&&snapshot.glyphPoints!==null&&snapshot.glyphPoints!==undefined?snapshot.glyphPoints:null;
            if(points!==null&&(!Number.isSafeInteger(points)||points<0||points>1000))throw Error('invalid-reload-snapshot');
            const catalog=snapshot.version===2&&snapshot.glyphCatalog?Catalog.parse(snapshot.glyphCatalog,meta.class):null;
            this.current = { packet: Buffer.from(snapshot.packet), meta: Object.assign({}, meta), observedAt: snapshot.observedAt };
            this.skills = skills === null ? null : { ids: skills, meta: Object.assign({}, meta) };
            this.glyphs = glyphs === null ? null : { ids: glyphs, meta: Object.assign({}, meta),points };
            if(catalog)this.catalogs.set(meta.class,catalog);
            this.preview = null; this.pending = null;
            return true;
        } catch (_) { return false; }
    }
    learned(list, meta) {
        if (!S.validMeta(meta) || !Array.isArray(list) || list.length > 10000) return;
        const ids = new Set();
        for (const skill of list) {
            if (!skill || skill.active !== true) continue;
            try { const id = BigInt(skill.id); if (id > 0n && id <= 4294967295n) ids.add(id.toString()); } catch (_) {}
        }
        this.skills = { ids, meta: Object.assign({}, meta) };
    }
    requireCurrent(meta) {
        if (!this.current || !sameCharacter(meta, this.current.meta)) throw Error('current-settings-unavailable');
        return this.current;
    }
    skillSet(meta) { return this.skills && sameCharacter(meta, this.skills.meta) ? this.skills.ids : null; }
    setGlyphCatalog(rows,meta) {
        const catalog=Catalog.parse(rows,meta.class);this.catalogs.set(meta.class,catalog);
        if(this.pending&&this.pending.target.class===meta.class&&this.pending.glyphPolicy&&this.pending.glyphPolicy.catalog.fingerprint!==catalog.fingerprint)this.pending=null;
        return catalog;
    }
    glyphPolicy(meta) {
        if(this.glyphSet(meta)===null)throw Error('known-glyphs-unavailable');
        const catalog=this.catalogs.get(meta.class);if(!catalog)throw Error('glyph-catalog-unavailable');
        if(!this.glyphs||!sameCharacter(meta,this.glyphs.meta)||!Number.isSafeInteger(this.glyphs.points))throw Error('glyph-points-unavailable');
        return {catalog,points:this.glyphs.points};
    }
    knownGlyphs(list,meta,points) {
        const previousPoints=this.glyphs&&sameCharacter(meta,this.glyphs.meta)?this.glyphs.points:null;
        const preparation=this.pending&&C.sectionsFor(this.pending.selection).includes(C.GLYPHS)?this.pending:null;
        if(preparation)this.pending=null;
        this.glyphs=null;
        if(!S.validMeta(meta)||!Array.isArray(list)||list.length>2048)throw Error('invalid-known-glyphs');
        const ids=new Set();
        for(const glyph of list){if(!glyph||!Number.isSafeInteger(glyph.id)||glyph.id<=0||glyph.id>2147483647||typeof glyph.enable!=='boolean'||ids.has(String(glyph.id)))throw Error('invalid-known-glyphs');ids.add(String(glyph.id));}
        if(points!==undefined&&(!Number.isSafeInteger(points)||points<0||points>1000))throw Error('invalid-glyph-points');
        this.glyphs={ids,meta:Object.assign({},meta),points:points===undefined?previousPoints:points};
        if(preparation&&sameCharacter(meta,preparation.target)&&preparation.glyphs&&ids.size===preparation.glyphs.size&&[...ids].every(id=>preparation.glyphs.has(id))&&preparation.glyphPolicy&&this.glyphs.points===preparation.glyphPolicy.points)this.pending=preparation;
        return !!preparation&&!this.pending;
    }
    glyphSet(meta) {return this.glyphs&&sameCharacter(meta,this.glyphs.meta)?this.glyphs.ids:null;}
    glyphApplied(event, meta) {
        if (!event || !Number.isSafeInteger(event.id) || event.id <= 0 || event.id > 2147483647 || typeof event.enable !== 'boolean') throw Error('invalid-known-glyphs');
        const known = this.glyphSet(meta), id = String(event.id);
        // An individual confirmation is not a substitute for the initial full list.
        // Disabled means known-but-inactive, not unavailable (same as game-state).
        if (known === null || known.has(id)) return { changed: false, cancelled: false };
        const list = [...known].map(value => ({ id: Number(value), enable: false }));
        list.push({ id: event.id, enable: event.enable });
        return { changed: true, cancelled: this.knownGlyphs(list, meta) };
    }
    save(name, meta, ep=null) { const current = this.requireCurrent(meta); return this.store.save(name, current.packet, current.meta, ep); }
    makePreview(profile, selection, meta, undo = false) {
        if (this.pending) throw Error('pending-exists');
        const current = this.requireCurrent(meta);
        if((C.sectionsFor(selection).includes(C.BARS)||C.sectionsFor(selection).includes(C.GLYPHS))&&meta.class!==profile.source.class)throw Error('class-mismatch');
        const source = Buffer.from(profile.packetBase64, 'base64');
        const learned = this.skillSet(meta);
        const glyphs = this.glyphSet(meta);
        const glyphPolicy=C.sectionsFor(selection).includes(C.GLYPHS)?this.glyphPolicy(meta):null;
        const result = C.compose(current.packet, source, selection, meta, profile.source, learned,glyphs,{restoreBarsSnapshot:undo,restoreGlyphsSnapshot:undo,glyphPolicy});
        if (!result.changed) {
            if (result.crests && result.crests.preservedPages > 0 && result.crests.pages === 0) throw Error(result.crests.pointSkipped&&result.crests.pointSkipped.length?'glyph-points-insufficient':'no-compatible-glyphs');
            throw Error('already-matches');
        }
        this.preview = {
            token: crypto.randomBytes(16).toString('hex'), createdAt: this.now(), name: profile.name || 'Backup anterior',profileId:profile.id,
            source: Buffer.from(source), sourceMeta: Object.assign({}, profile.source), selection, target: Object.assign({}, meta),
            targetHash: selectedHashes(current.packet, selection),
            learned: learned ? new Set(learned) : null, glyphs:glyphs?new Set(glyphs):null, glyphPolicy,undo,
            details: { skills: result.bars ? result.bars.selected : null, omitted: result.bars ? result.bars.skipped.length : 0,
                adaptedRanks: result.bars ? result.bars.adaptedRanks.length : 0, bars: result.bars ? result.bars.bars : 0,
                conflicts: result.bars ? result.bars.conflicts : [], restoredBarsSnapshot: !!(result.bars && result.bars.restoredSnapshot),
                preserved: result.bars ? result.bars.preservedNonSkills : null,
                preservedUnconfirmed: result.bars ? result.bars.preservedUnconfirmed : 0,
                glyphPages:result.crests?result.crests.pages:null,glyphCount:result.crests?result.crests.selected:0,
                glyphOmitted:result.crests?result.crests.skipped.length:0,glyphPreservedPages:result.crests?result.crests.preservedPages:0,
                glyphAdapted:result.crests&&result.crests.adapted||[],glyphPointSkipped:result.crests&&result.crests.pointSkipped||[],glyphCosts:result.crests&&result.crests.pageCosts||[],glyphDuplicates:result.crests&&result.crests.duplicateSkipped?result.crests.duplicateSkipped.length:0 }
        };
        return this.publicPreview();
    }
    publicPreview() {
        if (!this.preview) return null;
        const p = this.preview;
        return { token: p.token, name: p.name, profileId:p.profileId,selection: p.selection, target: p.target.character,
            sourceCharacter: p.sourceMeta.character, details: p.details, undo: p.undo };
    }
    previewProfile(id, selection, meta) { return this.makePreview(this.store.profile(id), selection, meta); }
    previewUndo(meta) {
        const backup = this.store.lastBackup(meta); if (!backup) throw Error('backup-unavailable');
        return this.makePreview(Object.assign({}, backup, { name: 'Backup anterior' }), backup.selection, meta, true);
    }
    confirm(token, meta) {
        const preview = this.preview;
        if (!preview || preview.token !== token || this.now() - preview.createdAt > 120000 || !sameCharacter(meta, preview.target)) throw Error('preview-expired');
        const current = this.requireCurrent(meta);
        if (selectedHashes(current.packet, preview.selection) !== preview.targetHash) throw Error('settings-changed');
        if (C.sectionsFor(preview.selection).includes(C.BARS)) {
            const latest = this.skillSet(meta);
            if (!latest || latest.size !== preview.learned.size || [...latest].some(id => !preview.learned.has(id))) throw Error('skills-changed');
        }
        if(C.sectionsFor(preview.selection).includes(C.GLYPHS)){
            const latest=this.glyphSet(meta);
            if(!latest||!preview.glyphs||latest.size!==preview.glyphs.size||[...latest].some(id=>!preview.glyphs.has(id)))throw Error('glyphs-changed');
            const policy=this.glyphPolicy(meta);if(policy.points!==preview.glyphPolicy.points||policy.catalog.fingerprint!==preview.glyphPolicy.catalog.fingerprint)throw Error('glyphs-changed');
        }
        if (this.pending) throw Error('pending-exists');
        this.pending = preview; this.pending.expiresAt = this.now() + 180000; this.pending.loginConfirmed = false; this.preview = null;
    }
    cancel() { this.preview = null; this.pending = null; }
    incoming(packet, meta) {
        let result;
        const pending = this.pending;
        if (pending && pending.loginConfirmed) {
            // Consume the request once, including failures. Never apply to the next character by accident.
            this.pending = null;
            if (this.now() > pending.expiresAt || !sameCharacter(meta, pending.target)) throw Error('pending-expired-or-wrong-character');
            if (selectedHashes(packet, pending.selection) !== pending.targetHash) throw Error('settings-changed');
            const learned = this.skillSet(meta) || pending.learned;
            const glyphs = this.glyphSet(meta) || pending.glyphs;
            const glyphPolicy=C.sectionsFor(pending.selection).includes(C.GLYPHS)?this.glyphSet(meta)!==null?this.glyphPolicy(meta):pending.glyphPolicy:null;
            result = C.compose(packet, pending.source, pending.selection, meta, pending.sourceMeta, learned,glyphs,{restoreBarsSnapshot:pending.undo,restoreGlyphsSnapshot:pending.undo,glyphPolicy});
            if (!result.changed) { this.observe(packet, meta); return null; }
            // Persist the actual incoming destination, not an old cached snapshot, before changing any byte.
            const backup = this.store.backup(packet, meta, pending.selection);
            this.lastBackupId = backup.id;
            this.observe(result.packet, meta);
            return { packet: result.packet, backupId: backup.id, details: result.bars,crests:result.crests };
        }
        this.observe(packet, meta);
        return null;
    }
}
module.exports = { Engine, sameCharacter, selectedHashes };
