
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('instant content lane reaches the same first X post media at >10x modeled speedup', () => {
  const raw = cp.execFileSync(process.execPath, ['tools/perf-first-content.cjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, PERF_PASSES: '3' } });
  const report = JSON.parse(raw);
  assert.equal(report.parity, true);
  assert.ok(report.speedup >= 10, `expected >=10x time-to-first-content speedup, got ${report.speedup}x`);
});

test('content script exposes a priority-only fast snapshot and does not duplicate shadow roots', () => {
  const source = fs.readFileSync(path.join(root, 'src/content.js'), 'utf8');
  assert.match(source, /function collectPriorityMedia\(\)/);
  assert.match(source, /__MFGX_FRAME_FAST_SNAPSHOT__/);
  assert.match(source, /xPostMedia:\s*true/);
  assert.doesNotMatch(source, /openRoots\.push\(root\);\s*openRoots\.push\(root\);/);
});
