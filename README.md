# MediaForge GX

A local-first Opera GX / Chromium media toolkit for **deep current-page media discovery**, **high-speed bulk selection/filtering**, **best-quality X.com downloads**, **real GIF export**, **ZIP packaging**, and **Picviewer CE+ integration**.

## 0.4.0 highlights — smart content + long-GIF reliability


MediaForge GX 0.4 keeps the complete 0.3.1 discovery/downloader feature set and adds local content intelligence, first-class audio/provider awareness, and a rebuilt long-video GIF path while preserving the no-lag architecture:

- on-demand cooperative deep snapshots with `scheduler.yield()` when available and safe fallbacks elsewhere;
- dirty-article X updates instead of full-article rescans on every mutation;
- one union-selector DOM collection pass per root for the core media sources;
- cooperative, cached open-Shadow-DOM discovery;
- cached stylesheet extraction and `PerformanceObserver` resource capture;
- 72-card side-panel virtualization plus near-viewport thumbnail activation;
- animation-frame-coalesced UI rerenders and debounced search;
- metadata request single-flight + TTL caching;
- a checked-in workload performance contract (`npm run perf:model`);
- pre-indexed search/sort fields and one filter-state snapshot per render (`npm run perf:ui`).
- **Best content** quick filtering that hides probable ads/promos, trackers, icons, emoji, avatars, loading art, and stream fragments without deleting them; **All** always restores the complete scan.
- YouTube / Spotify / SoundCloud / Bandcamp provider-aware semantic records, plus direct MP3/M4A/AAC/OGG/Opus/WAV/FLAC discovery.
- long-video GIF capture synchronized with decoded compositor frames, exact cumulative centisecond timing, 256-color local palettes, ordered dithering, duplicate-frame folding, and chunked output storage.

The full documentation lives in the [GitHub Wiki](https://github.com/Herbertofury/MediaForge/wiki), with a source mirror under `wiki/`.

## 0.2 bulk-media feature set retained

The side panel is built around the strongest workflows used by modern bulk image downloaders, while keeping MediaForge GX's video/X/GIF features:

- **Instant search** across filename, URL, title, type, extension, source, host, and MIME. Enter `/pattern/i` for regex matching.
- **Sort by actual file size**, page position, megapixels, width, height, type, filename, or URL.
- **File-size filters** from tiny assets through 20 MB+, plus custom min/max MB.
- **Dimension filters** for 512/1024/2048 px, 4 MP+, portrait, landscape, square-ish, and custom width/height bounds.
- **Type filters** for photos, GIF/animation, video, audio, SVG, or all images.
- **Same-host and unknown-metadata filters** for cleanup-heavy pages.
- **Select visible / invert / clear / master select** with selected count and known aggregate byte size.
- **Bulk direct download**, **Save As per item**, **ZIP selected**, **Copy selected original URLs**, and **JSON manifest export**.
- **List / compact layout toggle** and position-preserving selection while searching, sorting, and filtering.
- **Per-item metadata chips** for byte size, resolution/megapixels, file type, source, and original-resolution status.
- **Reverse image lookup** through Google Lens for HTTP(S) image records.
- **Automatic size probing** using HEAD first, then a one-byte Range fallback; results are short-lived cached so re-sorting does not repeatedly hit the same media URL.

## Deep media discovery

Opening the side panel now runs a deliberately broad current-page scan. MediaForge GX combines results across accessible page frames and de-duplicates them without throwing away richer metadata.

Detected sources include:

- rendered `<img>` resources and natural dimensions;
- current/best `srcset` and `<picture><source>` candidates;
- common lazy/original attributes such as `data-original`, `data-full-src`, `data-zoom-image`, `data-hires`, and `data-src`;
- direct image/video/audio links;
- `<video>` / `<audio>` sources and video posters;
- inline and linked SVG image resources;
- inline CSS `url(...)` assets;
- accessible stylesheet image URLs, including pseudo-element/background rules without forcing expensive `getComputedStyle()` across every page node;
- Resource Timing entries for loaded image/video/audio assets, including extensionless CDN URLs when the browser identifies their initiator type;
- Open Graph / Twitter image, video, and audio metadata;
- open Shadow DOM trees;
- cross-origin iframes through MV3 `scripting` execution in every accessible frame;
- X/Twitter media records captured from the page's own API responses.

Generic pages do **no eager deep scan and run no full-page MutationObserver**. Deep discovery starts when the side panel requests a snapshot; X retains only its targeted dirty-article observer for inline controls.

## X / Twitter quality path

- **Video:** watches media metadata X already fetches, keeps direct MP4 renditions, and selects by **resolution first, then bitrate**.
- **Animated GIFs:** X normally serves them as MP4; save the best MP4 or convert it locally into a real `.gif`.
- **Photos:** upgrades `pbs.twimg.com` resources to `name=orig`.
- **Inline action buttons:** best/original download plus contextual GIF export in X post action rows.

X commonly renders playback through `blob:` URLs, so MediaForge GX uses a split MV3 architecture:

```text
X MAIN world
  x-interceptor.js -> x-media.js
       -> same-origin postMessage
ISOLATED content.js
       -> post buttons / hover tools / viewer
       -> frame snapshot for the side panel
background.js
       -> scan aggregation / metadata probes / downloads / jobs
```

No X API key, bearer token, scraping service, or remote conversion server is required.

## Picviewer CE+ integration

The supplied Picviewer CE+ userscript already owns a strong image hover/view workflow. MediaForge GX detects its `#pv-float-bar-container` and appends only the missing `GX↓` and contextual `GIF` controls when the bridge is enabled. Picviewer's own controls are left intact.

Without Picviewer, MediaForge GX supplies its own hover toolbar and fullscreen viewer with gallery navigation, wheel zoom, fit/1:1, rotate, flip, video controls, download, copy URL, and GIF export.

## ZIP packaging

`ZIP selected` is local. The extension fetches the selected direct media URLs in a hidden extension tab, writes a standards-compatible stored ZIP, starts the browser download, and closes the worker tab. Nothing is uploaded.

The current ZIP writer uses the classic ZIP32 format: individual files and archive offsets must remain below the classic 4 GiB boundary. Normal image/media batches are well inside that range; the worker fails explicitly rather than silently corrupting an oversized archive.

Page-scoped `blob:` resources can be downloaded from the owning frame, but they cannot be reliably refetched by the ZIP worker after leaving that renderer context, so those records are excluded from ZIP jobs.

## Install in Opera GX

1. Extract the **OperaGX** ZIP to a permanent folder.
2. Open `opera://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
5. Reload already-open pages so the all-frame content script is present.
6. Pin **MediaForge GX** in Opera's extensions/sidebar UI if desired.

For Chrome, Edge, Brave, or other Chromium browsers, use the **Chromium** ZIP and that browser's extensions page.

## Permissions

- `downloads` — direct files, GIFs, ZIPs, and JSON manifests.
- `storage` — preferences and short-lived conversion/archive jobs.
- `tabs` — active-tab communication and local worker tabs.
- `sidePanel` — Chromium MV3 side-panel support.
- `scripting` — one user-requested deep scan across accessible frames so iframe media is not silently missed.
- `<all_urls>` host access — generic page media discovery, metadata probing, thumbnails, and user-requested local fetch/conversion.

There is no analytics SDK and no remote JavaScript.

## Performance design

0.4 preserves complete discovery while cutting work on the browser-critical paths. Deep snapshots are cooperative and async; Chromium waits for the returned Promise when `chrome.scripting.executeScript()` runs the snapshot. X mutations target only dirty/new articles. Open Shadow DOM discovery is cooperative, cached, and deferred until a deep snapshot needs it. Resource Timing is accumulated through `PerformanceObserver` instead of re-enumerated on every scan, and stylesheet media is cached until style nodes change.

The side panel keeps the complete logical result set but materializes cards in 72-item viewport batches. Thumbnail requests are activated only near the viewport. Cards combine `content-visibility:auto`, CSS containment, and intrinsic-size hints. Search/filter rerenders are coalesced, and metadata requests are TTL cached and single-flight protected.

`npm run perf:model` records deterministic structural workload reductions, while `npm run perf:ui` parity-checks a 20,000-record search/filter/sort workload. On the current release environment the optimized UI path measured 16.14x faster (948.642 ms → 58.769 ms median, 93.80% less CPU) with identical result count/checksum. See `docs/PERFORMANCE.md` or the wiki for details.

## Development / QA

The shipped extension has no npm runtime dependencies. Node.js is used only for tests/validation.

```bash
npm test
npm run check
npm run qa
```

The test suite covers X media selection, original photo upgrading, filename safety, data-URL sizing, duplicate metadata merging, GIF output, CRC32, and ZIP structure. The validator checks manifests, cross-frame requirements, file references, syntax, permission allowlisting, and blocks `eval`, `new Function`, and remote script tags.

## Project layout

```text
manifest.json
manifest.opera-gx.json
manifest.chromium.json
src/
  background.js       downloads, all-frame scan aggregation, metadata probes, jobs
  content.js          deep frame snapshot, hover UI, viewer, X/Picviewer integration
  content.css         injected page UI
  x-interceptor.js    MAIN-world X response observer
  x-media.js          X parser and best-rendition selection
  quantize.mjs        local GIF palette quantizer + stable ordered dithering
  gif-utils.mjs       exact GIF timing / quality helpers
  media-classifier.js smart content-vs-junk scoring
  zip-core.js         local ZIP32 writer + CRC32
sidepanel.html/.css/.js
converter.html/.js    local MP4 -> GIF worker
zipper.html/.js       local selected-media -> ZIP worker
vendor/gifenc/
icons/
tests/
tools/
```

## Challenger/reference scan

Before this pass, the workflow was compared against the documented feature sets of common bulk image downloaders, especially Imageye, Fatkun, and Download All Images, plus the public `belaviyo/save-images` implementation. The features brought into MediaForge GX include size/dimension/URL filtering, selective bulk actions, position sorting, ZIP export, deep CSS/lazy/iframe extraction, original-resource recovery, and metadata inspection. MediaForge GX then keeps its broader scope: video/audio, X-specific quality recovery, real GIF conversion, Picviewer coexistence, cross-frame aggregation, Shadow DOM, JSON export, and Opera GX side-panel workflow.

Public code/reference projects inspected:

- `https://github.com/amitkma/x-media-downloader`
- `https://github.com/Sato-Isolated/x-video-download`
- `https://github.com/belaviyo/save-images`
- `https://github.com/hoothin/UserScripts`
- `https://github.com/mattdesl/gifenc`

See `THIRD_PARTY_NOTICES.md` for licensing notes.

## Limitations worth knowing

- Metadata probing depends on what the origin allows. If HEAD and byte-range metadata are unavailable, the record remains visible with `Size ?` rather than being silently dropped.
- Browser-internal pages such as `chrome://` / `opera://` do not allow normal extension page injection.
- X can change its GraphQL/media shapes or DOM. Parser and UI failures are isolated so they do not break the site.
- Generic adaptive-streaming `blob:` video cannot always be reconstructed into a single source file. X is handled separately through its response metadata.
- Local GIF conversion is compute-heavy for long 4K sources. 0.4 removes the old 5,000-frame cap, folds exact duplicate frames, uses chunked output, and fails explicitly before the browser-safe 3.75 GiB output boundary rather than knowingly saving a partial/corrupt GIF.

## License

MediaForge GX is MIT-licensed. Third-party portions retain their original notices.