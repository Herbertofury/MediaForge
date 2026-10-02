'use strict';

(function initMediaClassifier(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MediaForgeClassifier = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function factory() {
  const PROMO_RE = /(?:^|[\W_])(ad|ads|advert|advertisement|advertising|banner|campaign|commercial|deal|discount|offer|promo|promoted|promotion|sponsor|sponsored|sale|shop|store|upsell)(?:$|[\W_])/i;
  const TRACKER_RE = /(?:beacon|pixel|track(?:er|ing)|analytics|doubleclick|googlesyndication|adservice|collect|telemetry|spacer|transparent[-_ ]?pixel)/i;
  const ICON_RE = /(?:favicon|icon|glyph|sprite|logo|badge|button|caret|chevron|arrow|spinner|loader|loading|skeleton|placeholder|thumb(?:nail)?)/i;
  const EMOJI_RE = /(?:emoji|emote|sticker|reaction|twemoji|emoji-data)/i;
  const AVATAR_RE = /(?:avatar|profile[-_ ]?(?:pic|photo|image)?|userpic|pfp|headshot)/i;
  const CONTENT_RE = /(?:original|orig|full(?:size)?|highres|hires|hero|gallery|photo|image|wallpaper|artwork|poster|cover|episode|track|video|movie|media)/i;
  const STREAM_FRAGMENT_RE = /(?:\.m4s(?:$|[?#])|\.ts(?:$|[?#])|(?:[?&](?:range|sq|rn|rbuf|clen|dur)=)|\/segment(?:s)?\/|\/chunk(?:s)?\/|\/frag(?:ment)?(?:\/|\?|$))/i;
  const X_POST_MEDIA_RE = /(?:pbs\.twimg\.com\/media\/|video\.twimg\.com\/(?:ext_tw_video|amplify_video|tweet_video|dm_video))/i;
  const X_AVATAR_RE = /pbs\.twimg\.com\/(?:profile_images|profile_banners)\//i;
  const X_CHROME_RE = /(?:(?:abs|ton)\.twimg\.com\/|\/twitter-assets\/|\/sports-product\/|\/brand_assets?\/)/i;

  function safeUrl(raw) {
    try { return new URL(String(raw || '')); } catch (_) { return null; }
  }

  function providerForHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host.endsWith('.googlevideo.com') || host.endsWith('.ytimg.com')) return 'youtube';
    if (host === 'spotify.com' || host.endsWith('.spotify.com') || host.endsWith('.scdn.co') || host.endsWith('.spotifycdn.com')) return 'spotify';
    if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com') || host.endsWith('.sndcdn.com')) return 'soundcloud';
    if (host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) return 'bandcamp';
    if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com') || host.endsWith('.twimg.com')) return 'x';
    return host ? 'web' : 'local';
  }

  function combinedText(rec) {
    return [
      rec?.filename, rec?.url, rec?.title, rec?.alt, rec?.source,
      ...(Array.isArray(rec?.sources) ? rec.sources : []), rec?.context,
      rec?.mime, rec?.ext, rec?.handle, rec?.hostname
    ].filter(Boolean).join(' ');
  }

  function classifyMediaRecord(rec, page = {}) {
    const url = safeUrl(rec?.url);
    const host = rec?.hostname || url?.hostname || page?.hostname || '';
    const provider = rec?.provider || providerForHost(host);
    const text = combinedText(rec);
    const w = Number(rec?.width) || 0;
    const h = Number(rec?.height) || 0;
    const rw = Number(rec?.renderedWidth) || 0;
    const rh = Number(rec?.renderedHeight) || 0;
    const area = w * h;
    const renderedArea = rw * rh;
    const size = Number(rec?.sizeBytes) || 0;
    const flags = new Set();
    const reasons = [];
    let score = 0;

    const add = (flag, delta, reason) => {
      flags.add(flag);
      score += delta;
      if (reason) reasons.push(reason);
    };

    if (rec?.type === 'video') add('motion', 55, 'video');
    if (rec?.type === 'audio') add('audio', 55, 'audio');
    if (rec?.type === 'gif') add('motion', 40, 'animation');
    if (rec?.original) add('original', 30, 'original-resolution candidate');
    if (/^(?:x-api|metadata|jsonld|provider:)/i.test(String(rec?.source || ''))) add('semantic-source', 18, 'semantic page metadata');
    if (CONTENT_RE.test(text)) add('content-term', 10, 'content-like naming');

    if (w >= 1280 || h >= 1280 || area >= 1_000_000) add('large', 30, 'large dimensions');
    else if (w >= 640 || h >= 640 || area >= 300_000) add('medium-large', 18, 'content-sized dimensions');
    else if (w && h && area < 4096) add('tiny', -38, 'tiny dimensions');
    else if (w && h && area < 16_384) add('small-ui', -22, 'small dimensions');

    if (renderedArea && renderedArea < 2304) add('rendered-tiny', -16, 'rendered very small');
    if (size && size < 1024) add('tiny-file', -42, 'sub-1KB file');
    else if (size && size < 8192) add('tiny-file', -18, 'very small file');

    if (TRACKER_RE.test(text)) add('tracker', -120, 'tracking/beacon naming');
    if (EMOJI_RE.test(text)) add('emoji', -75, 'emoji/emote naming');
    if (AVATAR_RE.test(text)) add('avatar', -38, 'avatar/profile naming');
    if (ICON_RE.test(text)) add('ui', -48, 'UI/icon naming');
    if (PROMO_RE.test(text)) add('promo', -35, 'promotional/advertising naming');

    if (w && h) {
      const ratio = Math.max(w / h, h / w);
      if (ratio >= 5 && PROMO_RE.test(text)) add('promo', -28, 'banner-like aspect ratio');
      if (w <= 96 && h <= 96) add('ui', -24, 'icon-sized dimensions');
      if (w <= 2 && h <= 2) add('tracker', -120, 'tracking-pixel dimensions');
      if (w >= 240 && h >= 180 && ratio < 4) add('content-shape', 16, 'content-like shape');
    }

    const rawUrl = String(rec?.url || '');
    const semanticRegion = String(rec?.semanticRegion || '');
    const explicitPriority = Number(rec?.contentPriority) || 0;
    if (explicitPriority >= 1000) add('priority-content', 45, 'priority content lane');
    else if (explicitPriority >= 500) add('priority-content', 18, 'semantic content region');

    if (provider === 'x') {
      if (rec?.xPostMedia || X_POST_MEDIA_RE.test(rawUrl)) add('x-post-media', 95, 'X post media');
      if (rec?.xAvatar || X_AVATAR_RE.test(rawUrl)) add('avatar', -92, 'X profile/avatar asset');
      if (rec?.xSiteChrome || X_CHROME_RE.test(rawUrl)) add('ui', -96, 'X site chrome / product asset');
      if (semanticRegion === 'sidebar' || semanticRegion === 'nav') add('ui', -68, `X ${semanticRegion} chrome`);
      if (rec?.promoted) add('promo', -72, 'promoted placement');
    }

    if (STREAM_FRAGMENT_RE.test(rawUrl) || (provider === 'youtube' && /googlevideo\.com/i.test(rawUrl) && /(?:[?&]range=|[?&]sq=)/i.test(rawUrl))) {
      add('stream-fragment', -95, 'adaptive-stream fragment');
    }

    if (rec?.streamingPage || rec?.nonDownloadable) add('stream-page', 12, 'streaming page media');
    if (provider === 'youtube' && rec?.type === 'video') add('provider-content', 25, 'YouTube video');
    if (provider === 'spotify' && rec?.type === 'audio') add('provider-content', 25, 'Spotify audio');
    if ((provider === 'soundcloud' || provider === 'bandcamp') && rec?.type === 'audio') add('provider-content', 22, 'audio platform media');
    if (provider === 'x' && ['photo','gif','video'].includes(rec?.type) && (rec?.xPostMedia || X_POST_MEDIA_RE.test(rawUrl) || rec?.inArticle)) add('provider-content', 28, 'X post/article media');

    let bucket = 'content';
    if (flags.has('tracker')) bucket = 'tracker';
    else if (flags.has('stream-fragment')) bucket = 'stream-fragment';
    else if (flags.has('emoji')) bucket = 'emoji';
    else if (flags.has('avatar') && score < 35) bucket = 'avatar';
    else if (flags.has('ui') && score < 30) bucket = 'ui';
    else if (flags.has('promo') && score < 45) bucket = 'promo';
    else if ((flags.has('tiny') || flags.has('rendered-tiny') || flags.has('tiny-file')) && score < 20) bucket = 'tiny';

    const likelyContent = bucket === 'content' && score >= -5;
    return {
      bucket,
      score,
      likelyContent,
      provider,
      flags: [...flags],
      reasons
    };
  }

  function quickFilterPass(rec, mode) {
    const bucket = rec?._class?.bucket || 'content';
    switch (mode) {
      case 'smart': return Boolean(rec?._class?.likelyContent);
      case 'photos': return rec?.type === 'photo' || rec?.type === 'gif' || rec?.type === 'svg';
      case 'video': return rec?.type === 'video' || rec?.type === 'gif';
      case 'audio': return rec?.type === 'audio';
      case 'promo': return bucket === 'promo';
      case 'ui': return ['ui','tiny','avatar','emoji','tracker','stream-fragment'].includes(bucket);
      default: return true;
    }
  }

  function bucketLabel(bucket) {
    const map = {
      content: 'CONTENT', promo: 'PROMO', ui: 'UI', tiny: 'TINY', avatar: 'AVATAR', emoji: 'EMOJI', tracker: 'TRACKER', 'stream-fragment': 'STREAM PART'
    };
    return map[bucket] || String(bucket || 'MEDIA').toUpperCase();
  }

  return { classifyMediaRecord, quickFilterPass, bucketLabel, providerForHost };
});
