'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('0.3 hot paths cut initial and repeated workload without reducing result coverage', () => {
  const raw = cp.execFileSync(process.execPath, ['tools/perf-model.cjs'], { cwd: root, encoding: 'utf8' });
  const report = JSON.parse(raw);
  assert.ok(report.xMutationDecorating.reductionPercent >= 95);
  assert.ok(report.sidePanelInitialDom.reductionPercent >= 90);
  assert.ok(report.deepDomCollection.reductionPercent >= 80);
  assert.equal(report.assumptions.galleryItems, 2000);
  assert.equal(report.sidePanelInitialDom.v03CardsConstructed, 72);
});
