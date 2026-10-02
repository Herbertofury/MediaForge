(function (root) {
  'use strict';

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(data) {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function sanitizePath(raw, fallback = 'media.bin') {
    const parts = String(raw || '')
      .replace(/\\/g, '/')
      .split('/')
      .map((part) => part.normalize('NFKC').replace(/[<>:"|?*\u0000-\u001f\u007f]/g, '_').replace(/[. ]+$/g, '').trim())
      .filter((part) => part && part !== '.' && part !== '..');
    return (parts.join('/') || fallback).slice(0, 240);
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((Math.floor(date.getSeconds() / 2)) & 31);
    const day = ((year - 1980) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
    return { time, date: day };
  }

  function u16(value) {
    const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, value >>> 0, true); return b;
  }
  function u32(value) {
    const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value >>> 0, true); return b;
  }
  function concat(parts) {
    const size = parts.reduce((n, p) => n + p.byteLength, 0);
    const out = new Uint8Array(size); let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.byteLength; }
    return out;
  }

  function localHeader(nameBytes, size, crc, stamp) {
    return concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.date),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), nameBytes
    ]);
  }

  function centralHeader(nameBytes, size, crc, stamp, offset) {
    return concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(stamp.time), u16(stamp.date),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes
    ]);
  }

  function buildStoredZip(files, options = {}) {
    if (!Array.isArray(files) || !files.length) throw new Error('ZIP needs at least one file.');
    if (files.length > 65535) throw new Error('This ZIP would exceed the classic ZIP file-count limit.');
    const encoder = new TextEncoder();
    const stamp = dosDateTime(options.date || new Date());
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;

    for (const file of files) {
      const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data || 0);
      if (data.byteLength > 0xffffffff) throw new Error('A file exceeds the 4 GiB classic ZIP limit.');
      const name = sanitizePath(file.name, 'media.bin');
      const nameBytes = encoder.encode(name);
      if (nameBytes.length > 65535) throw new Error('A ZIP filename is too long.');
      const crc = crc32(data);
      const head = localHeader(nameBytes, data.byteLength, crc, stamp);
      localParts.push(head, data);
      centralParts.push(centralHeader(nameBytes, data.byteLength, crc, stamp, localOffset));
      localOffset += head.byteLength + data.byteLength;
      if (localOffset > 0xffffffff) throw new Error('This archive exceeds the classic ZIP 4 GiB offset limit.');
    }

    const centralSize = centralParts.reduce((n, p) => n + p.byteLength, 0);
    if (centralSize > 0xffffffff) throw new Error('ZIP central directory is too large.');
    const end = concat([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralSize), u32(localOffset), u16(0)
    ]);
    return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
  }

  const api = { crc32, sanitizePath, dosDateTime, buildStoredZip };
  root.MediaForgeZipCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
