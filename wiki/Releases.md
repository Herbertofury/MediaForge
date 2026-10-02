# Releases

## 0.4.0 — Smart content + long-GIF reliability

- Best-content classifier with one-click **All / Photos / Video / Audio / Ads-promos / UI-tiny** views.
- Complete records preserved; filtering is non-destructive.
- Provider-aware YouTube, Spotify, SoundCloud, and Bandcamp records.
- Direct MP3/M4A/AAC/OGG/Opus/WAV/FLAC discovery.
- Long-video GIF frame synchronization via compositor-delivered frames when available.
- Exact cumulative GIF centisecond timing.
- 256-color maximum-quality mode with stable ordered dithering.
- Exact duplicate-frame folding.
- Chunked GIF output instead of repeated giant contiguous-buffer growth.
- Explicit large-output safety boundary instead of knowingly writing partial GIFs.
- Cached smart classification benchmark: **225.2x faster / 99.56% less CPU time** on the 30,000-record parity workload in the release environment.
- Existing 20,000-record panel hot path remains **16.14x faster / 93.80% less CPU time** than its baseline on the current release environment.
- Automated suite: **20/20 passing** plus manifest/security/static validation.

## 0.3.x — Zero-lag architecture

Introduced cooperative/background deep scans, dirty-article X updates, one union-selector core pass, cached stylesheet/resource discovery, side-panel virtualization, near-viewport thumbnail activation, render coalescing, metadata single-flight, and cached/pre-indexed panel fields.

## 0.2.0 — Bulk media library

Added advanced search/sort/filtering, real file-size metadata, dimension filters, bulk selection, ZIP/URL/JSON actions, cross-frame and Shadow DOM discovery.

## 0.1.0 — Initial release

Best-quality X media, original X photos, real GIF conversion, Picviewer bridge, generic hover tools/viewer, and Opera GX/Chromium side panel.
