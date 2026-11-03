'use strict';
// Offline analysis only. No Toolbox hooks, network writes or game file writes.
const zlib = require('zlib');
const crypto = require('crypto');
const LIMIT = 1024 * 1024;
const digest = b => crypto.createHash('sha256').update(b).digest('hex');

function parseFields(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length > LIMIT) throw Error('invalid-message-size');
    const fields = [];
    let offset = 0;
    function varint() {
        let value = 0n;
        for (let count = 0; count < 10; count++) {
            if (offset >= buffer.length) throw Error('truncated-varint');
            const byte = buffer[offset++];
            if (count === 9 && byte > 1) throw Error('varint-overflow');
            value |= BigInt(byte & 127) << BigInt(count * 7);
            if (!(byte & 128)) return value;
        }
        throw Error('varint-overflow');
    }
    while (offset < buffer.length) {
        const start = offset;
        const tag = varint();
        const number = Number(tag >> 3n), wire = Number(tag & 7n);
        if (number < 1 || number > 536870911 || ![0, 1, 2, 5].includes(wire)) throw Error('invalid-tag');
        let value;
        if (wire === 0) value = varint();
        else {
            const length = wire === 2 ? Number(varint()) : (wire === 1 ? 8 : 4);
            if (!Number.isSafeInteger(length) || length > buffer.length - offset) throw Error('invalid-field-length');
            value = buffer.subarray(offset, offset + length);
            offset += length;
        }
        fields.push({ number, wire, value, raw: buffer.subarray(start, offset) });
        if (fields.length > 10000) throw Error('too-many-fields');
    }
    return fields;
}

function unique(fields, number, wire) {
    const values = fields.filter(f => f.number === number);
    if (values.length !== 1 || values[0].wire !== wire) throw Error('missing-or-duplicate-field-' + number);
    return values[0];
}

function parsePacket(input) {
    if (!Buffer.isBuffer(input) || input.length < 8 || input.length > 65535 || input.readUInt16LE(0) !== input.length ||
        input.readUInt16LE(4) !== 8 || input.readUInt16LE(6) !== input.length - 8) throw Error('invalid-settings-packet');
    const packet = Buffer.from(input);
    const fields = parseFields(packet.subarray(8));
    if (unique(fields, 1, 0).value !== 11031n || !unique(fields, 2, 2).value.equals(Buffer.from('32234350', 'hex')))
        throw Error('unsupported-envelope');
    const names = new Set();
    let totalDecoded = 0;
    const sections = fields.filter(f => f.number === 10).map(rootField => {
        if (rootField.wire !== 2) throw Error('invalid-section-wire');
        const envelope = parseFields(rootField.value);
        if (unique(envelope, 1, 0).value !== 11031n) throw Error('unsupported-section');
        const text = unique(envelope, 10, 2).value;
        if (text.length < 4 || text.length > 512 || text.length % 2)
            throw Error('invalid-section-name');
        const name = text.toString('utf16le');
        if (name.includes('\0') || names.has(name)) throw Error('duplicate-or-invalid-section');
        names.add(name);
        const packed = unique(envelope, 20, 2).value;
        const compressed = unique(envelope, 30, 0).value;
        const length = unique(envelope, 40, 0).value;
        if ((compressed !== 0n && compressed !== 1n) || length > BigInt(LIMIT)) throw Error('invalid-section-length');
        const decoded = compressed === 1n ? zlib.inflateSync(packed, { maxOutputLength: LIMIT }) : Buffer.from(packed);
        if (BigInt(decoded.length) !== length) throw Error('decoded-length-mismatch');
        totalDecoded += decoded.length;
        if (totalDecoded > 4 * LIMIT) throw Error('total-decoded-limit');
        return { name, envelope, rootField, packed, decoded, fields: parseFields(decoded), compressed: compressed === 1n };
    });
    return { packet, fields, sections };
}

function fieldSummary(fields) {
    const map = new Map();
    for (const field of fields) {
        const key = field.number + ':' + field.wire;
        const current = map.get(key) || { number: field.number, wire: field.wire, count: 0 };
        current.count++;
        map.set(key, current);
    }
    return [...map.values()];
}

function summary(parsed) {
    return parsed.sections.map(s => ({ name: s.name, compressed: s.compressed,
        packedBytes: s.packed.length, decodedBytes: s.decoded.length, sha256: digest(s.decoded), fields: fieldSummary(s.fields) }));
}

function compare(before, after) {
    const names = new Set(before.sections.map(s => s.name).concat(after.sections.map(s => s.name)));
    const changes = [];
    for (const name of names) {
        const a = before.sections.find(s => s.name === name), b = after.sections.find(s => s.name === name);
        if (!a || !b) { changes.push({ name, change: a ? 'removed' : 'added' }); continue; }
        if (a.decoded.equals(b.decoded)) continue;
        const fieldNumbers = new Set(a.fields.map(f => f.number).concat(b.fields.map(f => f.number)));
        const changedFields = [];
        for (const number of fieldNumbers) {
            const aa = a.fields.filter(f => f.number === number), bb = b.fields.filter(f => f.number === number);
            if (aa.length !== bb.length || aa.some((f, i) => !bb[i] || !f.raw.equals(bb[i].raw))) {
                const changedIndices = [];
                for (let i = 0; i < Math.max(aa.length, bb.length); i++)
                    if (!aa[i] || !bb[i] || !aa[i].raw.equals(bb[i].raw)) changedIndices.push(i);
                changedFields.push({ number, beforeCount: aa.length, afterCount: bb.length, changedIndices });
            }
        }
        changes.push({ name, change: 'modified', beforeBytes: a.decoded.length, afterBytes: b.decoded.length, changedFields });
    }
    return changes;
}

function varint(value) {
    value = BigInt(value);
    if (value < 0n || value > 18446744073709551615n) throw Error('invalid-uint64');
    const bytes = [];
    do { let b = Number(value & 127n); value >>= 7n; if (value) b |= 128; bytes.push(b); } while (value);
    return Buffer.from(bytes);
}
function bytesField(number, value) {
    return Buffer.concat([varint(number * 8 + 2), varint(value.length), value]);
}
function intField(number, value) { return Buffer.concat([varint(number * 8), varint(value)]); }
function rewriteSection(section, fields) {
    const decoded = Buffer.concat(fields.map(f => f.raw));
    if (decoded.length > LIMIT) throw Error('section-too-large');
    if (decoded.equals(section.decoded)) return section.rootField.raw;
    const packed = section.compressed ? zlib.deflateSync(decoded) : decoded;
    return bytesField(10, Buffer.concat(section.envelope.map(f => f.number === 20 ? bytesField(20, packed) :
        f.number === 40 ? intField(40, decoded.length) : f.raw)));
}
function rewritePacket(parsed, replacements) {
    const body = Buffer.concat(parsed.fields.map(f => {
        const s = parsed.sections.find(s => s.rootField === f);
        return s && replacements.has(s.name) ? replacements.get(s.name) : f.raw;
    }));
    if (body.length + 8 > 65535) throw Error('packet-too-large');
    const header = Buffer.from(parsed.packet.subarray(0, 8));
    header.writeUInt16LE(body.length + 8, 0); header.writeUInt16LE(body.length, 6);
    const result = Buffer.concat([header, body]);
    parsePacket(result);
    return result;
}
module.exports = { parseFields, parsePacket, unique, summary, compare, digest, varint, bytesField, intField, rewriteSection, rewritePacket };
