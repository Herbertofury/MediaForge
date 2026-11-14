const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/background.js');

function fixture(t, { session = true, failOpen = false, failCleanup = false } = {}) {
  const saved = new Map([['unrelated', { retained: true }]]);
  const removed = [];
  const area = {
    async set(items) { for (const [key, value] of Object.entries(items)) saved.set(key, value); },
    async remove(key) { removed.push(key); if (failCleanup) throw new Error('cleanup unavailable'); saved.delete(key); },
    async get(defaults) { return defaults; }
  };
  const chrome = {
    storage: { local: area, ...(session ? { session: area } : {}) },
    runtime: { getURL: (url) => `chrome-extension://fixture/${url}` },
    tabs: { async create(options) { if (failOpen) throw new Error('tab creation rejected'); return { id: 42, ...options }; } }
  };
  const previous = globalThis.chrome;
  globalThis.chrome = chrome;
  t.after(() => { if (previous === undefined) delete globalThis.chrome; else globalThis.chrome = previous; });
  return { saved, removed };
}
const record = { url: 'https://example.test/video.mp4', type: 'video' };
const queue = { gif: () => B.queueGif(record, {}), zip: () => B.queueZip([record]) };

for (const [kind, start] of Object.entries(queue)) {
  for (const session of [true, false]) {
    test(`${kind} tab creation failure releases only its own ${session ? 'session' : 'local'} job`, async (t) => {
      const f = fixture(t, { session, failOpen: true });
      await assert.rejects(start(), /tab creation rejected/);
      assert.deepEqual([...f.saved.keys()], ['unrelated']);
      assert.equal(f.removed.length, 1);
      assert(f.removed[0].startsWith(`${kind}Job:`));
    });
  }
  test(`${kind} opened tab retains its job for consumption`, async (t) => {
    const f = fixture(t);
    const result = await start();
    assert.equal(result.ok, true); assert.equal(result.queued, true);
    assert.equal(result[`${kind === 'gif' ? 'converter' : 'zipper'}TabId`], 42);
    assert(f.saved.has(`${kind}Job:${result.jobId}`));
    assert.equal(f.removed.length, 0);
  });
  test(`${kind} cleanup failure does not mask original tab failure`, async (t) => {
    const f = fixture(t, { failOpen: true, failCleanup: true });
    await assert.rejects(start(), /tab creation rejected/);
    assert.equal(f.removed.length, 1);
    assert(f.saved.has('unrelated'));
  });
}
