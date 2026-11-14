const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/background.js');

test('sanitizes Windows-reserved and unsafe filename parts', () => {
  assert.equal(B.sanitizeSegment('CON'), '_CON');
  assert.equal(B.sanitizeSegment('bad:name?.mp4'), 'bad_name_.mp4');
  assert.equal(B.sanitizeFolder('MediaForge GX/../bad:*folder'), 'MediaForge GX/bad__folder');
});

test('builds stable X media filename', () => {
  const name = B.buildFilename({handle:'skarlët',tweetId:'123456789',index:2,type:'video',ext:'mp4',url:'https://video.twimg.com/x.mp4'}, {folder:'MediaForge GX'}, null);
  assert.equal(name, 'MediaForge GX/skarlët-123456789-2.mp4');
});

test('recognizes direct web and data download URLs while rejecting blob/script URLs', () => {
  assert.equal(B.isDownloadableUrl('https://video.twimg.com/a.mp4'), true);
  assert.equal(B.isDownloadableUrl('data:image/png;base64,AA=='), true);
  assert.equal(B.isDownloadableUrl('blob:https://x.com/abc'), false);
  assert.equal(B.isDownloadableUrl('javascript:alert(1)'), false);
});

test('calculates data URL byte size and MIME type', () => {
  const meta = B.dataUrlMeta('data:text/plain;base64,SGVsbG8=');
  assert.equal(meta.sizeBytes, 5);
  assert.equal(meta.mime, 'text/plain');
});

test('merges duplicate records without losing richer metadata', () => {
  const merged = B.mergeRecord({url:'https://x.test/a.jpg',width:320,height:200,source:'img',position:9},{url:'https://x.test/a.jpg',width:1280,height:720,source:'css',position:3,sizeBytes:1234});
  assert.equal(merged.width, 1280);
  assert.equal(merged.height, 720);
  assert.equal(merged.sizeBytes, 1234);
  assert.equal(merged.position, 3);
  assert.deepEqual(new Set(merged.sources), new Set(['img','css']));
});

test('data URL metadata matches actual decoded binary, Unicode and parameterized payloads', async () => {
  for (const url of [
    'data:application/octet-stream,%FF%00%80',
    'data:text/plain;charset=utf-8,%E2%82%AC',
    'data:text/plain,é%FF%20hello',
    'data:text/plain;charset=utf-8;base64,SGVsbG8%3D'
  ]) {
    const response = await fetch(url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const metadata = B.dataUrlMeta(url);
    assert.ok(metadata, url);
    assert.equal(metadata.sizeBytes, bytes.byteLength, url);
    assert.equal(metadata.mime, response.headers.get('content-type').split(';')[0]);
  }
});

test('download names protect Windows device stems even with multiple extensions', () => {
  for (const stem of ['CON', 'nul', 'COM1', 'LPT³']) {
    const normalized = stem.normalize('NFKC');
    assert.equal(B.sanitizeSegment(`${stem}.backup.jpg`), `_${normalized}.backup.jpg`);
    assert.equal(B.buildFilename({ url: `https://example.test/${stem}.backup.jpg` }, { folder: 'AUX.photos' }), `_AUX.photos/_${normalized}.backup.jpg`);
  }
  assert.equal(B.sanitizeSegment('console.jpg'), 'console.jpg');
  assert.equal(B.sanitizeSegment('COM10.jpg'), 'COM10.jpg');
});

test('filename limits cannot reintroduce trailing dots or spaces', () => {
  assert.equal(B.sanitizeSegment('abc.def', 'media', 4), 'abc');
  assert.equal(B.sanitizeSegment('abc def', 'media', 4), 'abc');
  assert.equal(B.sanitizeFolder('a'.repeat(59) + '.suffix'), 'a'.repeat(59));
});

test('range metadata never mistakes a partial response length for whole-media size', () => {
  const meta = (status, headers) => B.parseRemoteMeta(new Response(null, { status, headers }), 'RANGE');
  assert.equal(meta(206, { 'content-range': 'bytes 0-0/*', 'content-length': '1' }).sizeBytes, null);
  assert.equal(meta(206, { 'content-length': '1' }).sizeBytes, null);
  assert.equal(meta(206, { 'content-range': 'bytes 0-0/12345', 'content-length': '1' }).sizeBytes, 12345);
  assert.equal(meta(200, { 'content-length': '12345' }).sizeBytes, 12345);
  for (const length of ['-1', 'Infinity', '1.5', '9007199254740992']) {
    assert.equal(meta(200, { 'content-length': length }).sizeBytes, null);
  }
});

test('duplicate discovery keeps dimensions from one observation rather than inventing a square', () => {
  const landscape = { url: 'https://example.test/a.jpg', width: 1920, height: 1080, source: 'img' };
  const portrait = { ...landscape, width: 1080, height: 1920, source: 'css' };
  const merged = B.mergeRecord(landscape, portrait);
  assert.deepEqual([merged.width, merged.height], [1080, 1920]);
  assert.deepEqual(new Set(merged.sources), new Set(['img', 'css']));
  assert.deepEqual([B.mergeRecord(portrait, landscape).width, B.mergeRecord(portrait, landscape).height], [1920, 1080]);
});

test('dimension enrichment prefers complete pairs and never combines partial observations', () => {
  const full = { width: 1280, height: 720 };
  for (const sparse of [{ width: 9999 }, {}, { width: Infinity, height: 9000 }, { width: -1, height: 9000 }]) {
    for (const [a, b] of [[full, sparse], [sparse, full]]) {
      const result = B.mergeRecord(a, b);
      assert.deepEqual([result.width, result.height], [1280, 720]);
    }
  }
  const partial = B.mergeRecord({ width: 640 }, { height: 480 });
  assert.deepEqual([partial.width, partial.height], [null, 480]);
});

test('failed range fallback cannot replace successful HEAD metadata with error-page metadata', async (t) => {
  const calls = [];
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls.push(options.method);
    if (options.method === 'HEAD') return new Response(null, { headers: { 'content-length': '12345' } });
    return { ok: false, status: 403, headers: new Headers({ 'content-length': '9', 'content-type': 'text/html' }), body: { cancel: async () => { cancelled = true; } } };
  });
  const result = await B.probeMedia('https://example.test/preserve-head-metadata');
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.method, 'HEAD');
  assert.equal(result.sizeBytes, 12345);
  assert.equal(result.mime, null);
  assert.equal(cancelled, true);
  assert.deepEqual(calls, ['HEAD', 'GET']);
});

test('successful range fallback still enriches incomplete HEAD evidence', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => options.method === 'HEAD'
    ? new Response(null, { headers: { 'content-length': '12345' } })
    : new Response(null, { status: 206, headers: { 'content-range': 'bytes 0-0/12345', 'content-length': '1', 'content-type': 'video/mp4' } }));
  const result = await B.probeMedia('https://example.test/enrich-head-metadata');
  assert.equal(result.ok, true);
  assert.equal(result.status, 206);
  assert.equal(result.method, 'RANGE');
  assert.equal(result.sizeBytes, 12345);
  assert.equal(result.mime, 'video/mp4');
});

test('successful fallback does not inherit the failed HEAD error MIME type', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => options.method === 'HEAD'
    ? new Response(null, { status: 405, headers: { 'content-type': 'text/html' } })
    : new Response(null, { status: 206, headers: { 'content-range': 'bytes 0-0/12345' } }));
  const result = await B.probeMedia('https://example.test/no-error-mime');
  assert.equal(result.ok, true);
  assert.equal(result.sizeBytes, 12345);
  assert.equal(result.mime, null);
});

test('transport failures cool down briefly then recover on a new probe without retry storms', async (t) => {
  let now = 100000, requests = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    if (requests === 1) throw new TypeError('Temporary network failure');
    return new Response(null, { headers: { 'content-length': '2048', 'content-type': 'image/png' } });
  });
  const url = 'https://example.test/recover-transient-network';
  assert.equal((await B.probeMedia(url)).ok, false);
  assert.equal((await B.probeMedia(url)).cached, true);
  assert.equal(requests, 1);
  now += 15000;
  const [first, second] = await Promise.all([B.probeMedia(url), B.probeMedia(url)]);
  assert.equal(first.ok, true);assert.equal(second.ok, true);
  assert.equal(first.sizeBytes, 2048);assert.equal(requests, 2);
  now += 60000;
  assert.equal((await B.probeMedia(url)).cached, true);assert.equal(requests, 2);
});

test('HTTP denial keeps its existing cache policy rather than gaining transport retries', async (t) => {
  let now = 200000, requests = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response(null, { status: 403, headers: { 'content-length': '9', 'content-type': 'text/html' } });
  });
  const url = 'https://example.test/cache-denial-unchanged';
  assert.equal((await B.probeMedia(url)).ok, false);
  now += 60000;
  const result = await B.probeMedia(url);
  assert.equal(result.status, 403);assert.equal(result.cached, true);assert.equal(requests, 1);
});

test('data URL fragments are not counted as payload while escaped hashes and query text are', async () => {
  for (const url of ['data:text/plain,hello#view', 'data:text/plain,%23hello?x=1#view', 'data:text/plain;base64,SGVsbG8=#view', 'DATA:text/plain,hello']) {
    const actual = await (await fetch(url)).arrayBuffer();
    const meta = B.dataUrlMeta(url);
    assert.ok(meta, url);assert.equal(meta.sizeBytes, actual.byteLength, url);
  }
  assert.equal(B.dataUrlMeta('https://example.test/file'), null);
});

test('metadata probe accepts a case-insensitive data scheme without fetching', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must stay local'); });
  const result = await B.probeMedia('DATA:text/plain,hello#view');
  assert.equal(result.ok, true);assert.equal(result.sizeBytes, 5);assert.equal(result.method, 'data');
});
