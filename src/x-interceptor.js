/* Runs in X's MAIN world at document_start. It only observes responses the page already fetched. */
(function () {
  'use strict';
  if (window.__MFGX_INTERCEPTOR__) return;
  window.__MFGX_INTERCEPTOR__ = true;

  const parser = globalThis.MediaForgeX;
  if (!parser) return;
  const SOURCE = 'mediaforge-gx/page/v1';
  const API_RE = /\/(?:i\/api\/(?:graphql|2|1\.1)|1\.1)\//i;
  const MAX_BODY = 35 * 1024 * 1024;
  const seenFingerprints = new Set();

  function publish(items) {
    if (!Array.isArray(items) || !items.length) return;
    const compact = [];
    for (const item of items) {
      const fp = `${item.tweetId}|${item.key}|${item.url}`;
      if (seenFingerprints.has(fp)) continue;
      seenFingerprints.add(fp);
      compact.push(item);
    }
    if (!compact.length) return;
    if (seenFingerprints.size > 5000) seenFingerprints.clear();
    window.postMessage({ source: SOURCE, type: 'media', items: compact }, window.location.origin);
  }

  function scanJson(data) {
    try {
      publish(parser.collectMedia(data));
    } catch (_) {
      // Instrumentation must never affect X.
    }
  }

  function scanText(text) {
    if (typeof text !== 'string' || text.length < 2 || text.length > MAX_BODY) return;
    if (!text.includes('video_info') && !text.includes('extended_entities') && !text.includes('media_entities')) return;
    try { scanJson(JSON.parse(text)); } catch (_) {}
  }

  function isRelevant(raw) {
    try {
      const u = new URL(typeof raw === 'string' ? raw : raw?.url, location.href);
      return (u.hostname === 'x.com' || u.hostname.endsWith('.x.com') || u.hostname === 'twitter.com' || u.hostname.endsWith('.twitter.com')) && API_RE.test(u.pathname);
    } catch (_) {
      return false;
    }
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function' && !nativeFetch.__mfgxWrapped) {
    const wrappedFetch = function () {
      const input = arguments[0];
      const relevant = isRelevant(input);
      const p = nativeFetch.apply(this, arguments);
      if (relevant) {
        p.then((response) => {
          try { response.clone().text().then(scanText, () => {}); } catch (_) {}
        }).catch(() => {});
      }
      return p;
    };
    Object.defineProperty(wrappedFetch, '__mfgxWrapped', { value: true });
    window.fetch = wrappedFetch;
  }

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  if (nativeOpen && nativeSend && !nativeSend.__mfgxWrapped) {
    XMLHttpRequest.prototype.open = function (method, url) {
      try { this.__mfgxUrl = String(url || ''); } catch (_) {}
      return nativeOpen.apply(this, arguments);
    };
    const wrappedSend = function () {
      try {
        if (isRelevant(this.__mfgxUrl)) {
          this.addEventListener('loadend', function () {
            try {
              if (this.responseType === 'json' && this.response) scanJson(this.response);
              else if (!this.responseType || this.responseType === 'text') scanText(this.responseText);
            } catch (_) {}
          }, { once: true });
        }
      } catch (_) {}
      return nativeSend.apply(this, arguments);
    };
    Object.defineProperty(wrappedSend, '__mfgxWrapped', { value: true });
    XMLHttpRequest.prototype.send = wrappedSend;
  }

  // Warm-start from embedded JSON when X has already serialized useful state into the page.
  const scanEmbedded = () => {
    let bytes = 0;
    for (const node of document.querySelectorAll('script[type="application/json"]')) {
      const text = node.textContent || '';
      bytes += text.length;
      if (bytes > MAX_BODY) break;
      scanText(text);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanEmbedded, { once: true });
  else queueMicrotask(scanEmbedded);
})();
