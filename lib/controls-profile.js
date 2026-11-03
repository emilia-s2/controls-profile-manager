'use strict';
// Pure, offline composition. Runtime application is deliberately not implemented here.
const F = require('./settings-format');
const G = require('./glyph-presets');
const KEYS = 'S1CustomizeKeyGroup', BARS = 'S1ShortCutController';
function sectionsFor(selection) {
    const modes={keys:[KEYS],bars:[BARS],both:[KEYS,BARS],glyphs:[G.NAME],all:[KEYS,BARS,G.NAME],
        'keys-glyphs':[KEYS,G.NAME],'bars-glyphs':[BARS,G.NAME]};
    if(!Object.prototype.hasOwnProperty.call(modes,selection))throw Error('invalid-selection');
    return modes[selection];
}
const NO_REFERENCE = 18446744073709551615n;
function section(packet, name) {
    const s = packet.sections.find(s => s.name === name);
    if (!s) throw Error('missing-section:' + name);
    return s;
}
function sameSchema(a, b) {
    if (F.unique(a.fields, 1, 0).value !== F.unique(b.fields, 1, 0).value) throw Error('incompatible-section-schema');
}
function readSlots(s) {
    const entries = s.fields.filter(f => f.number === 40), refs = s.fields.filter(f => f.number === 70);
    if (entries.length !== refs.length || entries.length > 1024) throw Error('invalid-slot-arrays');
    const keys = new Set();
    return entries.map((entry, index) => {
        if (entry.wire !== 2 || refs[index].wire !== 2) throw Error('invalid-slot-wire');
        const fields = F.parseFields(entry.value);
        const bar = F.unique(fields, 1, 0).value, slot = F.unique(fields, 2, 0).value;
        const type = F.unique(fields, 3, 0).value, id = F.unique(fields, 4, 0).value;
        const reference = F.unique(F.parseFields(refs[index].value), 1, 0).value;
        if (bar > 1000n || slot > 1000n || type > 4294967295n) throw Error('unsupported-slot');
        if (type === 0n && (reference !== NO_REFERENCE || id === 0n || id > 4294967295n)) throw Error('unsupported-skill-slot');
        const key = bar.toString() + ':' + slot.toString();
        if (keys.has(key)) throw Error('duplicate-slot'); keys.add(key);
        return { entry, ref: refs[index], bar, slot, type, id, key };
    });
}
function rankKey(id) {
    // Ordinary class skill IDs: group * 10000 + rank * 100 + sub-action.
    // Only the initial action is eligible. Specials, chains and synthetic
    // shortcut IDs require an exact match and never use this fallback.
    const group = id / 10000n, rank = id / 100n % 100n, sub = id % 100n;
    return group > 0n && group < 100n && rank > 0n && sub === 0n ? group.toString() : null;
}
function availableRanks(learned) {
    const ranks = new Map();
    for (const value of learned) {
        if (typeof value !== 'string' || !/^[1-9][0-9]{0,9}$/.test(value)) continue;
        const id = BigInt(value), key = rankKey(id);
        if (id > 4294967295n || key === null) continue;
        if (!ranks.has(key)) ranks.set(key, []);
        ranks.get(key).push(id);
    }
    return ranks;
}
function resolveSkill(slot, learned, ranks) {
    if (learned.has(slot.id.toString())) return slot;
    const key = rankKey(slot.id), candidates = key === null ? null : ranks.get(key);
    if (!candidates || candidates.length !== 1) return null;
    const id = candidates[0];
    const fields = F.parseFields(slot.entry.value);
    const raw = F.bytesField(40, Buffer.concat(fields.map(f => f.number === 4 ? F.intField(4, id) : f.raw)));
    const entry = F.parseFields(raw)[0];
    return Object.assign({}, slot, { id, entry, savedId: slot.id });
}
function mergeSkills(target, source, learned) {
    if (!(learned instanceof Set) || !learned.size) throw Error('learned-skills-unavailable');
    sameSchema(target, source);
    const old = readSlots(target), saved = readSlots(source).filter(s => s.type === 0n);
    const ranks = availableRanks(learned);
    const available = saved.map(s => resolveSkill(s, learned, ranks)).filter(Boolean);
    const availableKeys = new Set(available.map(s => s.key));
    if (saved.length && !available.length) throw Error('no-compatible-skills');
    const wanted = new Map(available.map(s => [s.key, s]));
    const unconfirmed = old.filter(s => s.type === 0n && !learned.has(s.id.toString()));
    const conflicts = old.filter(slot => wanted.has(slot.key) && (slot.type !== 0n || !learned.has(slot.id.toString())))
        .map(slot => ({ bar: Number(slot.bar), slot: Number(slot.slot), type: Number(slot.type), from: slot.id.toString(), to: wanted.get(slot.key).id.toString() }));
    const rows = [];
    for (const slot of old) {
        if (wanted.has(slot.key)) { rows.push(wanted.get(slot.key)); wanted.delete(slot.key); }
        else if (slot.type !== 0n || !learned.has(slot.id.toString())) rows.push(slot);
    }
    rows.push(...wanted.values());
    const fields = [];
    let insertedSlots = false, insertedRefs = false;
    for (const field of target.fields) {
        if (field.number === 40) {
            if (!insertedSlots) { fields.push(...rows.map(s => s.entry)); insertedSlots = true; }
        } else if (field.number === 70) {
            if (!insertedRefs) { fields.push(...rows.map(s => s.ref)); insertedRefs = true; }
        } else fields.push(field);
    }
    if (!insertedSlots) fields.push(...rows.map(s => s.entry));
    if (!insertedRefs) fields.push(...rows.map(s => s.ref));
    return { raw: F.rewriteSection(target, fields), selected: available.length, conflicts,
        adaptedRanks: available.filter(s => s.savedId !== undefined).map(s => ({bar:Number(s.bar),slot:Number(s.slot),from:s.savedId.toString(),to:s.id.toString()})),
        bars: new Set(available.map(s => s.bar.toString())).size,
        skipped: saved.filter(s => !availableKeys.has(s.key) && !unconfirmed.some(t => t.key === s.key && t.id === s.id))
            .map(s => ({ bar: Number(s.bar), slot: Number(s.slot), skill: s.id.toString() })),
        preservedUnconfirmed: unconfirmed.filter(s => !availableKeys.has(s.key)).length,
        preservedNonSkills: old.filter(s => s.type !== 0n && !availableKeys.has(s.key)).length };
}
function requireBackupOwner(targetMeta, sourceMeta) {
    if (!Number.isSafeInteger(targetMeta.playerId) || !Number.isSafeInteger(targetMeta.serverId) || typeof targetMeta.character !== 'string' || !targetMeta.character ||
        targetMeta.playerId !== sourceMeta.playerId || targetMeta.serverId !== sourceMeta.serverId || targetMeta.character !== sourceMeta.character) throw Error('backup-character-mismatch');
}
function restoreBarsSnapshot(target, source, targetMeta, sourceMeta, learned) {
    requireBackupOwner(targetMeta, sourceMeta);
    if (!(learned instanceof Set) || !learned.size) throw Error('learned-skills-unavailable');
    sameSchema(target, source); readSlots(target); const saved = readSlots(source);
    return { raw: source.rootField.raw, selected: saved.filter(s => s.type === 0n && learned.has(s.id.toString())).length,
        conflicts: [], restoredSnapshot: true, adaptedRanks: [], skipped: [], bars: new Set(saved.map(s => s.bar.toString())).size,
        preservedUnconfirmed: saved.filter(s => s.type === 0n && !learned.has(s.id.toString())).length,
        preservedNonSkills: saved.filter(s => s.type !== 0n).length };
}
function compose(targetInput, sourceInput, selection, targetMeta, sourceMeta, learned, glyphs, options = {}) {
    const names=sectionsFor(selection);
    if (!targetMeta || !sourceMeta || targetMeta.protocol !== 376012 || sourceMeta.protocol !== 376012 ||
        targetMeta.majorPatch !== 100 || sourceMeta.majorPatch !== 100 || targetMeta.minorPatch !== 2 || sourceMeta.minorPatch !== 2)
        throw Error('unsupported-protocol');
    if ((names.includes(BARS)||names.includes(G.NAME)) && (!targetMeta.class || targetMeta.class !== sourceMeta.class)) throw Error('class-mismatch');
    const target = F.parsePacket(targetInput), source = F.parsePacket(sourceInput), replacements = new Map();
    let bars = null,crests=null;
    if (names.includes(KEYS)) {
        const a = section(target, KEYS), b = section(source, KEYS); sameSchema(a, b);
        replacements.set(KEYS, a.decoded.equals(b.decoded) ? a.rootField.raw : b.rootField.raw);
    }
    if (names.includes(BARS)) {
        bars = options.restoreBarsSnapshot === true ? restoreBarsSnapshot(section(target, BARS), section(source, BARS), targetMeta, sourceMeta, learned) :
            mergeSkills(section(target, BARS), section(source, BARS), learned);
        replacements.set(BARS, bars.raw);
    }
    if(names.includes(G.NAME)) {
        const saved=source.sections.find(s=>s.name===G.NAME);if(!saved)throw Error('profile-has-no-glyphs');
        if (options.restoreGlyphsSnapshot === true) {
            requireBackupOwner(targetMeta, sourceMeta);
            if (!(glyphs instanceof Set)) throw Error('known-glyphs-unavailable');
            G.read(section(target,G.NAME)); const pages=G.read(saved);
            if (pages.some(p=>p.glyphs.some(g=>!glyphs.has(g.id)))) throw Error('backup-glyphs-unavailable');
            if(options.glyphPolicy&&pages.some(p=>p.glyphs.reduce((sum,g)=>{const item=options.glyphPolicy.catalog.items.get(g.id);return item?sum+item.cost:Infinity;},0)>options.glyphPolicy.points))throw Error('backup-glyph-points-unavailable');
            crests={raw:saved.rootField.raw,pages:pages.length,selected:pages.reduce((n,p)=>n+p.glyphs.length,0),skipped:[],preservedPages:0};
        } else crests=G.merge(section(target,G.NAME),saved,glyphs,options.glyphPolicy||null);
        replacements.set(G.NAME,crests.raw);
    }
    const packet = F.rewritePacket(target, replacements);
    const check = F.parsePacket(packet);
    for (const s of target.sections) if (!replacements.has(s.name)) {
        if (!section(check, s.name).rootField.raw.equals(s.rootField.raw)) throw Error('unrelated-section-was-modified');
    }
    return { packet, bars, crests, changed: !packet.equals(targetInput) };
}
module.exports = { compose, readSlots, KEYS, BARS,GLYPHS:G.NAME,sectionsFor };
