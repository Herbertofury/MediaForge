const test = require('node:test');
const assert = require('node:assert/strict');
const Z = require('../src/zip-core.js');

test('crc32 matches the standard check vector', () => {
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(Z.crc32(bytes), 0xcbf43926);
});

test('sanitizes unsafe ZIP paths without flattening folders', () => {
  assert.equal(Z.sanitizePath('../bad:name/a?.png'), 'bad_name/a_.png');
});

test('builds a valid stored ZIP envelope', async () => {
  const blob = Z.buildStoredZip([
    { name: 'one.txt', data: new TextEncoder().encode('one') },
    { name: 'folder/two.txt', data: new TextEncoder().encode('two') }
  ], { date: new Date('2026-01-01T00:00:00Z') });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(bytes.length - 12, true), 2);
});
