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

test('normalizes compatibility separators before removing traversal segments', () => {
  for (const separator of ['／', '＼']) {
    assert.equal(Z.sanitizePath(`．．${separator}outside.txt`), 'outside.txt');
    assert.equal(Z.sanitizePath(`safe${separator}．．${separator}file.txt`), 'safe/file.txt');
  }
});

test('emitted ZIP local and central names exclude normalized traversal', async () => {
  const payload = Uint8Array.of(7, 8, 9);
  const blob = Z.buildStoredZip([{ name: '．．／outside.txt', data: payload }]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const nameLength = view.getUint16(26, true);
  assert.equal(new TextDecoder().decode(bytes.subarray(30, 30 + nameLength)), 'outside.txt');
  assert.deepEqual(bytes.subarray(30 + nameLength, 33 + nameLength), payload);
  const central = 33 + nameLength;
  assert.equal(view.getUint32(central, true), 0x02014b50);
  const centralNameLength = view.getUint16(central + 28, true);
  assert.equal(new TextDecoder().decode(bytes.subarray(central + 46, central + 46 + centralNameLength)), 'outside.txt');
});
