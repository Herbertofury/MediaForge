# Releases

## 0.4.1 — Instant real content first

- Two-phase instant-content -> lossless-deep-scan architecture.
- X tweet/article media priority path.
- Stronger X post-media vs avatar/sports/sidebar/site-chrome classification.
- Priority-aware Best Content page-order sorting.
- Fixed duplicated Shadow DOM root registration.
- Per-tab deep-scan single-flight.
- `npm run perf:first`: 548.06x faster modeled time-to-first-useful-X-media on the release workload, with first-result parity.
- 23/23 automated tests passing.

## 0.4.0

- Smart local content classifier and quick filter chips with zero record deletion.
- Default Best-content view plus explicit All/Photos/Video/Audio/Ads/UI views.
- Provider-aware YouTube, Spotify, SoundCloud, and Bandcamp page records.
- JSON-LD media discovery and broader audio/resource-hint detection.
- Long-video GIF corruption fix using decoded-frame synchronization after seeks.
- Accurate long-run GIF centisecond timing, exact duplicate-frame folding, chunked encoder output, and 256-color stable dithering.
- Removed the former 5,000-frame GIF limit; oversized outputs fail safely before the browser-safe boundary instead of saving a corrupt partial file.
- Smart classifier results are cached per record; 30k-record benchmark measured 173.5x faster repeated filtering versus recomputing classification.
- 20 automated tests plus static validation.


## 0.3.1

- Prioritized background deep snapshots.
- Pre-indexed side-panel search/sort fields.
- One filter-state snapshot per render.
- Reused filename collator and O(1) selection lookup.
- Background metadata scheduling and coalesced tab reload scans.
- 20,000-record parity benchmark: 14.38x faster / 93.05% lower median CPU time on the release environment.
- 16 automated tests.

## 0.3.0

Performance/architecture release focused on keeping deep discovery complete while removing avoidable browser and panel work.

Highlights:

- on-demand cooperative async deep snapshots;
- Prioritized Task Scheduling feature detection;
- dirty-article X mutation processing;
- cooperative cached open-Shadow-DOM discovery;
- cached stylesheet media extraction;
- PerformanceObserver resource cache;
- virtualized 72-card side-panel batches;
- near-viewport thumbnail activation;
- coalesced search/filter rendering;
- metadata single-flight de-duplication;
- browser-cache-friendly HEAD/Range metadata probes;
- deterministic performance workload contract test.

## 0.2.0

Bulk downloader/search/sort/filter/ZIP/deep-discovery release.

## 0.1.0

Initial MediaForge GX extension with X best-quality media, Picviewer bridge, viewer, Opera/Chromium panel, and local GIF conversion.
