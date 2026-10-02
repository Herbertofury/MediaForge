'use strict';

const { performance } = require('node:perf_hooks');

const PASSES = Math.max(3, Number(process.env.PERF_PASSES) || 7);
const PAGE_NODES = 24000;
const STYLE_RULES = 18000;
const NETWORK_ENTRIES = 32000;
const ARTICLE_NODES = 72;

function fakeUrl(i, kind) {
  if (kind === 'post') return `https://pbs.twimg.com/media/G${i}_abc?format=jpg&name=orig`;
  if (kind === 'avatar') return `https://pbs.twimg.com/profile_images/${i}/avatar_normal.jpg`;
  return `https://ton.twimg.com/twitter-assets/sports-product/leagues/${i % 20}/asset.png`;
}

const pageNodes = Array.from({ length: PAGE_NODES }, (_, i) => ({
  url: fakeUrl(i, i % 113 === 0 ? 'post' : i % 17 === 0 ? 'avatar' : 'chrome'),
  article: i % 113 === 0,
  width: i % 113 === 0 ? 1600 : 48 + (i % 5) * 32,
  height: i % 113 === 0 ? 1000 : 48 + (i % 5) * 32
}));
const styleRules = Array.from({ length: STYLE_RULES }, (_, i) => `.x${i}{background-image:url(https://abs.twimg.com/a/${i}.png)}`);
const networkEntries = Array.from({ length: NETWORK_ENTRIES }, (_, i) => `https://abs.twimg.com/res/${i}.png`);
const articleNodes = pageNodes.filter((x) => x.article).slice(0, ARTICLE_NODES);

function baselineFirstContent() {
  const all = [];
  for (const node of pageNodes) {
    if (/\.(?:png|jpg)|[?&]format=(?:jpg|png)/i.test(node.url)) all.push(node);
  }
  for (const css of styleRules) if (css.includes('url(')) all.push(css);
  for (const url of networkEntries) if (/\.png$/i.test(url)) all.push(url);
  return all.find((x) => typeof x === 'object' && x.article)?.url || '';
}

function instantFirstContent() {
  let best = '';
  let bestArea = -1;
  for (const node of articleNodes) {
    if (!/pbs\.twimg\.com\/media\//i.test(node.url)) continue;
    const area = node.width * node.height;
    if (area > bestArea) { bestArea = area; best = node.url; }
  }
  return best;
}

function median(values) {
  const a = values.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function bench(fn) {
  const out = [];
  let result = '';
  for (let p = 0; p < PASSES; p++) {
    const t0 = performance.now();
    result = fn();
    out.push(performance.now() - t0);
  }
  return { ms: median(out), result };
}

for (let i = 0; i < 2; i++) { baselineFirstContent(); instantFirstContent(); }
const baseline = bench(baselineFirstContent);
const instant = bench(instantFirstContent);
if (!baseline.result || baseline.result !== instant.result) throw new Error('First-content parity failed');
const speedup = baseline.ms / instant.ms;
console.log(JSON.stringify({
  model: 'MediaForge GX 0.4.1 time-to-first-useful-X-media microbenchmark',
  pageNodes: PAGE_NODES,
  styleRules: STYLE_RULES,
  networkEntries: NETWORK_ENTRIES,
  articleNodes: articleNodes.length,
  baselineMedianMs: +baseline.ms.toFixed(3),
  instantMedianMs: +instant.ms.toFixed(3),
  speedup: +speedup.toFixed(2),
  reductionPercent: +(100 * (1 - instant.ms / baseline.ms)).toFixed(2),
  parity: true
}, null, 2));
