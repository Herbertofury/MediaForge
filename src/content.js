(function () {
  'use strict';
  if (window.__MEDIAFORGE_GX_CONTENT__) return;
  window.__MEDIAFORGE_GX_CONTENT__ = true;

  const X = globalThis.MediaForgeX;
  const X_SOURCE = 'mediaforge-gx/page/v1';
  const isX = /(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(location.hostname);
  const pageProvider = (() => { const h=location.hostname.toLowerCase().replace(/^www\./,''); if(h==='youtube.com'||h.endsWith('.youtube.com')||h==='youtu.be')return 'youtube'; if(h==='spotify.com'||h.endsWith('.spotify.com'))return 'spotify'; if(h==='soundcloud.com'||h.endsWith('.soundcloud.com'))return 'soundcloud'; if(h==='bandcamp.com'||h.endsWith('.bandcamp.com'))return 'bandcamp'; if(isX)return 'x'; return 'web'; })();
  const xByTweet = new Map();
  let settings = {
    hoverTools: true,
    xButtons: true,
    integratePicviewer: true,
    preferPicviewerBar: true,
    saveAs: false,
    folder: 'MediaForge GX',
    gifFps: 20,
    gifMaxWidth: 0,
    gifQuality: 'maximum'
  };
  let currentRecord = null;
  let currentTarget = null;
  let hoverTimer = 0;
  let hideTimer = 0;
  let scanQueued = false;
  let fullXScanNeeded = isX;
  const dirtyXArticles = new Set();
  let mediaRevision = 1;
  let snapshotRevision = 0;
  let snapshotRecords = [];
  let snapshotPromise = null;
  const openRoots = [document];
  const knownRoots = new WeakSet([document]);
  let shadowRootsDirty = true;
  const resourceRecordCache = new Map();
  let stylesheetCache = [];
  let stylesheetCacheDirty = true;
  let toastTimer = 0;

  function cooperativeYield(priority = 'background') {
    if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
    return new Promise((resolve) => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: priority === 'background' ? 48 : 16 });
      else setTimeout(resolve, 0);
    });
  }

  function postBackgroundTask(task) {
    if (globalThis.scheduler?.postTask) {
      return globalThis.scheduler.postTask(task, { priority: 'background' });
    }
    return new Promise((resolve, reject) => {
      const run = () => Promise.resolve().then(task).then(resolve, reject);
      if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 120 });
      else setTimeout(run, 0);
    });
  }

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(response || { ok: false, error: 'No response.' });
        });
      } catch (error) {
        resolve({ ok: false, error: String(error?.message || error) });
      }
    });
  }

  send({ type: 'mfgx:getSettings' }).then((r) => {
    if (r?.ok && r.settings) settings = { ...settings, ...r.settings };
    queueScan();
  });

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(settings)) if (changes[key]) settings[key] = changes[key].newValue;
    queueScan();
  });

  function dedupeRecords(records) {
    const map = new Map();
    for (const rec of records || []) {
      if (!rec?.url) continue;
      const key = `${rec.type || 'media'}|${rec.url}`;
      if (!map.has(key)) map.set(key, rec);
    }
    return [...map.values()];
  }

  function ingestX(items) {
    let changed = false;
    for (const rec of items || []) {
      if (!rec?.tweetId || !rec?.url) continue;
      let bucket = xByTweet.get(rec.tweetId);
      if (!bucket) xByTweet.set(rec.tweetId, (bucket = new Map()));
      const key = rec.key || rec.mediaId || rec.url;
      const old = bucket.get(key);
      if (!old || JSON.stringify(old.variants || []) !== JSON.stringify(rec.variants || [])) {
        bucket.set(key, rec);
        changed = true;
      }
    }
    if (changed) queueScan();
  }

  if (isX) {
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const data = event.data;
      if (!data || data.source !== X_SOURCE || data.type !== 'media' || !Array.isArray(data.items)) return;
      ingestX(data.items);
    });
  }

  function parseStatusHref(raw) {
    if (!raw) return null;
    try {
      const u = new URL(raw, location.href);
      const m = u.pathname.match(/^\/([^/]+)\/status\/(\d{5,25})/i);
      return m ? { handle: m[1], tweetId: m[2] } : null;
    } catch (_) {
      return null;
    }
  }

  function articleIdentity(article) {
    if (!article) return null;
    const links = article.querySelectorAll('a[href*="/status/"]');
    for (const a of links) {
      if (a.querySelector('time')) {
        const p = parseStatusHref(a.getAttribute('href'));
        if (p) return p;
      }
    }
    for (const a of links) {
      const p = parseStatusHref(a.getAttribute('href'));
      if (p) return p;
    }
    return parseStatusHref(location.href);
  }

  function xMediaForArticle(article) {
    const id = articleIdentity(article);
    if (!id) return [];
    const bucket = xByTweet.get(id.tweetId);
    if (!bucket) return [];
    return [...bucket.values()].map((r) => ({ ...r, handle: r.handle && r.handle !== 'x' ? r.handle : id.handle }));
  }

  function lightContext(el) {
    if (!el?.getAttribute) return '';
    const ancestor = el.closest?.('[aria-label],[data-testid],[role],a[href]');
    const parts = [
      el.getAttribute('alt'), el.getAttribute('title'), el.getAttribute('aria-label'),
      el.id, typeof el.className === 'string' ? el.className : '',
      ancestor?.getAttribute?.('aria-label'), ancestor?.getAttribute?.('data-testid'),
      ancestor?.getAttribute?.('role'), ancestor?.getAttribute?.('href')
    ].filter(Boolean);
    return parts.join(' ').replace(/\s+/g,' ').slice(0,360);
  }

  function decorateProviderRecord(input) {
    if (!input) return input;
    const rec = { ...input, provider: input.provider || pageProvider };
    if ((rec.provider === 'youtube' && rec.type === 'video') || (['spotify','soundcloud','bandcamp'].includes(rec.provider) && rec.type === 'audio')) {
      let host = '';
      try { host = new URL(rec.url, location.href).hostname.toLowerCase(); } catch (_) {}
      const streamish = /^blob:/i.test(rec.url || '') || rec.url === location.href ||
        (rec.provider === 'youtube' && (host.endsWith('googlevideo.com') || host.endsWith('youtube.com'))) ||
        (rec.provider === 'spotify' && (host.endsWith('scdn.co') || host.endsWith('spotify.com') || host.endsWith('spotifycdn.com'))) ||
        (rec.provider === 'soundcloud' && (host.endsWith('sndcdn.com') || host.endsWith('soundcloud.com'))) ||
        (rec.provider === 'bandcamp' && host.endsWith('bandcamp.com'));
      if (streamish || rec.streamingPage) {
        rec.streamingPage = true;
        rec.nonDownloadable = true;
      }
    }
    return rec;
  }

  function pageMeta(name) {
    return document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content || '';
  }

  function providerPageRecord() {
    if (pageProvider === 'youtube' && (/^\/(?:watch|shorts|live|embed)\b/i.test(location.pathname) || location.hostname==='youtu.be')) {
      const video = document.querySelector('video');
      const thumb = directMediaUrl(video?.poster || pageMeta('og:image') || pageMeta('twitter:image')) || '';
      return decorateProviderRecord({
        type: 'video', url: location.href, thumb, title: pageMeta('og:title') || document.title,
        width: video?.videoWidth || 0, height: video?.videoHeight || 0, source: 'provider:youtube',
        streamingPage: true, nonDownloadable: true, filename: '', pageUrl: location.href, hostname: location.hostname
      });
    }
    if (pageProvider === 'spotify' && /\/(?:track|episode|show|album|playlist)\//i.test(location.pathname)) {
      const thumb = directMediaUrl(pageMeta('og:image') || pageMeta('twitter:image')) || '';
      return decorateProviderRecord({
        type: 'audio', url: location.href, thumb, title: pageMeta('og:title') || document.title,
        source: 'provider:spotify', streamingPage: true, nonDownloadable: true,
        filename: '', pageUrl: location.href, hostname: location.hostname
      });
    }
    if (pageProvider === 'soundcloud' || pageProvider === 'bandcamp') {
      const thumb = directMediaUrl(pageMeta('og:image') || pageMeta('twitter:image')) || '';
      return decorateProviderRecord({
        type: 'audio', url: location.href, thumb, title: pageMeta('og:title') || document.title,
        source: `provider:${pageProvider}`, streamingPage: true, nonDownloadable: true,
        filename: '', pageUrl: location.href, hostname: location.hostname
      });
    }
    return null;
  }

  function jsonLdMediaRecords() {
    const out = [];
    let scripts = 0;
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      if (++scripts > 32) break;
      let root;
      try { root = JSON.parse(script.textContent || 'null'); } catch (_) { continue; }
      const stack = [root]; let seen = 0;
      while (stack.length && seen++ < 768) {
        const obj = stack.pop();
        if (!obj || typeof obj !== 'object') continue;
        if (Array.isArray(obj)) { for (const item of obj) stack.push(item); continue; }
        const rawType = Array.isArray(obj['@type']) ? obj['@type'].join(' ') : String(obj['@type'] || '');
        const lowerType = rawType.toLowerCase();
        const title = String(obj.name || obj.headline || document.title || '');
        const contentUrl = directMediaUrl(obj.contentUrl || obj.contentURL || '');
        const thumbRaw = Array.isArray(obj.thumbnailUrl) ? obj.thumbnailUrl[0] : obj.thumbnailUrl;
        const imageRaw = typeof obj.image === 'string' ? obj.image : (Array.isArray(obj.image) ? obj.image[0] : obj.image?.url || obj.image?.contentUrl);
        const thumb = directMediaUrl(thumbRaw || imageRaw || '');
        if (contentUrl) {
          let fallback = 'photo';
          if (/video|movie|clip/.test(lowerType)) fallback = 'video';
          else if (/audio|music|podcast|episode|track/.test(lowerType)) fallback = 'audio';
          const type = mediaKindFromUrl(contentUrl, fallback);
          out.push(decorateProviderRecord({ type, url: contentUrl, thumb: thumb || (type === 'photo' ? contentUrl : ''), title, source: 'jsonld', ext: X?.fileExt?.(contentUrl, type === 'audio' ? 'mp3' : type === 'video' ? 'mp4' : 'jpg') || 'bin', pageUrl: location.href, hostname: location.hostname }));
        }
        if (thumb) out.push(decorateProviderRecord({ type: mediaKindFromUrl(thumb,'photo'), url: thumb, thumb, title: `${title} artwork`, source: 'jsonld-thumbnail', ext: X?.fileExt?.(thumb,'jpg') || 'jpg', pageUrl: location.href, hostname: location.hostname }));
        for (const value of Object.values(obj)) if (value && typeof value === 'object') stack.push(value);
      }
    }
    return out;
  }

  function parseSrcset(raw) {
    if (!raw) return [];
    return String(raw).split(/,(?=\s*(?:https?:|data:|blob:|\/|\.|\.\.\/|[^,\s]+\s+\d))/i).map((part) => {
      const value = part.trim();
      if (!value) return null;
      const m = value.match(/^(\S+)\s+(\d+(?:\.\d+)?)(w|x)$/i);
      if (m) return { url: m[1], score: Number(m[2]) * (m[3].toLowerCase() === 'x' ? 100000 : 1) };
      return { url: value.split(/\s+/)[0], score: 0 };
    }).filter(Boolean);
  }

  function bestSrcset(img) {
    const items = [];
    for (const node of [img, ...((img?.closest?.('picture')?.querySelectorAll?.('source[srcset]')) || [])]) {
      for (const item of parseSrcset(node?.getAttribute?.('srcset'))) items.push(item);
    }
    items.sort((a, b) => b.score - a.score);
    return items[0]?.url || null;
  }

  const MEDIA_EXT_RE = /\.(?:avif|bmp|gif|ico|jpe?g|jxl|png|svg|webp|apng|mp4|m4v|mov|webm|mkv|mp3|m4a|aac|ogg|oga|opus|wav|flac)(?:$|[?#])/i;
  const IMAGE_EXT_RE = /\.(?:avif|bmp|gif|ico|jpe?g|jxl|png|svg|webp|apng)(?:$|[?#])/i;
  const VIDEO_EXT_RE = /\.(?:mp4|m4v|mov|webm|mkv)(?:$|[?#])/i;
  const AUDIO_EXT_RE = /\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac)(?:$|[?#])/i;

  function mediaKindFromUrl(url, fallback = 'photo') {
    const u = String(url || '');
    if (/^data:image\/svg\+xml/i.test(u) || /\.svg(?:$|[?#])/i.test(u)) return 'svg';
    if (/^data:image\/gif/i.test(u) || /\.(?:gif|apng)(?:$|[?#])/i.test(u)) return 'gif';
    if (/^data:video\//i.test(u) || VIDEO_EXT_RE.test(u)) return 'video';
    if (/^data:audio\//i.test(u) || AUDIO_EXT_RE.test(u)) return 'audio';
    return fallback;
  }

  function linkedOriginal(el) {
    const a = el?.closest?.('a[href]');
    if (!a) return null;
    const href = a.href;
    if (IMAGE_EXT_RE.test(href) || /^data:image\//i.test(href)) return href;
    return null;
  }

  function extractCssUrls(value) {
    const out = [];
    const re = /url\(\s*(['"]?)(.*?)\1\s*\)/ig;
    let m;
    while ((m = re.exec(String(value || '')))) if (m[2]) out.push(m[2]);
    return out;
  }

  function backgroundUrl(el) {
    if (!(el instanceof Element)) return null;
    const urls = extractCssUrls(getComputedStyle(el).backgroundImage || '');
    return urls[0] || null;
  }

  function directMediaUrl(raw) {
    if (!raw) return null;
    try {
      const u = new URL(raw, location.href);
      return /^(https?:|data:|blob:)$/.test(u.protocol) ? u.href : null;
    } catch (_) {
      return null;
    }
  }

  function fileNameFromUrl(raw) {
    try {
      const u = new URL(raw, location.href);
      if (u.protocol === 'data:' || u.protocol === 'blob:') return '';
      return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    } catch (_) { return ''; }
  }

  function lazyOriginalCandidate(img) {
    if (!img?.getAttribute) return null;
    const names = [
      'data-original', 'data-original-src', 'data-orig-src', 'data-full', 'data-full-src',
      'data-fullsize', 'data-full-size', 'data-highres', 'data-hires', 'data-large',
      'data-large-src', 'data-zoom', 'data-zoom-image', 'data-lazy-src', 'data-src',
      'data-image', 'data-url', 'data-download-src'
    ];
    const scored = [];
    for (const name of names) {
      const raw = img.getAttribute(name);
      const url = directMediaUrl(raw);
      if (!url) continue;
      let score = 10;
      if (/original|orig|full|high|hires|zoom|large/i.test(name)) score += 100;
      if (IMAGE_EXT_RE.test(url) || /^data:image\//i.test(url)) score += 20;
      scored.push({ url, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.url || null;
  }

  function imageCandidate(img) {
    let url = linkedOriginal(img) || lazyOriginalCandidate(img) || bestSrcset(img) || img.currentSrc || img.src;
    try {
      const u = new URL(url, location.href);
      if (X && /pbs\.twimg\.com$/i.test(u.hostname) && /\/media\//i.test(u.pathname)) url = X.originalPhotoUrl(url) || url;
    } catch (_) {}
    return directMediaUrl(url);
  }

  function viewportMetrics(el) {
    let rect;
    try { rect = el?.getBoundingClientRect?.(); } catch (_) { rect = null; }
    if (!rect) return { visible: false, viewportDistance: Number.MAX_SAFE_INTEGER, renderedWidth: 0, renderedHeight: 0 };
    const vw = Math.max(1, window.innerWidth || document.documentElement?.clientWidth || 1);
    const vh = Math.max(1, window.innerHeight || document.documentElement?.clientHeight || 1);
    const visible = rect.width > 1 && rect.height > 1 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= vh && rect.left <= vw;
    const cx = Math.max(0, Math.max(rect.left - vw, -rect.right));
    const cy = Math.max(0, Math.max(rect.top - vh, -rect.bottom));
    return {
      visible,
      viewportDistance: visible ? 0 : Math.round(Math.hypot(cx, cy)),
      renderedWidth: Math.round(Math.max(0, rect.width || 0)),
      renderedHeight: Math.round(Math.max(0, rect.height || 0))
    };
  }

  function semanticHintsForElement(el, url = '') {
    const raw = String(url || '');
    const article = el?.closest?.('article') || null;
    const inMain = Boolean(el?.closest?.('main,[role="main"]'));
    const inSidebar = Boolean(el?.closest?.('aside,[data-testid="sidebarColumn"],[aria-label*="sidebar" i]'));
    const inNav = Boolean(el?.closest?.('nav,[role="navigation"],[data-testid="AppTabBar_Home_Link"]'));
    const testNode = el?.closest?.('[data-testid]');
    const testId = String(testNode?.getAttribute?.('data-testid') || '');
    const xAvatar = isX && (
      /pbs\.twimg\.com\/profile_images\//i.test(raw) ||
      /UserAvatar|Tweet-User-Avatar/i.test(testId) ||
      Boolean(el?.closest?.('[data-testid*="UserAvatar"],[data-testid="Tweet-User-Avatar"]'))
    );
    const xChromeAsset = isX && (
      /(?:^|\.)abs\.twimg\.com$/i.test((() => { try { return new URL(raw).hostname; } catch (_) { return ''; } })()) ||
      /(?:^|\.)ton\.twimg\.com$/i.test((() => { try { return new URL(raw).hostname; } catch (_) { return ''; } })()) ||
      /\/twitter-assets\/|\/sports-product\/|\/brand_assets?\//i.test(raw)
    );
    const xPostMedia = isX && Boolean(article) && !xAvatar && !xChromeAsset && (
      /pbs\.twimg\.com\/media\//i.test(raw) ||
      /video\.twimg\.com\//i.test(raw) ||
      /tweetPhoto|videoPlayer|videoComponent/i.test(testId) ||
      Boolean(el?.closest?.('[data-testid="tweetPhoto"],[data-testid="videoPlayer"],[data-testid="videoComponent"]'))
    );
    const promoted = isX && Boolean(article?.querySelector?.('[data-testid*="promoted" i],[data-testid="placementTracking"]'));
    const region = xPostMedia ? 'x-post' : article ? 'article' : inSidebar ? 'sidebar' : inNav ? 'nav' : inMain ? 'main' : 'page';
    const view = viewportMetrics(el);
    let contentPriority = 0;
    if (xPostMedia) contentPriority = 1200;
    else if (article && !xAvatar) contentPriority = 780;
    else if (inMain && !inSidebar && !inNav) contentPriority = 520;
    if (view.visible) contentPriority += 180;
    if (xAvatar || xChromeAsset || inSidebar || inNav) contentPriority -= 700;
    if (promoted) contentPriority -= 260;
    return {
      ...view,
      semanticRegion: region,
      inArticle: Boolean(article),
      xPostMedia,
      xAvatar,
      xSiteChrome: xChromeAsset || inSidebar || inNav,
      promoted,
      contentPriority
    };
  }

  function imageRecord(img, position = 0, source = 'img') {
    const url = imageCandidate(img);
    if (!url) return null;
    const width = Number(img?.naturalWidth || img?.width) || 0;
    const height = Number(img?.naturalHeight || img?.height) || 0;
    const hints = semanticHintsForElement(img, url);
    return decorateProviderRecord({
      type: mediaKindFromUrl(url, 'photo'),
      url,
      ext: X?.fileExt?.(url, mediaKindFromUrl(url, 'photo') === 'svg' ? 'svg' : 'jpg') || 'jpg',
      handle: location.hostname,
      title: img?.alt || img?.title || document.title,
      alt: img?.alt || '',
      context: lightContext(img),
      thumb: directMediaUrl(img?.currentSrc || img?.src) || url,
      width,
      height,
      renderedWidth: hints.renderedWidth,
      renderedHeight: hints.renderedHeight,
      position,
      source,
      filename: fileNameFromUrl(url),
      pageUrl: location.href,
      hostname: location.hostname,
      original: Boolean(linkedOriginal(img) || lazyOriginalCandidate(img) || bestSrcset(img)),
      ...hints
    });
  }

  function recordFromElement(el) {
    if (!(el instanceof Element)) return null;
    const article = el.closest('article');
    if (isX && article) {
      const records = xMediaForArticle(article);
      if (records.length) {
        if (el.closest('video,[data-testid="videoPlayer"],[data-testid="videoComponent"]')) {
          const rec = records.find((r) => r.type === 'gif') || records.find((r) => r.type === 'video') || records[0];
          const video = el.closest('video');
          return { ...rec, width: rec.width || video?.videoWidth || 0, height: rec.height || video?.videoHeight || 0, source: 'x-api', pageUrl: location.href, hostname: location.hostname, ...semanticHintsForElement(video || el, rec.url), xPostMedia: true, contentPriority: 1400 };
        }
        if (el instanceof HTMLImageElement || el.closest('img')) {
          const img = el instanceof HTMLImageElement ? el : el.closest('img');
          const src = img?.currentSrc || img?.src || '';
          const key = X?.mediaKey?.(src);
          const rec = records.find((r) => r.type === 'photo' && (r.key === key || X?.mediaKey?.(r.thumb) === key)) || records.find((r) => r.type === 'photo') || null;
          return rec ? { ...rec, width: rec.width || img?.naturalWidth || 0, height: rec.height || img?.naturalHeight || 0, source: 'x-api', pageUrl: location.href, hostname: location.hostname, ...semanticHintsForElement(img, rec.url), xPostMedia: true, contentPriority: 1400 } : null;
        }
      }
    }

    if (el instanceof HTMLVideoElement || el instanceof HTMLSourceElement) {
      const video = el instanceof HTMLVideoElement ? el : el.closest('video');
      const url = directMediaUrl(el.currentSrc || el.src || el.getAttribute('src'));
      if (!url) return null;
      return decorateProviderRecord({ type: mediaKindFromUrl(url, 'video'), url, ext: X?.fileExt?.(url, 'mp4') || 'mp4', handle: location.hostname, title: document.title, context: lightContext(video||el), thumb: video?.poster || '', width: video?.videoWidth || 0, height: video?.videoHeight || 0, source: 'video', filename: fileNameFromUrl(url), pageUrl: location.href, hostname: location.hostname });
    }

    if (el instanceof HTMLAudioElement) {
      const url = directMediaUrl(el.currentSrc || el.src || el.getAttribute('src'));
      if (!url) return null;
      return decorateProviderRecord({ type: 'audio', url, ext: X?.fileExt?.(url, 'mp3') || 'mp3', handle: location.hostname, title: document.title, context: lightContext(el), source: 'audio', filename: fileNameFromUrl(url), pageUrl: location.href, hostname: location.hostname });
    }

    const img = el instanceof HTMLImageElement ? el : el.closest('img');
    if (img) return imageRecord(img, 0, 'img');

    const bg = backgroundUrl(el);
    if (bg) {
      const url = directMediaUrl(bg);
      if (url) return { type: mediaKindFromUrl(url, 'photo'), url, ext: X?.fileExt?.(url, 'jpg') || 'jpg', handle: location.hostname, title: document.title, thumb: url, source: 'background', filename: fileNameFromUrl(url), pageUrl: location.href, hostname: location.hostname };
    }
    return null;
  }

  function registerShadowRoot(root) {
    if (!root || knownRoots.has(root)) return false;
    knownRoots.add(root);
    openRoots.push(root);
    return true;
  }

  async function discoverShadowRoots(start = document) {
    if (!start) return;
    const queue = [start];
    let inspected = 0;
    while (queue.length) {
      const root = queue.shift();
      let walker;
      try { walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT); } catch (_) { walker = null; }
      if (!walker) continue;
      let el = walker.currentNode === root ? walker.nextNode() : walker.currentNode;
      while (el) {
        if (el.shadowRoot && registerShadowRoot(el.shadowRoot)) queue.push(el.shadowRoot);
        if (++inspected % 320 === 0) await cooperativeYield();
        el = walker.nextNode();
      }
    }
  }


  function collectRoots() {
    for (let i = openRoots.length - 1; i > 0; i--) {
      const host = openRoots[i]?.host;
      if (host && !host.isConnected) openRoots.splice(i, 1);
    }
    return openRoots;
  }

  function looksLikeMedia(raw) {
    const s = String(raw || '');
    return MEDIA_EXT_RE.test(s) || /(?:mp3-preview|audio-preview|videoplayback)/i.test(s) || /^data:(?:image|video|audio)\//i.test(s) || /^blob:/i.test(s);
  }

  function collectPageMedia(deep = true) {
    const map = new Map();
    let position = 0;
    function add(rec, source) {
      if (!rec?.url) return;
      rec = decorateProviderRecord({ ...rec });
      rec.position = Number(rec.position) || ++position;
      if (!rec.source) rec.source = source || 'page';
      if (!rec.sources) rec.sources = [rec.source];
      if (!rec.filename) rec.filename = fileNameFromUrl(rec.url);
      if (!rec.pageUrl) rec.pageUrl = location.href;
      if (!rec.hostname) rec.hostname = location.hostname;
      const key = `${rec.type || 'media'}|${rec.url}`;
      const old = map.get(key);
      if (!old) { map.set(key, rec); return; }
      const sources = new Set([...(old.sources || []), ...(rec.sources || []), old.source, rec.source].filter(Boolean));
      map.set(key, {
        ...old,
        ...rec,
        width: Math.max(Number(old.width) || 0, Number(rec.width) || 0) || 0,
        height: Math.max(Number(old.height) || 0, Number(rec.height) || 0) || 0,
        position: Math.min(Number(old.position) || rec.position, Number(rec.position) || old.position),
        thumb: old.thumb || rec.thumb || '',
        title: old.title || rec.title || '',
        sources: [...sources],
        source: old.source || rec.source
      });
    }

    const roots = collectRoots();
    for (const root of roots) {
      for (const img of root.querySelectorAll?.('img') || []) add(imageRecord(img, ++position, 'img'), 'img');

      for (const source of root.querySelectorAll?.('picture source[srcset]') || []) {
        const candidates = parseSrcset(source.getAttribute('srcset')).sort((a, b) => b.score - a.score);
        const url = directMediaUrl(candidates[0]?.url);
        if (url) add({ type: mediaKindFromUrl(url, 'photo'), url, ext: X?.fileExt?.(url, 'jpg') || 'jpg', title: source.closest('picture')?.querySelector('img')?.alt || document.title, thumb: url, source: 'picture-srcset' }, 'picture-srcset');
      }

      for (const video of root.querySelectorAll?.('video') || []) {
        const urls = [video.currentSrc, video.src, ...[...video.querySelectorAll('source[src]')].map((n) => n.src)].map(directMediaUrl).filter(Boolean);
        for (const url of urls) add({ type: mediaKindFromUrl(url, 'video'), url, ext: X?.fileExt?.(url, 'mp4') || 'mp4', title: document.title, thumb: video.poster || '', width: video.videoWidth || 0, height: video.videoHeight || 0, source: 'video', context: lightContext(video) }, 'video');
        if (video.poster) {
          const poster = directMediaUrl(video.poster);
          if (poster) add({ type: mediaKindFromUrl(poster, 'photo'), url: poster, ext: X?.fileExt?.(poster, 'jpg') || 'jpg', title: `${document.title} poster`, thumb: poster, source: 'video-poster' }, 'video-poster');
        }
      }

      for (const audio of root.querySelectorAll?.('audio') || []) {
        const urls = [audio.currentSrc, audio.src, ...[...audio.querySelectorAll('source[src]')].map((n) => n.src)].map(directMediaUrl).filter(Boolean);
        for (const url of urls) add({ type: 'audio', url, ext: X?.fileExt?.(url, 'mp3') || 'mp3', title: document.title, source: 'audio', context: lightContext(audio) }, 'audio');
      }

      for (const a of root.querySelectorAll?.('a[href]') || []) {
        const url = directMediaUrl(a.href);
        if (url && looksLikeMedia(url)) add({ type: mediaKindFromUrl(url, IMAGE_EXT_RE.test(url) ? 'photo' : 'media'), url, ext: X?.fileExt?.(url, 'bin') || 'bin', title: a.textContent?.trim() || a.title || document.title, thumb: IMAGE_EXT_RE.test(url) ? url : '', source: 'link' }, 'link');
      }

      for (const image of root.querySelectorAll?.('svg image') || []) {
        const url = directMediaUrl(image.href?.baseVal || image.getAttribute('href'));
        if (url) add({ type: mediaKindFromUrl(url, 'photo'), url, ext: X?.fileExt?.(url, 'png') || 'png', title: document.title, thumb: url, source: 'svg-image' }, 'svg-image');
      }

      if (deep) {
        // Inline CSS is cheap to inspect directly. Stylesheet rules and the Resource
        // Timing API below cover class/pseudo-element backgrounds without forcing
        // getComputedStyle() across every node on image-heavy pages.
        for (const el of root.querySelectorAll?.('[style*="url("]') || []) {
          for (const raw of extractCssUrls(el.getAttribute('style') || '')) {
            const url = directMediaUrl(raw);
            if (url) add({ type: mediaKindFromUrl(url, 'photo'), url, ext: X?.fileExt?.(url, 'jpg') || 'jpg', title: el.getAttribute?.('aria-label') || el.getAttribute?.('title') || document.title, thumb: url, source: 'inline-css' }, 'inline-css');
          }
        }
      }
    }

    for (const meta of document.querySelectorAll('meta[property],meta[name]')) {
      const key = String(meta.getAttribute('property') || meta.getAttribute('name') || '').toLowerCase();
      if (!/(?:^|:)(?:image|video|audio)(?::|$)|twitter:(?:image|player)/.test(key)) continue;
      const url = directMediaUrl(meta.content);
      if (!url) continue;
      const fallback = key.includes('video') || key.includes('player') ? 'video' : key.includes('audio') ? 'audio' : 'photo';
      add({ type: mediaKindFromUrl(url, fallback), url, ext: X?.fileExt?.(url, fallback === 'video' ? 'mp4' : fallback === 'audio' ? 'mp3' : 'jpg') || 'bin', title: document.title, thumb: fallback === 'photo' ? url : '', source: 'metadata', nonDownloadable: fallback !== 'photo' && !looksLikeMedia(url), streamingPage: fallback !== 'photo' && !looksLikeMedia(url) }, 'metadata');
    }

    if (deep) {
      for (const sheet of document.styleSheets || []) {
        let rules;
        try { rules = sheet.cssRules; } catch (_) { continue; }
        const stack = [...(rules || [])];
        while (stack.length) {
          const rule = stack.pop();
          if (rule?.cssRules) stack.push(...rule.cssRules);
          const cssText = rule?.cssText || '';
          if (!/@font-face/i.test(cssText)) {
            for (const raw of extractCssUrls(cssText)) {
              const url = directMediaUrl(raw);
              if (url) add({ type: mediaKindFromUrl(url, 'photo'), url, ext: X?.fileExt?.(url, 'jpg') || 'jpg', title: document.title, thumb: url, source: 'stylesheet' }, 'stylesheet');
            }
          }
        }
      }

      try {
        for (const entry of performance.getEntriesByType('resource')) {
          const url = directMediaUrl(entry.name);
          const initiator = String(entry.initiatorType || '').toLowerCase();
          if (!url || (!looksLikeMedia(url) && !['img','image','video','audio'].includes(initiator))) continue;
          const fallback = initiator === 'video' ? 'video' : initiator === 'audio' ? 'audio' : 'photo';
          add({ type: mediaKindFromUrl(url, fallback), url, ext: X?.fileExt?.(url, fallback === 'video' ? 'mp4' : fallback === 'audio' ? 'mp3' : 'jpg') || 'bin', title: document.title, thumb: fallback === 'photo' ? url : '', sizeBytes: Number(entry.encodedBodySize || entry.transferSize) || 0, source: `network:${initiator || 'resource'}` }, 'network');
        }
      } catch (_) {}
    }

    if (isX) {
      for (const bucket of xByTweet.values()) for (const rec of bucket.values()) add({ ...rec, source: 'x-api', pageUrl: location.href, hostname: location.hostname }, 'x-api');
    }

    return [...map.values()].sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  function resourceEntryToRecord(entry) {
    const url = directMediaUrl(entry?.name);
    const initiator = String(entry?.initiatorType || '').toLowerCase();
    if (!url || (!looksLikeMedia(url) && !['img', 'image', 'video', 'audio'].includes(initiator))) return null;
    const fallback = initiator === 'video' ? 'video' : initiator === 'audio' ? 'audio' : 'photo';
    return {
      type: mediaKindFromUrl(url, fallback),
      url,
      ext: X?.fileExt?.(url, fallback === 'video' ? 'mp4' : fallback === 'audio' ? 'mp3' : 'jpg') || 'bin',
      title: document.title,
      thumb: fallback === 'photo' ? url : '',
      sizeBytes: Number(entry?.encodedBodySize || entry?.transferSize) || 0,
      source: `network:${initiator || 'resource'}`
    };
  }

  function rememberResourceEntry(entry) {
    const rec = resourceEntryToRecord(entry);
    if (rec?.url) resourceRecordCache.set(`${rec.type}|${rec.url}`, rec);
  }

  function primeResourceObserver() {
    try {
      for (const entry of performance.getEntriesByType('resource')) rememberResourceEntry(entry);
      if (typeof PerformanceObserver === 'function') {
        const po = new PerformanceObserver((list) => {
          let changed = false;
          for (const entry of list.getEntries()) {
            const before = resourceRecordCache.size;
            rememberResourceEntry(entry);
            if (resourceRecordCache.size !== before) changed = true;
          }
          if (changed) mediaRevision++;
        });
        po.observe({ type: 'resource', buffered: true });
      }
    } catch (_) {}
  }
  primeResourceObserver();

  async function stylesheetMedia() {
    if (!stylesheetCacheDirty) return stylesheetCache;
    const found = [];
    let seen = 0;
    for (const sheet of document.styleSheets || []) {
      let rules;
      try { rules = sheet.cssRules; } catch (_) { continue; }
      const stack = [...(rules || [])];
      while (stack.length) {
        const rule = stack.pop();
        if (rule?.cssRules) stack.push(...rule.cssRules);
        const cssText = rule?.cssText || '';
        if (!/@font-face/i.test(cssText)) {
          for (const raw of extractCssUrls(cssText)) {
            const url = directMediaUrl(raw);
            if (url) found.push({ type: mediaKindFromUrl(url, 'photo'), url, ext: X?.fileExt?.(url, 'jpg') || 'jpg', title: document.title, thumb: url, source: 'stylesheet' });
          }
        }
        if (++seen % 220 === 0) await cooperativeYield();
      }
    }
    stylesheetCache = found;
    stylesheetCacheDirty = false;
    return found;
  }

  function collectPriorityMedia() {
    const map = new Map();
    let position = 0;
    const add = (input, source, boost = 0) => {
      if (!input?.url) return;
      const rec = decorateProviderRecord({ ...input });
      rec.position = Number(rec.position) || ++position;
      rec.source = rec.source || source || 'priority';
      rec.sources = rec.sources || [rec.source];
      rec.filename = rec.filename || fileNameFromUrl(rec.url);
      rec.pageUrl = rec.pageUrl || location.href;
      rec.hostname = rec.hostname || location.hostname;
      rec.contentPriority = Math.max(Number(rec.contentPriority) || 0, boost || 0);
      const key = `${rec.type || 'media'}|${rec.url}`;
      const old = map.get(key);
      if (!old) { map.set(key, rec); return; }
      map.set(key, {
        ...old,
        ...rec,
        width: Math.max(Number(old.width) || 0, Number(rec.width) || 0) || 0,
        height: Math.max(Number(old.height) || 0, Number(rec.height) || 0) || 0,
        contentPriority: Math.max(Number(old.contentPriority) || 0, Number(rec.contentPriority) || 0),
        viewportDistance: Math.min(Number(old.viewportDistance) || Number.MAX_SAFE_INTEGER, Number(rec.viewportDistance) || Number.MAX_SAFE_INTEGER),
        visible: Boolean(old.visible || rec.visible),
        xPostMedia: Boolean(old.xPostMedia || rec.xPostMedia),
        sources: [...new Set([...(old.sources || []), ...(rec.sources || []), old.source, rec.source].filter(Boolean))]
      });
    };

    // Provider-page records are semantic and cheap to produce, so surface them
    // before the broad DOM/network/style sweep.
    const providerRec = providerPageRecord();
    if (providerRec) add({ ...providerRec, contentPriority: 1100, visible: true, viewportDistance: 0 }, providerRec.source, 1100);

    if (isX) {
      // X is heavily virtualized. Scan only currently mounted tweet articles in
      // the instant lane, then let the lossless deep lane add everything else.
      const articles = document.querySelectorAll('article');
      for (const article of articles) {
        const apiRecords = xMediaForArticle(article);
        for (const rec of apiRecords) {
          const target = article.querySelector(rec.type === 'photo' ? 'img' : 'video') || article;
          add({ ...rec, source: 'x-api-fast', ...semanticHintsForElement(target, rec.url), xPostMedia: true, contentPriority: 1500 }, 'x-api-fast', 1500);
        }
        for (const img of article.querySelectorAll('img')) {
          const rec = imageRecord(img, ++position, 'x-fast-dom');
          if (rec) add(rec, 'x-fast-dom', rec.xPostMedia ? 1300 : rec.inArticle && !rec.xAvatar ? 700 : 0);
        }
        for (const video of article.querySelectorAll('video')) {
          const url = directMediaUrl(video.currentSrc || video.src);
          const hints = semanticHintsForElement(video, url || video.poster || '');
          if (url) add({ type: mediaKindFromUrl(url, 'video'), url, ext: X?.fileExt?.(url, 'mp4') || 'mp4', title: document.title, thumb: directMediaUrl(video.poster) || '', width: video.videoWidth || 0, height: video.videoHeight || 0, source: 'x-fast-video', context: lightContext(video), filename: fileNameFromUrl(url), ...hints, xPostMedia: true, contentPriority: 1250 }, 'x-fast-video', 1250);
          const poster = directMediaUrl(video.poster);
          if (poster) add({ type: mediaKindFromUrl(poster, 'photo'), url: poster, ext: X?.fileExt?.(poster, 'jpg') || 'jpg', title: `${document.title} poster`, thumb: poster, source: 'x-fast-poster', ...semanticHintsForElement(video, poster), xPostMedia: true, contentPriority: 1180 }, 'x-fast-poster', 1180);
        }
      }
      // API records can arrive before their article is mounted. Keep them in the
      // instant lane too; the deep lane later reconciles dimensions/context.
      for (const bucket of xByTweet.values()) for (const rec of bucket.values()) add({ ...rec, source: 'x-api-fast', pageUrl: location.href, hostname: location.hostname, xPostMedia: true, contentPriority: 1450 }, 'x-api-fast', 1450);
    } else {
      const selector = 'main img,main video,main audio,article img,article video,article audio,[role="main"] img,[role="main"] video,[role="main"] audio';
      let nodes = [];
      try { nodes = document.querySelectorAll(selector); } catch (_) {}
      for (const node of nodes) {
        const tag = String(node.localName || '').toLowerCase();
        if (tag === 'img') {
          const rec = imageRecord(node, ++position, 'priority-img');
          if (rec) add(rec, 'priority-img', Math.max(500, Number(rec.contentPriority) || 0));
        } else if (tag === 'video') {
          const url = directMediaUrl(node.currentSrc || node.src);
          const hints = semanticHintsForElement(node, url || node.poster || '');
          if (url) add({ type: mediaKindFromUrl(url, 'video'), url, ext: X?.fileExt?.(url, 'mp4') || 'mp4', title: document.title, thumb: directMediaUrl(node.poster) || '', width: node.videoWidth || 0, height: node.videoHeight || 0, source: 'priority-video', context: lightContext(node), filename: fileNameFromUrl(url), ...hints, contentPriority: Math.max(850, Number(hints.contentPriority) || 0) }, 'priority-video', 850);
        } else if (tag === 'audio') {
          const url = directMediaUrl(node.currentSrc || node.src);
          if (url) add({ type: 'audio', url, ext: X?.fileExt?.(url, 'mp3') || 'mp3', title: document.title, source: 'priority-audio', context: lightContext(node), filename: fileNameFromUrl(url), ...semanticHintsForElement(node, url), contentPriority: 850 }, 'priority-audio', 850);
        }
      }
    }

    return [...map.values()].sort((a, b) =>
      (Number(b.contentPriority) || 0) - (Number(a.contentPriority) || 0) ||
      (Number(a.viewportDistance) || 0) - (Number(b.viewportDistance) || 0) ||
      (Number(a.position) || 0) - (Number(b.position) || 0)
    );
  }

  async function collectPageMediaYielding(deep = true) {
    if (shadowRootsDirty) {
      await discoverShadowRoots(document);
      shadowRootsDirty = false;
    }
    const map = new Map();
    let position = 0;
    const add = (input, source) => {
      if (!input?.url) return;
      const rec = decorateProviderRecord({ ...input });
      rec.position = Number(rec.position) || ++position;
      if (!rec.source) rec.source = source || 'page';
      if (!rec.sources) rec.sources = [rec.source];
      if (!rec.filename) rec.filename = fileNameFromUrl(rec.url);
      if (!rec.pageUrl) rec.pageUrl = location.href;
      if (!rec.hostname) rec.hostname = location.hostname;
      const key = `${rec.type || 'media'}|${rec.url}`;
      const old = map.get(key);
      if (!old) { map.set(key, rec); return; }
      const sources = new Set([...(old.sources || []), ...(rec.sources || []), old.source, rec.source].filter(Boolean));
      map.set(key, {
        ...old, ...rec,
        width: Math.max(Number(old.width) || 0, Number(rec.width) || 0) || 0,
        height: Math.max(Number(old.height) || 0, Number(rec.height) || 0) || 0,
        position: Math.min(Number(old.position) || rec.position, Number(rec.position) || old.position),
        thumb: old.thumb || rec.thumb || '',
        title: old.title || rec.title || '',
        sources: [...sources],
        source: old.source || rec.source
      });
    };

    const selector = deep
      ? 'img,picture source[srcset],video,audio,a[href],link[href][as],link[href][type],object[data],embed[src],svg image,[style*="url("]'
      : 'img,picture source[srcset],video,audio,svg image';
    let inspected = 0;
    for (const root of collectRoots()) {
      let nodes;
      try { nodes = root.querySelectorAll?.(selector) || []; } catch (_) { nodes = []; }
      for (const node of nodes) {
        const tag = String(node.localName || '').toLowerCase();
        if (tag === 'img') {
          add(imageRecord(node, ++position, 'img'), 'img');
        } else if (tag === 'source' && node.closest?.('picture')) {
          const candidates = parseSrcset(node.getAttribute('srcset')).sort((a, b) => b.score - a.score);
          const url = directMediaUrl(candidates[0]?.url);
          if (url) add({ type: mediaKindFromUrl(url, 'photo'), url, ext: X?.fileExt?.(url, 'jpg') || 'jpg', title: node.closest('picture')?.querySelector('img')?.alt || document.title, thumb: url, source: 'picture-srcset' }, 'picture-srcset');
        } else if (tag === 'video') {
          const urls = [node.currentSrc, node.src, ...[...node.querySelectorAll('source[src]')].map((n) => n.src)].map(directMediaUrl).filter(Boolean);
          for (const url of urls) add({ type: mediaKindFromUrl(url, 'video'), url, ext: X?.fileExt?.(url, 'mp4') || 'mp4', title: document.title, thumb: node.poster || '', width: node.videoWidth || 0, height: node.videoHeight || 0, source: 'video', context: lightContext(node) }, 'video');
          if (node.poster) {
            const poster = directMediaUrl(node.poster);
            if (poster) add({ type: mediaKindFromUrl(poster, 'photo'), url: poster, ext: X?.fileExt?.(poster, 'jpg') || 'jpg', title: `${document.title} poster`, thumb: poster, source: 'video-poster' }, 'video-poster');
          }
        } else if (tag === 'audio') {
          const urls = [node.currentSrc, node.src, ...[...node.querySelectorAll('source[src]')].map((n) => n.src)].map(directMediaUrl).filter(Boolean);
          for (const url of urls) add({ type: 'audio', url, ext: X?.fileExt?.(url, 'mp3') || 'mp3', title: document.title, source: 'audio', context: lightContext(node) }, 'audio');
        } else if (tag === 'a' && deep) {
          const url = directMediaUrl(node.href);
          if (url && looksLikeMedia(url)) add({ type: mediaKindFromUrl(url, IMAGE_EXT_RE.test(url) ? 'photo' : 'media'), url, ext: X?.fileExt?.(url, 'bin') || 'bin', title: node.textContent?.trim() || node.title || document.title, thumb: IMAGE_EXT_RE.test(url) ? url : '', source: 'link' }, 'link');
        } else if (tag === 'link' && deep) {
          const url = directMediaUrl(node.href || node.getAttribute('href'));
          const hint = `${node.getAttribute('as') || ''} ${node.getAttribute('type') || ''}`.toLowerCase();
          if (url && (looksLikeMedia(url) || /image|video|audio/.test(hint))) {
            const fallback = /video/.test(hint) ? 'video' : /audio/.test(hint) ? 'audio' : 'photo';
            add({ type: mediaKindFromUrl(url,fallback), url, ext: X?.fileExt?.(url,fallback==='video'?'mp4':fallback==='audio'?'mp3':'jpg') || 'bin', title: document.title, thumb: fallback==='photo'?url:'', source:'resource-hint', context:lightContext(node) }, 'resource-hint');
          }
        } else if ((tag === 'object' || tag === 'embed') && deep) {
          const url = directMediaUrl(tag === 'object' ? node.data || node.getAttribute('data') : node.src || node.getAttribute('src'));
          if (url && looksLikeMedia(url)) {
            const fallback = /audio/i.test(node.type || '') ? 'audio' : /video/i.test(node.type || '') ? 'video' : 'photo';
            add({ type:mediaKindFromUrl(url,fallback), url, ext:X?.fileExt?.(url,fallback==='video'?'mp4':fallback==='audio'?'mp3':'bin')||'bin', title:document.title, thumb:fallback==='photo'?url:'', source:tag, context:lightContext(node) }, tag);
          }
        } else if (tag === 'image') {
          const url = directMediaUrl(node.href?.baseVal || node.getAttribute('href'));
          if (url) add({ type: mediaKindFromUrl(url, 'photo'), url, ext: X?.fileExt?.(url, 'png') || 'png', title: document.title, thumb: url, source: 'svg-image' }, 'svg-image');
        }
        if (deep && node.getAttribute?.('style')?.includes('url(')) {
          for (const raw of extractCssUrls(node.getAttribute('style') || '')) {
            const url = directMediaUrl(raw);
            if (url) add({ type: mediaKindFromUrl(url, 'photo'), url, ext: X?.fileExt?.(url, 'jpg') || 'jpg', title: node.getAttribute?.('aria-label') || node.getAttribute?.('title') || document.title, thumb: url, source: 'inline-css' }, 'inline-css');
          }
        }
        if (++inspected % 180 === 0) await cooperativeYield();
      }
    }

    let metaCount = 0;
    for (const meta of document.querySelectorAll('meta[property],meta[name]')) {
      const key = String(meta.getAttribute('property') || meta.getAttribute('name') || '').toLowerCase();
      if (!/(?:^|:)(?:image|video|audio)(?::|$)|twitter:(?:image|player)/.test(key)) continue;
      const url = directMediaUrl(meta.content);
      if (!url) continue;
      const fallback = key.includes('video') || key.includes('player') ? 'video' : key.includes('audio') ? 'audio' : 'photo';
      add({ type: mediaKindFromUrl(url, fallback), url, ext: X?.fileExt?.(url, fallback === 'video' ? 'mp4' : fallback === 'audio' ? 'mp3' : 'jpg') || 'bin', title: document.title, thumb: fallback === 'photo' ? url : '', source: 'metadata', nonDownloadable: fallback !== 'photo' && !looksLikeMedia(url), streamingPage: fallback !== 'photo' && !looksLikeMedia(url) }, 'metadata');
      if (++metaCount % 80 === 0) await cooperativeYield();
    }

    const providerRec = providerPageRecord();
    if (providerRec) add(providerRec, providerRec.source);
    for (const rec of jsonLdMediaRecords()) add(rec, rec.source || 'jsonld');

    if (deep) {
      for (const rec of await stylesheetMedia()) add(rec, 'stylesheet');
      for (const rec of resourceRecordCache.values()) add(rec, 'network');
    }
    if (isX) {
      for (const bucket of xByTweet.values()) for (const rec of bucket.values()) add({ ...rec, source: 'x-api', pageUrl: location.href, hostname: location.hostname }, 'x-api');
    }
    return [...map.values()].sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  async function pageMediaSnapshot(force = false) {
    if (!force && snapshotRevision === mediaRevision && snapshotRecords.length) return snapshotRecords;
    if (snapshotPromise) return snapshotPromise;
    const targetRevision = mediaRevision;
    // Run the complete deep snapshot as a low-priority scheduled task when
    // Chromium exposes Prioritized Task Scheduling. Every scheduler.yield()
    // inside the scan then inherits background priority, keeping page input and
    // rendering ahead of MediaForge without dropping any discovery source.
    snapshotPromise = postBackgroundTask(() => collectPageMediaYielding(true)).then((result) => {
      snapshotRecords = result;
      snapshotRevision = targetRevision;
      return result;
    }).finally(() => { snapshotPromise = null; });
    return snapshotPromise;
  }

  function iconSvg(kind) {
    const paths = {
      view: '<path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>',
      download: '<path d="M12 3v11m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/>',
      save: '<path d="M12 3v10m0 0 3.5-3.5M12 13 8.5 9.5"/><path d="M4 17v3h16v-3"/>',
      panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>',
      copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 16H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
      fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
      one: '<path d="M8 7h3v10M8 17h6"/><path d="M17 8v8"/>',
      prev: '<path d="m15 5-7 7 7 7"/>',
      next: '<path d="m9 5 7 7-7 7"/>',
      flip: '<path d="M12 3v18"/><path d="m9 7-5 5 5 5M15 7l5 5-5 5"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[kind] || paths.download}</svg>`;
  }

  let bar = null;
  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'mfgx-hoverbar';
    bar.setAttribute('role', 'toolbar');
    const defs = [
      ['view', 'View / zoom'],
      ['download', 'Download best/original'],
      ['save', 'Save as…'],
      ['gif', 'Save as GIF'],
      ['copy', 'Copy media URL'],
      ['panel', 'Open MediaForge GX panel']
    ];
    for (const [name, title] of defs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.action = name;
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.innerHTML = name === 'gif' ? '<span class="mfgx-gif-label">GIF</span>' : iconSvg(name);
      bar.appendChild(btn);
    }
    document.documentElement.appendChild(bar);
    bar.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    bar.addEventListener('pointerleave', () => scheduleHide(260));
    bar.addEventListener('click', onToolbarClick, true);
    return bar;
  }

  function placeBar(target, rec) {
    if (!settings.hoverTools || !target || !rec) return;
    const pvBar = document.getElementById('pv-float-bar-container');
    const pvVisible = pvBar && getComputedStyle(pvBar).display !== 'none' && getComputedStyle(pvBar).visibility !== 'hidden' && Number(getComputedStyle(pvBar).opacity || 1) > 0.02;
    if (settings.preferPicviewerBar && settings.integratePicviewer && pvVisible) {
      augmentPicviewer();
      return;
    }
    const b = ensureBar();
    const r = target.getBoundingClientRect();
    if (r.width < 48 || r.height < 48) return;
    b.querySelector('[data-action="gif"]').hidden = !(rec.type === 'gif' || rec.type === 'video') || !/\.mp4(?:[?#]|$)/i.test(rec.url);
    b.classList.add('mfgx-visible');
    const width = b.offsetWidth || 270;
    const left = Math.max(8, Math.min(innerWidth - width - 8, r.left + 10));
    const top = Math.max(8, Math.min(innerHeight - 44, r.top + 10));
    b.style.left = `${left}px`;
    b.style.top = `${top}px`;
  }

  function scheduleHide(ms = 360) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => bar?.classList.remove('mfgx-visible'), ms);
  }

  async function onToolbarClick(event) {
    const btn = event.target.closest('button[data-action]');
    if (!btn || !currentRecord) return;
    event.preventDefault();
    event.stopPropagation();
    const action = btn.dataset.action;
    if (action === 'view') openViewer(currentRecord);
    if (action === 'download') await downloadRecord(currentRecord, false, btn);
    if (action === 'save') await downloadRecord(currentRecord, true, btn);
    if (action === 'gif') await convertGif(currentRecord, btn);
    if (action === 'copy') {
      await navigator.clipboard.writeText(currentRecord.url).catch(() => {});
      toast('Media URL copied', 'ok');
    }
    if (action === 'panel') await send({ type: 'mfgx:openPanel' });
  }

  async function downloadRecord(rec, saveAs, button) {
    button?.classList.add('mfgx-busy');
    const r = await send({ type: 'mfgx:download', record: rec, saveAs });
    button?.classList.remove('mfgx-busy');
    if (r?.ok) {
      button?.classList.add('mfgx-done');
      setTimeout(() => button?.classList.remove('mfgx-done'), 900);
      toast(saveAs ? 'Save dialog opened' : 'Download started', 'ok');
    } else toast(r?.error || 'Download failed', 'error');
    return r;
  }

  async function convertGif(rec, button) {
    button?.classList.add('mfgx-busy');
    const r = await send({ type: 'mfgx:convertGif', record: rec, options: { fps: settings.gifFps, maxWidth: settings.gifMaxWidth } });
    button?.classList.remove('mfgx-busy');
    if (r?.ok) toast('GIF conversion queued in the background', 'ok');
    else toast(r?.error || 'GIF conversion failed to start', 'error');
    return r;
  }

  document.addEventListener('pointerover', (event) => {
    const t = event.target instanceof Element ? event.target : null;
    if (!t || t.closest('#mfgx-hoverbar,.mfgx-viewer,#mfgx-toast,#pv-float-bar-container')) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      const rec = recordFromElement(t);
      if (!rec) return;
      currentRecord = rec;
      currentTarget = t instanceof HTMLSourceElement ? t.parentElement : (t.closest('img,video') || t);
      placeBar(currentTarget, rec);
      augmentPicviewer();
    }, 55);
  }, true);

  document.addEventListener('pointerout', (event) => {
    if (event.target === currentTarget || event.target?.closest?.('img,video') === currentTarget) scheduleHide(520);
  }, true);

  // ---- Picviewer CE+ coexistence bridge ---------------------------------
  function augmentPicviewer() {
    if (!settings.integratePicviewer || !currentRecord) return;
    const pv = document.getElementById('pv-float-bar-container');
    if (!pv) return;
    let slot = pv.querySelector(':scope > .mfgx-pvce-slot');
    if (!slot) {
      slot = document.createElement('span');
      slot.className = 'mfgx-pvce-slot';
      const dl = document.createElement('button');
      dl.type = 'button'; dl.className = 'mfgx-pvce-btn'; dl.title = 'MediaForge GX: best/original download'; dl.textContent = 'GX↓';
      const gif = document.createElement('button');
      gif.type = 'button'; gif.className = 'mfgx-pvce-btn mfgx-pvce-gif'; gif.title = 'MediaForge GX: save as real GIF'; gif.textContent = 'GIF';
      dl.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); downloadRecord(currentRecord, false, dl); }, true);
      gif.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); convertGif(currentRecord, gif); }, true);
      slot.append(dl, gif);
      pv.appendChild(slot);
    }
    const gif = slot.querySelector('.mfgx-pvce-gif');
    gif.hidden = !(currentRecord.type === 'gif' || currentRecord.type === 'video') || !/\.mp4(?:[?#]|$)/i.test(currentRecord.url);
  }

  // ---- X inline action buttons ------------------------------------------
  function findActionBar(article) {
    const anchor = article.querySelector('[data-testid="like"],[data-testid="unlike"],[data-testid="reply"],[data-testid="retweet"],[data-testid="unretweet"]');
    return anchor?.closest('[role="group"]') || null;
  }

  function decorateXArticle(article) {
    if (!settings.xButtons || !isX || article.querySelector(':scope .mfgx-x-slot')) return;
    const records = xMediaForArticle(article);
    if (!records.length) return;
    const actionBar = findActionBar(article);
    if (!actionBar) return;

    const slot = document.createElement('div');
    slot.className = 'mfgx-x-slot';
    const dl = document.createElement('button');
    dl.type = 'button'; dl.className = 'mfgx-x-btn'; dl.title = records.length > 1 ? `Download ${records.length} media files in best/original quality` : 'Download in best/original quality';
    dl.innerHTML = iconSvg('download');
    dl.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      dl.classList.add('mfgx-busy');
      const r = await send({ type: 'mfgx:downloadBatch', records });
      dl.classList.remove('mfgx-busy');
      if (r?.started) { dl.classList.add('mfgx-done'); setTimeout(() => dl.classList.remove('mfgx-done'), 1100); toast(`${r.started} download${r.started === 1 ? '' : 's'} started`, 'ok'); }
      else toast(r?.error || 'Download failed', 'error');
    }, true);
    slot.appendChild(dl);

    const gifRec = records.find((r) => r.type === 'gif');
    if (gifRec) {
      const gif = document.createElement('button');
      gif.type = 'button'; gif.className = 'mfgx-x-btn mfgx-x-gif'; gif.title = 'Save this X animation as a real GIF'; gif.textContent = 'GIF';
      gif.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); convertGif(gifRec, gif); }, true);
      slot.appendChild(gif);
    }
    actionBar.appendChild(slot);
  }

  function markXDirty(node) {
    if (!isX || !(node instanceof Element)) return;
    if (node.matches?.('article')) dirtyXArticles.add(node);
    const parent = node.closest?.('article');
    if (parent) dirtyXArticles.add(parent);
    for (const article of node.querySelectorAll?.('article') || []) dirtyXArticles.add(article);
  }

  function scanX() {
    if (!isX) return;
    if (fullXScanNeeded) {
      fullXScanNeeded = false;
      for (const article of document.querySelectorAll('article')) dirtyXArticles.add(article);
    }
    for (const article of dirtyXArticles) {
      dirtyXArticles.delete(article);
      if (!article.isConnected) continue;
      try { decorateXArticle(article); } catch (_) {}
    }
    augmentPicviewer();
  }

  function queueScan(node = null, full = false) {
    if (full) fullXScanNeeded = true;
    if (node) markXDirty(node);
    if (scanQueued || !isX) return;
    scanQueued = true;
    requestAnimationFrame(() => { scanQueued = false; scanX(); });
  }

  const observer = new MutationObserver((mutations) => {
    let pageChanged = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        pageChanged = true;
        if (node instanceof Element) {
          queueScan(node);
          if (node.matches?.('style,link[rel~="stylesheet"]') || node.querySelector?.('style,link[rel~="stylesheet"]')) stylesheetCacheDirty = true;
          shadowRootsDirty = true;
        }
      }
      if ((mutation.removedNodes?.length || 0) > 0) pageChanged = true;
    }
    if (pageChanged) mediaRevision++;
  });
  function startObserver() {
    // No generic-page MutationObserver and no eager deep scan: those are the
    // biggest avoidable background costs on SPA-heavy sites. Generic media is
    // scanned only when the panel requests it. X still needs a tiny targeted
    // observer to keep its inline action buttons current.
    if (isX) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
      queueScan(null, true);
    }
  }
  if (document.documentElement) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver, { once: true });

  // ---- Viewer ------------------------------------------------------------
  let viewer = null;
  function openViewer(initial) {
    const records = collectPageMedia();
    let index = Math.max(0, records.findIndex((r) => r.url === initial.url));
    if (!viewer) viewer = createViewer();
    viewer.hidden = false;
    viewer.dataset.open = '1';
    document.documentElement.classList.add('mfgx-viewing');
    renderViewer(records, index);

    function renderViewer(list, idx) {
      index = Math.max(0, Math.min(list.length - 1, idx));
      const rec = list[index] || initial;
      viewer.__record = rec;
      viewer.__list = list;
      viewer.__index = index;
      const stage = viewer.querySelector('.mfgx-viewer-stage');
      stage.replaceChildren();
      let media;
      if (rec.type === 'video' || rec.type === 'gif') {
        media = document.createElement('video');
        media.src = rec.url; media.controls = true; media.loop = rec.type === 'gif'; media.autoplay = true; media.playsInline = true;
      } else {
        media = document.createElement('img'); media.src = rec.url; media.alt = rec.title || 'Media';
      }
      media.className = 'mfgx-viewer-media';
      media.dataset.scale = '1'; media.dataset.rotate = '0'; media.dataset.flip = '1';
      stage.appendChild(media);
      viewer.querySelector('.mfgx-viewer-count').textContent = `${index + 1} / ${Math.max(1, list.length)}`;
      viewer.querySelector('.mfgx-viewer-title').textContent = `${rec.type?.toUpperCase?.() || 'MEDIA'} · ${X?.qualityLabel?.(rec) || ''}`;
      viewer.querySelector('[data-vaction="gif"]').hidden = !(rec.type === 'gif' || rec.type === 'video') || !/\.mp4(?:[?#]|$)/i.test(rec.url);
    }
    viewer.__render = renderViewer;
  }

  function createViewer() {
    const root = document.createElement('div');
    root.className = 'mfgx-viewer';
    root.hidden = true;
    const chromeBar = document.createElement('div'); chromeBar.className = 'mfgx-viewer-chrome';
    const title = document.createElement('div'); title.className = 'mfgx-viewer-title';
    const count = document.createElement('div'); count.className = 'mfgx-viewer-count';
    const tools = document.createElement('div'); tools.className = 'mfgx-viewer-tools';
    const defs = [['prev','Previous'],['next','Next'],['fit','Fit'],['one','1:1'],['rotate','Rotate'],['flip','Flip'],['download','Download'],['gif','GIF'],['close','Close']];
    for (const [name, label] of defs) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.vaction = name; b.title = label; b.setAttribute('aria-label', label);
      b.innerHTML = name === 'gif' ? '<span class="mfgx-gif-label">GIF</span>' : iconSvg(name);
      tools.appendChild(b);
    }
    chromeBar.append(title, count, tools);
    const stage = document.createElement('div'); stage.className = 'mfgx-viewer-stage';
    root.append(chromeBar, stage);
    document.documentElement.appendChild(root);

    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-vaction]');
      if (!b) return;
      const action = b.dataset.vaction;
      const media = root.querySelector('.mfgx-viewer-media');
      const rec = root.__record;
      if (action === 'close') closeViewer();
      else if (action === 'prev' || action === 'next') root.__render(root.__list, root.__index + (action === 'next' ? 1 : -1));
      else if (action === 'download') downloadRecord(rec, false, b);
      else if (action === 'gif') convertGif(rec, b);
      else if (media) {
        if (action === 'fit') { media.dataset.scale = '1'; media.style.maxWidth = '100%'; media.style.maxHeight = '100%'; }
        if (action === 'one') { media.dataset.scale = '1'; media.style.maxWidth = 'none'; media.style.maxHeight = 'none'; }
        if (action === 'rotate') media.dataset.rotate = String((Number(media.dataset.rotate) + 90) % 360);
        if (action === 'flip') media.dataset.flip = String(Number(media.dataset.flip) * -1);
        applyTransform(media);
      }
    }, true);

    stage.addEventListener('wheel', (e) => {
      const media = root.querySelector('.mfgx-viewer-media');
      if (!media) return;
      e.preventDefault();
      media.dataset.scale = String(Math.min(8, Math.max(0.1, Number(media.dataset.scale || 1) * (e.deltaY < 0 ? 1.12 : 0.89))));
      media.style.maxWidth = 'none'; media.style.maxHeight = 'none';
      applyTransform(media);
    }, { passive: false });
    root.addEventListener('dblclick', (e) => { if (e.target === root || e.target === stage) closeViewer(); });
    return root;
  }

  function applyTransform(media) {
    const scale = Number(media.dataset.scale || 1), rotate = Number(media.dataset.rotate || 0), flip = Number(media.dataset.flip || 1);
    media.style.transform = `scale(${scale * flip},${scale}) rotate(${rotate}deg)`;
  }

  function closeViewer() {
    if (!viewer) return;
    viewer.hidden = true; viewer.dataset.open = '0';
    viewer.querySelector('video')?.pause?.();
    document.documentElement.classList.remove('mfgx-viewing');
  }

  document.addEventListener('keydown', (e) => {
    if (!viewer || viewer.hidden) return;
    if (e.key === 'Escape') closeViewer();
    if (e.key === 'ArrowRight') viewer.__render(viewer.__list, viewer.__index + 1);
    if (e.key === 'ArrowLeft') viewer.__render(viewer.__list, viewer.__index - 1);
  }, true);

  // ---- Toast -------------------------------------------------------------
  function toast(message, kind = 'info') {
    let node = document.getElementById('mfgx-toast');
    if (!node) {
      node = document.createElement('div'); node.id = 'mfgx-toast'; document.documentElement.appendChild(node);
    }
    node.textContent = message; node.dataset.kind = kind; node.classList.add('mfgx-toast-show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('mfgx-toast-show'), 2600);
  }

  function fastFrameSnapshot() {
    return {
      page: {
        title: document.title,
        url: location.href,
        hostname: location.hostname,
        isX,
        provider: pageProvider,
        top: window.top === window
      },
      records: collectPriorityMedia(),
      phase: 'priority'
    };
  }

  async function frameSnapshot(force = false) {
    // Generic pages do not keep a mutation observer running just to invalidate
    // scan caches. A panel snapshot always re-reads the live DOM instead.
    // X keeps targeted dirty-article tracking for its inline action buttons.
    const mustRefresh = force || !isX;
    if (mustRefresh) {
      stylesheetCacheDirty = true;
      shadowRootsDirty = true;
    }
    return {
      page: {
        title: document.title,
        url: location.href,
        hostname: location.hostname,
        isX,
        provider: pageProvider,
        top: window.top === window
      },
      records: await pageMediaSnapshot(mustRefresh)
    };
  }
  try {
    Object.defineProperty(globalThis, '__MFGX_FRAME_FAST_SNAPSHOT__', {
      value: fastFrameSnapshot,
      configurable: true,
      enumerable: false
    });
  } catch (_) {
    globalThis.__MFGX_FRAME_FAST_SNAPSHOT__ = fastFrameSnapshot;
  }
  try {
    Object.defineProperty(globalThis, '__MFGX_FRAME_SNAPSHOT__', {
      value: frameSnapshot,
      configurable: true,
      enumerable: false
    });
  } catch (_) {
    globalThis.__MFGX_FRAME_SNAPSHOT__ = frameSnapshot;
  }

  // ---- side panel bridge -------------------------------------------------
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;
    if (message.type === 'mfgx:getFastPageState') {
      try { sendResponse({ ok: true, ...fastFrameSnapshot() }); }
      catch (error) { sendResponse({ ok: false, error: String(error?.message || error) }); }
      return false;
    }
    if (message.type === 'mfgx:getPageState') {
      frameSnapshot(Boolean(message.force)).then((snap) => sendResponse({ ok: true, ...snap }), (error) => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
    if (message.type === 'mfgx:viewRecord') {
      if (message.record) openViewer(message.record);
      sendResponse({ ok: true }); return false;
    }
    if (message.type === 'mfgx:downloadLocal') {
      const rec = message.record;
      if (!rec?.url || !/^(?:blob:|data:)/i.test(rec.url)) {
        sendResponse({ ok: false, error: 'This frame does not own a local blob/data URL.' });
        return false;
      }
      try {
        const a = document.createElement('a');
        a.href = rec.url;
        a.download = rec.filename || `${rec.type || 'media'}.${rec.ext || (rec.type === 'video' ? 'mp4' : 'bin')}`;
        a.style.display = 'none';
        document.documentElement.appendChild(a);
        a.click();
        a.remove();
        sendResponse({ ok: true, local: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
      return false;
    }
    if (message.type === 'mfgx:rescan') {
      mediaRevision++;
      stylesheetCacheDirty = true;
      queueScan(null, true);
      postBackgroundTask(() => pageMediaSnapshot(true)).catch(() => {});
      sendResponse({ ok: true }); return false;
    }
    return false;
  });
})();
