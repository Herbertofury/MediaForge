# Changelog

## 0.4.1 - 2026-10-01

- Added a two-phase **instant content lane -> lossless deep scan** pipeline. The side panel now asks the top frame for semantic/visible media first, paints it, then starts the all-frame/style/network/Shadow-DOM deep scan.
- X/Twitter instant discovery now scans currently mounted tweet articles and already-captured X API media directly, so post images/video appear before site chrome, sports widgets, avatars, or stylesheet assets.
- Added X-specific semantic hints for post media, avatars, sidebar/navigation chrome, promoted placements, viewport visibility, and content priority.
- Hardened Best Content classification for `pbs.twimg.com/media`, `video.twimg.com`, profile images, `ton.twimg.com` sports/product assets, and `abs.twimg.com` UI assets.
- Best Content + Page Position now prioritizes actual semantic content and nearby viewport media while preserving page order inside each priority tier.
- Fixed a duplicate open-Shadow-DOM registration bug that could make deep scans traverse the same shadow root twice.
- Added per-tab deep-scan single-flight so overlapping panel/navigation refreshes reuse the same all-frame scan instead of duplicating it.
- Restricted X original-photo URL rewriting to real `/media/` photo resources instead of rewriting unrelated `pbs.twimg.com` profile assets.
- Added a parity-checked time-to-first-useful-X-media benchmark. On the release environment the staged instant lane measured **548.06x faster / 99.82% less pre-first-content CPU time** than the synthetic old full-deep-before-render path, while returning the identical first post-media URL. This is a deterministic microbenchmark, not a universal browser-wall-clock claim.
- Existing 20,000-record side-panel parity benchmark remains **16.49x faster / 93.94% less CPU time** than its baseline; 30,000-record cached smart classification remains **274.25x faster / 99.64% less CPU time** in this release environment.
- Automated suite expanded to **23/23 passing** plus manifest/security/static validation.

## 0.4.0 - 2026-10-01

- Added cached smart media classification and quick Best/All/Photos/Video/Audio/Ads/UI filters with no record deletion.
- Added provider-aware YouTube, Spotify, SoundCloud, and Bandcamp semantic records plus JSON-LD/resource-hint media discovery.
- Expanded direct audio format support.
- Fixed long-video GIF corruption by waiting for compositor-delivered decoded frames after seeks.
- Added exact long-run GIF centisecond timing, exact duplicate-frame folding, chunked encoder output, and stable 256-color ordered dithering.
- Removed the old 5,000-frame conversion cap; fail-safe output boundary prevents partial/corrupt giant GIFs.
- Prioritized complete metadata probing so likely content resolves before page chrome.
- Added 30k-record smart-filter benchmark (173.5x faster cached repeated filtering in release environment) and long-GIF regression tests.
- Automated test count: 20.


## 0.3.1 - 2026-10-01

- Moved complete deep snapshots into Chromium Prioritized Task Scheduling background tasks so every `scheduler.yield()` continuation inherits background priority instead of competing with page input/rendering.
- Added precomputed per-record search text, lowercase search text, host, filename, and pixel-count fields so repeated search/filter/sort passes stop reparsing URLs and rebuilding strings.
- Snapshot filter controls once per render instead of querying panel DOM controls for every media record.
- Reused one `Intl.Collator` for filename sorting instead of constructing locale collation work inside every comparator call.
- Switched selected-record lookup to the existing O(1) record map rather than rescanning the full media array.
- Scheduled automatic metadata enrichment as background work after first paint unless the active sort needs metadata immediately.
- Coalesced tab update reloads to avoid duplicate scans during navigation bursts.
- Added a parity-checked 20,000-record CPU benchmark. On the release build environment, median search/filter/name-sort time fell from 951.204 ms to 66.130 ms: **14.38x faster / 93.05% less CPU time**, with identical result count and checksum.
- Added two regression tests for the new side-panel fast path; total automated tests increased from 14 to 16.

## 0.3.0 - 2026-10-01

- Reworked deep discovery into a cooperative async snapshot that yields to Chromium between chunks.
- Removed generic-page eager deep-scan warmup and full-page MutationObserver; generic deep discovery now runs only when the panel asks for it.
- Added feature-detected Prioritized Task Scheduling (`scheduler.yield` / `scheduler.postTask`) with idle/timer fallbacks.
- Replaced X's mutation-time whole-document article sweep with dirty/new-article targeting.
- Replaced seven core DOM media selector passes per root with one union-selector collection pass.
- Made open Shadow DOM discovery incremental/cooperative instead of repeatedly allocating full-page `querySelectorAll('*')` results.
- Added a buffered `PerformanceObserver` resource cache and stylesheet-media cache with targeted invalidation.
- Virtualized the side panel into 72-card batches while preserving full logical selection/filter/sort coverage.
- Added near-viewport thumbnail activation with `IntersectionObserver`.
- Added CSS layout/paint/style containment on media cards alongside `content-visibility:auto`.
- Coalesced UI renders into animation frames and debounced search input.
- Added metadata single-flight de-duplication and browser-cache-friendly HEAD/Range probes.
- Added an O(1) record-id lookup map for per-card actions.
- Added `npm run perf:model` plus a performance-contract test. Reference workload reductions: 99.58% fewer repeated X article inspections, 96.40% fewer initial card constructions for a 2,000-item gallery, and 85.71% fewer core selector passes per root.
- Added a full GitHub Wiki source set and repository documentation mirror.
- Expanded automated tests from 13 to 14.

## 0.2.0 - 2026-10-01

- Rebuilt the Opera GX side-panel media library around bulk-downloader workflows.
- Added instant text search and `/regex/flags` matching across media metadata.
- Added sorting by page position, real file size, megapixels, width, height, type, filename, and URL.
- Added preset and custom file-size / dimension filters, orientation filters, same-host filtering, and unknown-metadata filtering.
- Added persistent multi-selection, select-visible, invert, clear, selected byte totals, and compact/list layouts.
- Added local ZIP export, URL copying, JSON manifest export, and Google Lens reverse-image action.
- Added batched HEAD + byte-range metadata probing with short-lived caching for accurate file-size display/sorting.
- Added deep all-frame media discovery with MV3 scripting, open Shadow DOM traversal, lazy/original image attributes, srcset/picture candidates, linked media, CSS/stylesheet assets, page metadata, Resource Timing media, SVG images, video posters, audio, and iframe aggregation.
- Added page-scoped blob/data media handling and preserved X best-quality/original behavior.
- Added a local ZIP32 writer with CRC32 plus integrity tests.
- Performance pass: deep scan runs on demand; stylesheet/resource inspection replaces a full-page computed-style sweep; media cards use `content-visibility` and lazy thumbnail decoding.
- Expanded automated tests from 8 to 13 before final QA.

## 0.1.0 - 2026-10-01

- Initial MediaForge GX extension.
- Best-quality X MP4 rendition selection by resolution, then bitrate.
- Original X photo downloads.
- X animated-GIF detection with MP4 or real GIF export.
- Local GIF89a conversion with adaptive per-frame palette.
- X inline download/GIF buttons.
- Picviewer CE+ toolbar bridge.
- Generic hover media toolbar and fullscreen viewer.
- Opera GX / Chromium side panel with bulk downloads and settings.
- Automated parser, filename, GIF-core, syntax, permission, and manifest checks.
