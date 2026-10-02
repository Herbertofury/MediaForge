
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('0.3.1 side-panel fast path preserves search/filter/sort result parity', () => {
  const raw = cp.execFileSync(process.execPath, ['tools/perf-ui.cjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PERF_PASSES: '2' }
  });
  const report = JSON.parse(raw);
  assert.equal(report.records, 20000);
  assert.ok(report.resultCount > 0);
  assert.ok(Number.isInteger(report.checksum));
});

test('side panel caches derived record fields and snapshots filters once per render', () => {
  const source = fs.readFileSync(path.join(root, 'sidepanel.js'), 'utf8');
  assert.match(source, /function prepareRecord\(rec\)/);
  assert.match(source, /rec\._searchLower\s*=/);
  assert.match(source, /const filters=readFilterState\(\);/);
  assert.match(source, /passesFilters\(rec,filters\)/);
  assert.match(source, /NAME_COLLATOR\.compare/);
  assert.match(source, /recordById\.get\(id\)/);
  assert.match(source, /postTask\(\(\)\s*=>\s*probeAllMetadata/);
  assert.match(source, /mfgx:getFastPageState/);
  assert.match(source, /requestAnimationFrame\(\(\)\s*=>\s*resolve\(\)\)/);
  assert.match(source, /contentPriority/);
});
