'use strict';

const DEFAULTS = Object.freeze({
  hoverTools: true,
  xButtons: true,
  integratePicviewer: true,
  preferPicviewerBar: true,
  saveAs: false,
  folder: 'MediaForge GX',
  gifFps: 20,
  gifMaxWidth: 0,
  gifQuality: 'maximum',
  autoProbeSizes: true,
  defaultSort: 'position',
  defaultLayout: 'list'
});

const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const META_CACHE_TTL = 20 * 60 * 1000;
const META_CACHE_MAX = 2500;
const metaCache = new Map();
const metaInflight = new Map();
const tabScanInflight = new Map();

function workerYield() {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function sanitizeSegment(value, fallback = 'media', max = 90) {
  let s = String(value ?? '')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, max);
  if (!s) s = fallback;
  if (WIN_RESERVED.test(s)) s = `_${s}`;
  return s;
}

function sanitizeFolder(raw) {
  return String(raw || '')
    .split(/[\\/]+/)
    .map((s) => sanitizeSegment(s, '', 60))
    .filter(Boolean)
    .slice(0, 5)
    .join('/');
}

function extFor(rec) {
  const raw = String(rec?.ext || '').replace(/^\./, '').toLowerCase();
  if (/^[a-z0-9]{2,8}$/.test(raw)) return raw;
  try {
    const u = new URL(rec?.url || '');
    if (u.protocol === 'data:') {
      const mime = String(rec?.mime || u.pathname.split(',')[0].split(';')[0] || '');
      const map = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg','video/mp4':'mp4','video/webm':'webm','audio/mpeg':'mp3','audio/mp4':'m4a','audio/aac':'aac','audio/ogg':'ogg','audio/opus':'opus','audio/wav':'wav','audio/x-wav':'wav','audio/flac':'flac'};
      if (map[mime]) return map[mime];
    }
    const fmt = u.searchParams.get('format');
    if (fmt && /^[a-z0-9]{2,8}$/i.test(fmt)) return fmt.toLowerCase();
    const m = u.pathname.match(/\.([a-z0-9]{2,8})$/i);
    if (m) return m[1].toLowerCase();
  } catch (_) {}
  if (rec?.type === 'video' || rec?.type === 'gif') return 'mp4';
  if (rec?.type === 'audio') return 'mp3';
  if (rec?.type === 'svg') return 'svg';
  return 'bin';
}

function filenameFromUrl(raw) {
  try {
    const u = new URL(raw);
    const part = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    if (part && /\.[a-z0-9]{2,8}$/i.test(part)) return sanitizeSegment(part, '', 120);
  } catch (_) {}
  return '';
}

function buildFilename(rec, settings, forceExt) {
  const folder = sanitizeFolder(settings.folder);
  const handle = sanitizeSegment(String(rec?.handle || rec?.site || rec?.hostname || 'media').replace(/^@/, ''), 'media', 40);
  const tweetId = /^\d{5,25}$/.test(String(rec?.tweetId || '')) ? String(rec.tweetId) : '';
  const type = sanitizeSegment(rec?.type || 'media', 'media', 20);
  const index = Math.max(1, Number(rec?.index || rec?.position) || 1);
  const ext = forceExt || extFor(rec);
  const fromUrl = filenameFromUrl(rec?.url || '');
  let stem;
  if (tweetId) stem = `${handle}-${tweetId}${index > 1 ? `-${index}` : ''}`;
  else if (fromUrl) stem = fromUrl.replace(/\.[^.]+$/, '');
  else {
    const title = sanitizeSegment(rec?.title || rec?.alt || type, type, 72);
    stem = `${handle}-${title}-${index}`;
  }
  return `${folder ? `${folder}/` : ''}${sanitizeSegment(stem, 'media', 130)}.${ext}`;
}

function isDownloadableUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'data:';
  } catch (_) {
    return false;
  }
}

function trustedSender(sender) {
  if (!sender?.tab?.url) return true;
  try {
    const u = new URL(sender.tab.url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (_) {
    return false;
  }
}

async function getSettings() {
  const saved = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...saved };
}

async function startDownload(rec, options = {}) {
  if (!rec || !isDownloadableUrl(rec.url)) throw new Error('No direct downloadable media URL is available.');
  const settings = await getSettings();
  const filename = options.filename || buildFilename(rec, settings, options.forceExt);
  const downloadId = await chrome.downloads.download({
    url: rec.url,
    filename,
    saveAs: options.saveAs ?? Boolean(settings.saveAs),
    conflictAction: 'uniquify'
  });
  if (typeof downloadId !== 'number') throw new Error('The browser did not return a download ID.');
  return { downloadId, filename };
}

async function startBatch(items, options = {}) {
  const records = Array.isArray(items) ? items : [];
  const results = [];
  const seen = new Set();
  for (const rec of records) {
    if (!rec?.url || seen.has(rec.url)) continue;
    seen.add(rec.url);
    try {
      const result = await startDownload(rec, options);
      results.push({ ok: true, ...result });
    } catch (error) {
      results.push({ ok: false, url: rec.url, error: String(error?.message || error) });
    }
  }
  const started = results.filter((x) => x.ok).length;
  return { ok: started > 0 && started === results.length, started, failed: results.length - started, results };
}

function dataUrlMeta(raw) {
  const m = String(raw || '').match(/^data:([^;,]*)(;base64)?,(.*)$/s);
  if (!m) return null;
  const mime = m[1] || 'text/plain';
  let sizeBytes = 0;
  if (m[2]) {
    const payload = m[3].replace(/\s/g, '');
    const padding = (payload.match(/=+$/) || [''])[0].length;
    sizeBytes = Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
  } else {
    try { sizeBytes = new TextEncoder().encode(decodeURIComponent(m[3])).byteLength; }
    catch (_) { sizeBytes = new TextEncoder().encode(m[3]).byteLength; }
  }
  return { ok: true, sizeBytes, mime, method: 'data' };
}

function parseRemoteMeta(response, method) {
  if (!response) return null;
  const range = response.headers.get('content-range') || '';
  const rm = range.match(/\/(\d+)$/);
  const len = Number(rm?.[1] || response.headers.get('content-length') || 0) || 0;
  return {
    ok: response.ok || response.status === 206,
    status: response.status,
    sizeBytes: len || null,
    mime: (response.headers.get('content-type') || '').split(';')[0] || null,
    etag: response.headers.get('etag') || null,
    modified: response.headers.get('last-modified') || null,
    method
  };
}

function trimMetaCache() {
  const now = Date.now();
  for (const [key, value] of metaCache) if (now - value.at > META_CACHE_TTL) metaCache.delete(key);
  while (metaCache.size > META_CACHE_MAX) metaCache.delete(metaCache.keys().next().value);
}

async function probeMedia(rawUrl) {
  const url = String(rawUrl || '');
  if (url.startsWith('data:')) return dataUrlMeta(url) || { ok: false, error: 'Invalid data URL.' };
  if (!/^https?:/i.test(url)) return { ok: false, url, error: 'Metadata probing supports HTTP(S) and data URLs.' };

  const cached = metaCache.get(url);
  if (cached && Date.now() - cached.at < META_CACHE_TTL) return { ...cached.value, cached: true };
  if (metaInflight.has(url)) return metaInflight.get(url);

  const work = (async () => {
    let value = null;
    try {
      const head = await fetch(url, { method: 'HEAD', credentials: 'include', cache: 'default', redirect: 'follow' });
      value = parseRemoteMeta(head, 'HEAD');
      if (!value?.sizeBytes || !value?.mime) {
        try {
          const range = await fetch(url, {
            method: 'GET',
            headers: { Range: 'bytes=0-0' },
            credentials: 'include',
            cache: 'default',
            redirect: 'follow'
          });
          const ranged = parseRemoteMeta(range, 'RANGE');
          try { await range.body?.cancel(); } catch (_) {}
          value = {
            ...(value || {}),
            ...(ranged || {}),
            sizeBytes: ranged?.sizeBytes || value?.sizeBytes || null,
            mime: ranged?.mime || value?.mime || null,
            ok: Boolean(ranged?.ok || value?.ok)
          };
        } catch (_) {}
      }
    } catch (error) {
      value = { ok: false, error: String(error?.message || error) };
    }

    value = { url, ...(value || { ok: false }) };
    metaCache.set(url, { at: Date.now(), value });
    trimMetaCache();
    return value;
  })();

  metaInflight.set(url, work);
  try { return await work; }
  finally { metaInflight.delete(url); }
}

async function probeBatch(records, concurrency = 6) {
  const items = Array.isArray(records) ? records : [];
  const unique = [];
  const seen = new Set();
  for (const item of items) {
    const url = typeof item === 'string' ? item : item?.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push(url);
  }
  const out = [];
  let cursor = 0;
  async function worker() {
    let local = 0;
    while (cursor < unique.length) {
      const i = cursor++;
      out[i] = await probeMedia(unique[i]);
      if (++local % 4 === 0) await workerYield();
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(10, concurrency || 6)) }, worker));
  return out;
}

function mergeRecord(oldRec, nextRec) {
  if (!oldRec) return { ...nextRec };
  const merged = { ...oldRec, ...nextRec };
  merged.width = Math.max(Number(oldRec.width) || 0, Number(nextRec.width) || 0) || null;
  merged.height = Math.max(Number(oldRec.height) || 0, Number(nextRec.height) || 0) || null;
  merged.sizeBytes = Number(nextRec.sizeBytes) || Number(oldRec.sizeBytes) || null;
  merged.position = Math.min(Number(oldRec.position) || Number.MAX_SAFE_INTEGER, Number(nextRec.position) || Number.MAX_SAFE_INTEGER);
  if (merged.position === Number.MAX_SAFE_INTEGER) merged.position = 0;
  merged.thumb = nextRec.thumb || oldRec.thumb || '';
  merged.title = nextRec.title || oldRec.title || '';
  const sources = new Set([...(oldRec.sources || []), ...(nextRec.sources || []), oldRec.source, nextRec.source].filter(Boolean));
  merged.sources = [...sources];
  merged.source = merged.sources[0] || merged.source || 'page';
  return merged;
}

async function scanTabDeep(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const injections = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: 'ISOLATED',
    func: async () => typeof globalThis.__MFGX_FRAME_SNAPSHOT__ === 'function' ? await globalThis.__MFGX_FRAME_SNAPSHOT__() : null
  });

  const merged = new Map();
  let page = null;
  let frameCount = 0;
  for (const item of injections || []) {
    if (!item?.result) continue;
    frameCount++;
    if (item.frameId === 0 || !page) page = item.result.page || page;
    for (const raw of item.result.records || []) {
      if (!raw?.url) continue;
      const rec = { ...raw, frameId: item.frameId, frameUrl: item.result.page?.url || raw.frameUrl || '' };
      rec.globalPosition = (item.frameId === 0 ? 0 : (item.frameId + 1) * 1_000_000) + (Number(rec.position) || 0);
      const key = `${rec.type || 'media'}|${rec.url}`;
      merged.set(key, mergeRecord(merged.get(key), rec));
    }
  }

  return {
    ok: true,
    page: page || { title: tab.title || '', url: tab.url || '', hostname: (() => { try { return new URL(tab.url).hostname; } catch (_) { return ''; } })(), isX: false },
    tab: { id: tabId, title: tab.title || '', url: tab.url || '' },
    frameCount,
    records: [...merged.values()].sort((a, b) => (a.globalPosition || 0) - (b.globalPosition || 0))
  };
}

async function scanTab(tabId) {
  const existing = tabScanInflight.get(tabId);
  if (existing) return existing;
  const task = scanTabDeep(tabId);
  tabScanInflight.set(tabId, task);
  try { return await task; }
  finally { if (tabScanInflight.get(tabId) === task) tabScanInflight.delete(tabId); }
}

async function putJob(prefix, job) {
  const key = `${prefix}:${job.id}`;
  const area = chrome.storage.session || chrome.storage.local;
  await area.set({ [key]: job });
  return key;
}

async function queueGif(rec, sender, options = {}) {
  if (!rec || !isDownloadableUrl(rec.url) || String(rec.url).startsWith('data:')) throw new Error('GIF conversion needs a direct HTTP(S) video URL.');
  const settings = await getSettings();
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const job = {
    id,
    sourceUrl: rec.url,
    record: rec,
    filename: buildFilename(rec, settings, 'gif'),
    fps: Math.min(30, Math.max(5, Number(options.fps ?? settings.gifFps) || 20)),
    maxWidth: Math.max(0, Number(options.maxWidth ?? settings.gifMaxWidth) || 0),
    quality: String(options.quality ?? settings.gifQuality ?? 'maximum'),
    saveAs: options.saveAs ?? Boolean(settings.saveAs),
    sourceTabId: sender?.tab?.id ?? options.sourceTabId ?? null,
    createdAt: Date.now()
  };
  await putJob('gifJob', job);
  const url = chrome.runtime.getURL(`converter.html#${encodeURIComponent(id)}`);
  const tab = await chrome.tabs.create({ url, active: false });
  return { ok: true, queued: true, jobId: id, converterTabId: tab.id };
}

async function queueZip(records, options = {}) {
  const settings = await getSettings();
  const usable = (Array.isArray(records) ? records : []).filter((rec) => rec?.url && isDownloadableUrl(rec.url));
  if (!usable.length) throw new Error('No downloadable HTTP(S) or data media is selected.');
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const title = sanitizeSegment(options.pageTitle || 'page-media', 'page-media', 70);
  const folder = sanitizeFolder(settings.folder);
  const filename = `${folder ? `${folder}/` : ''}${title}-media.zip`;
  const job = {
    id,
    records: usable.map((rec) => ({ ...rec, zipName: buildFilename(rec, { ...settings, folder: '' }) })),
    filename,
    saveAs: Boolean(options.saveAs ?? settings.saveAs),
    createdAt: Date.now()
  };
  await putJob('zipJob', job);
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(`zipper.html#${encodeURIComponent(id)}`), active: false });
  return { ok: true, queued: true, jobId: id, zipperTabId: tab.id, count: usable.length };
}

async function openPanelFor(tabId) {
  if (chrome.sidePanel?.open && tabId != null) {
    await chrome.sidePanel.open({ tabId });
    return { ok: true, mode: 'sidePanel' };
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html'), active: true });
  return { ok: true, mode: 'tab' };
}

if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener(async () => {
    const current = await chrome.storage.local.get(DEFAULTS);
    const missing = {};
    for (const [key, value] of Object.entries(DEFAULTS)) if (typeof current[key] === 'undefined') missing[key] = value;
    if (Object.keys(missing).length) await chrome.storage.local.set(missing);
    try { if (chrome.sidePanel?.setPanelBehavior) await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch (_) {}
  });

  chrome.action.onClicked.addListener((tab) => { openPanelFor(tab?.id).catch(() => {}); });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;

    if (message.type === 'mfgx:getSettings') {
      getSettings().then((settings) => sendResponse({ ok: true, settings }), (e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }

    if (message.type === 'mfgx:setSettings') {
      const patch = message.settings && typeof message.settings === 'object' ? message.settings : {};
      const allowed = {};
      for (const key of Object.keys(DEFAULTS)) if (Object.prototype.hasOwnProperty.call(patch, key)) allowed[key] = patch[key];
      chrome.storage.local.set(allowed).then(() => getSettings()).then((settings) => sendResponse({ ok: true, settings }), (e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }

    if (message.type === 'mfgx:scanTab') {
      scanTab(Number(message.tabId)).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
      return true;
    }

    if (message.type === 'mfgx:probeMediaBatch') {
      probeBatch(message.records, message.concurrency).then((items) => sendResponse({ ok: true, items }), (e) => sendResponse({ ok: false, error: String(e?.message || e), items: [] }));
      return true;
    }

    if (!trustedSender(sender)) {
      sendResponse({ ok: false, error: 'Untrusted sender.' });
      return false;
    }

    if (message.type === 'mfgx:download') {
      startDownload(message.record, { saveAs: message.saveAs }).then((r) => sendResponse({ ok: true, ...r }), (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
      return true;
    }

    if (message.type === 'mfgx:downloadBatch') {
      startBatch(message.records, { saveAs: message.saveAs }).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
      return true;
    }

    if (message.type === 'mfgx:convertGif') {
      queueGif(message.record, sender, message.options || {}).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
      return true;
    }

    if (message.type === 'mfgx:queueZip') {
      queueZip(message.records, message.options || {}).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
      return true;
    }

    if (message.type === 'mfgx:openPanel') {
      const tabId = sender?.tab?.id ?? message.tabId;
      openPanelFor(tabId).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e?.message || e) }));
      return true;
    }

    if (message.type === 'mfgx:gifComplete' || message.type === 'mfgx:zipComplete') {
      const prefix = message.type === 'mfgx:gifComplete' ? 'gifJob' : 'zipJob';
      if (message.jobId) {
        const area = chrome.storage.session || chrome.storage.local;
        area.remove(`${prefix}:${message.jobId}`).catch(() => {});
      }
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    DEFAULTS,
    sanitizeSegment,
    sanitizeFolder,
    extFor,
    filenameFromUrl,
    buildFilename,
    isDownloadableUrl,
    dataUrlMeta,
    mergeRecord
  };
}
