/* MediaForge GX - pure X media parsing utilities. Browser + Node compatible. */
(function (root) {
  'use strict';

  const VIDEO_HOST = 'video.twimg.com';
  const PHOTO_HOSTS = new Set(['pbs.twimg.com']);
  const MAX_WALK_NODES = 220000;
  const MAX_DEPTH = 42;

  function isObject(value) {
    return value !== null && typeof value === 'object';
  }

  function numericId(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value)) value = String(value);
    if (typeof value !== 'string') return null;
    const s = value.trim();
    return /^\d{5,25}$/.test(s) ? s : null;
  }

  function safeUrl(raw, base) {
    if (typeof raw !== 'string' || !raw || raw.length > 12000) return null;
    try {
      return new URL(raw, base || 'https://x.com/');
    } catch (_) {
      return null;
    }
  }

  function dimensionsFromUrl(raw) {
    const m = String(raw || '').match(/\/(\d{2,5})x(\d{2,5})\//);
    return m ? { width: Number(m[1]) || 0, height: Number(m[2]) || 0 } : { width: 0, height: 0 };
  }

  function normalizeVideoVariant(v) {
    if (!isObject(v)) return null;
    const raw = v.url || v.src || v.playback_url;
    const u = safeUrl(raw);
    if (!u || u.protocol !== 'https:' || u.hostname.toLowerCase() !== VIDEO_HOST) return null;
    const type = String(v.content_type || v.mime_type || v.type || '').toLowerCase();
    const mp4 = type.includes('video/mp4') || /\.mp4$/i.test(u.pathname);
    if (!mp4) return null;
    const dims = dimensionsFromUrl(u.href);
    return {
      url: u.href,
      bitrate: Math.max(0, Number(v.bitrate ?? v.bit_rate ?? v.tbr) || 0),
      width: Math.max(0, Number(v.width) || dims.width || 0),
      height: Math.max(0, Number(v.height) || dims.height || 0),
      contentType: 'video/mp4'
    };
  }

  function variantScore(v) {
    if (!v) return -1;
    const area = (v.width || 0) * (v.height || 0);
    return area * 1e7 + (v.bitrate || 0);
  }

  function chooseBestVariant(variants) {
    if (!Array.isArray(variants)) return null;
    let best = null;
    const seen = new Set();
    for (const raw of variants) {
      const v = normalizeVideoVariant(raw);
      if (!v || seen.has(v.url)) continue;
      seen.add(v.url);
      if (!best || variantScore(v) > variantScore(best)) best = v;
    }
    return best;
  }

  function originalPhotoUrl(raw) {
    const u = safeUrl(raw, 'https://pbs.twimg.com/');
    if (!u || u.protocol !== 'https:' || !PHOTO_HOSTS.has(u.hostname.toLowerCase())) return null;
    let fmt = u.searchParams.get('format');
    const dot = u.pathname.lastIndexOf('.');
    if (dot > u.pathname.lastIndexOf('/')) {
      fmt ||= u.pathname.slice(dot + 1);
      u.pathname = u.pathname.slice(0, dot);
    }
    u.searchParams.set('format', fmt || 'jpg');
    u.searchParams.set('name', 'orig');
    return u.href;
  }

  function fileExt(raw, fallback) {
    const u = safeUrl(raw);
    if (!u) return fallback || 'bin';
    const fmt = u.searchParams.get('format');
    if (fmt && /^[a-z0-9]{2,6}$/i.test(fmt)) return fmt.toLowerCase();
    const m = u.pathname.match(/\.([a-z0-9]{2,6})$/i);
    return m ? m[1].toLowerCase() : (fallback || 'bin');
  }

  function mediaIdFromUrl(raw) {
    const s = String(raw || '');
    const patterns = [
      /\/(?:ext_tw_video|amplify_video|tweet_video|dm_video)\/(\d{5,25})\//,
      /\/(?:ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\/(\d{5,25})\//
    ];
    for (const re of patterns) {
      const m = s.match(re);
      if (m) return m[1];
    }
    return null;
  }

  function mediaKey(raw) {
    const u = safeUrl(raw, 'https://pbs.twimg.com/');
    if (!u) return null;
    let seg = u.pathname.slice(u.pathname.lastIndexOf('/') + 1);
    if (!seg) return null;
    seg = seg.replace(/\.[a-z0-9]{2,6}$/i, '');
    return seg || null;
  }

  function collectVariantLists(entity) {
    return [
      entity?.video_info?.variants,
      entity?.media_info?.variants,
      entity?.media_info?.video_info?.variants,
      entity?.video?.variants,
      entity?.variants
    ].filter(Array.isArray).flat();
  }

  function normalizeMediaEntity(entity, context, index) {
    if (!isObject(entity)) return null;
    const typeRaw = String(entity.type || entity?.media_info?.type || '').toLowerCase();
    const photoRaw = entity.media_url_https || entity.media_url || entity.preview_image_url || entity?.media_info?.preview_image_url || '';
    const tweetId = context?.tweetId || 'unknown';
    const handle = context?.handle || 'x';

    const looksPhoto = typeRaw === 'photo' || (!!photoRaw && !collectVariantLists(entity).length && !typeRaw.includes('video'));
    if (looksPhoto) {
      const url = originalPhotoUrl(photoRaw);
      if (!url) return null;
      return {
        key: entity.media_key || mediaKey(photoRaw) || url,
        mediaId: String(entity.id_str || entity.id || mediaKey(photoRaw) || index),
        type: 'photo',
        url,
        variants: [],
        ext: fileExt(url, 'jpg'),
        tweetId,
        handle,
        index,
        thumb: photoRaw || url,
        width: Number(entity?.original_info?.width || entity?.sizes?.large?.w) || 0,
        height: Number(entity?.original_info?.height || entity?.sizes?.large?.h) || 0
      };
    }

    const rawVariants = collectVariantLists(entity);
    const variants = [];
    const seen = new Set();
    for (const raw of rawVariants) {
      const v = normalizeVideoVariant(raw);
      if (!v || seen.has(v.url)) continue;
      seen.add(v.url);
      variants.push(v);
    }
    if (!variants.length) return null;
    variants.sort((a, b) => variantScore(b) - variantScore(a));
    const best = variants[0];
    const animated = typeRaw === 'animated_gif' || typeRaw === 'gif';
    return {
      key: entity.media_key || mediaIdFromUrl(best.url) || best.url,
      mediaId: String(entity.id_str || entity.id || mediaIdFromUrl(best.url) || index),
      type: animated ? 'gif' : 'video',
      url: best.url,
      variants,
      ext: 'mp4',
      tweetId,
      handle,
      index,
      thumb: photoRaw || '',
      width: best.width || 0,
      height: best.height || 0,
      bitrate: best.bitrate || 0,
      durationMs: Number(entity?.video_info?.duration_millis || entity?.media_info?.duration_millis || entity.duration_millis) || 0
    };
  }

  function handleFromNode(node) {
    return (
      node?.core?.user_results?.result?.legacy?.screen_name ||
      node?.core?.user_results?.result?.core?.screen_name ||
      node?.user?.screen_name ||
      node?.legacy?.user?.screen_name ||
      node?.author?.legacy?.screen_name ||
      'x'
    );
  }

  function tweetIdFromNode(node) {
    const legacy = node?.legacy;
    return numericId(node?.rest_id) || numericId(legacy?.id_str) || numericId(node?.id_str) || numericId(node?.tweet_id) || null;
  }

  function mediaArrays(node) {
    const candidates = [
      node?.legacy?.extended_entities?.media,
      node?.legacy?.entities?.media,
      node?.extended_entities?.media,
      node?.entities?.media,
      node?.article?.article_results?.result?.media_entities,
      node?.article_results?.result?.media_entities,
      node?.note_tweet?.note_tweet_results?.result?.media?.media_entities,
      node?.note_tweet_results?.result?.media?.media_entities,
      node?.media_entities
    ];
    const out = [];
    const seen = new WeakSet();
    for (const c of candidates) {
      if (!c) continue;
      const arr = Array.isArray(c) ? c : (isObject(c) ? Object.values(c) : []);
      if (!Array.isArray(arr) || seen.has(arr)) continue;
      seen.add(arr);
      out.push(arr.filter(isObject));
    }
    return out;
  }

  function mergeRecord(existing, incoming) {
    if (!existing) return incoming;
    if (existing.type === 'photo') return existing;
    const all = [...(existing.variants || []), ...(incoming.variants || [])];
    const map = new Map();
    for (const v of all) {
      const n = normalizeVideoVariant(v);
      if (!n) continue;
      const old = map.get(n.url);
      if (!old || variantScore(n) > variantScore(old)) map.set(n.url, n);
    }
    const variants = [...map.values()].sort((a, b) => variantScore(b) - variantScore(a));
    const best = variants[0] || existing;
    return {
      ...existing,
      ...incoming,
      variants,
      url: best.url || incoming.url || existing.url,
      width: best.width || incoming.width || existing.width || 0,
      height: best.height || incoming.height || existing.height || 0,
      bitrate: best.bitrate || incoming.bitrate || existing.bitrate || 0,
      thumb: existing.thumb || incoming.thumb || '',
      type: existing.type === 'gif' || incoming.type === 'gif' ? 'gif' : 'video'
    };
  }

  function collectMedia(rootJson) {
    const byKey = new Map();
    const seenObjects = new WeakSet();
    const stack = [{ value: rootJson, depth: 0, context: null }];
    let visited = 0;

    while (stack.length && visited++ < MAX_WALK_NODES) {
      const { value, depth, context } = stack.pop();
      if (!isObject(value) || depth > MAX_DEPTH || seenObjects.has(value)) continue;
      seenObjects.add(value);

      const ownTweetId = tweetIdFromNode(value);
      const ownContext = ownTweetId ? { tweetId: ownTweetId, handle: handleFromNode(value) } : context;
      const arrays = mediaArrays(value);
      if (arrays.length && ownContext?.tweetId) {
        let index = 1;
        for (const arr of arrays) {
          for (const entity of arr) {
            const rec = normalizeMediaEntity(entity, ownContext, index++);
            if (!rec) continue;
            const key = `${rec.tweetId}:${rec.key}`;
            byKey.set(key, mergeRecord(byKey.get(key), rec));
          }
        }
      }

      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) stack.push({ value: value[i], depth: depth + 1, context: ownContext });
      } else {
        for (const k of Object.keys(value)) {
          const child = value[k];
          if (isObject(child)) stack.push({ value: child, depth: depth + 1, context: ownContext });
        }
      }
    }
    return [...byKey.values()].sort((a, b) => String(a.tweetId).localeCompare(String(b.tweetId)) || (a.index || 0) - (b.index || 0));
  }

  function qualityLabel(rec) {
    if (!rec) return 'Original';
    if (rec.type === 'photo') return rec.width && rec.height ? `${rec.width}×${rec.height}` : 'Original';
    if (rec.width && rec.height) return `${rec.width}×${rec.height}`;
    if (rec.bitrate) return `${Math.round(rec.bitrate / 1000)} kbps`;
    return 'Best available';
  }

  const api = Object.freeze({
    VIDEO_HOST,
    numericId,
    safeUrl,
    dimensionsFromUrl,
    normalizeVideoVariant,
    chooseBestVariant,
    originalPhotoUrl,
    fileExt,
    mediaIdFromUrl,
    mediaKey,
    normalizeMediaEntity,
    collectMedia,
    qualityLabel,
    variantScore
  });

  root.MediaForgeX = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
