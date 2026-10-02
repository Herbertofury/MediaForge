# Smart Content Filtering

Media-heavy pages often contain more chrome than content: favicons, emoji sheets, avatars, tiny loading art, 1x1 trackers, ad creatives, promotional banners, thumbnails, stream fragments, and decorative CSS assets. MediaForge GX **never deletes those records**; it classifies them locally and gives you one-click views that surface the media people usually came for.

## Quick filters

- **Best content** — default. Keeps likely photos, artwork, video, animation, and audio while hiding probable page chrome/junk.
- **All** — the complete lossless scan.
- **Photos / Video / Audio** — instant media-type views.
- **Ads / promos** — isolates likely campaign, sponsored, sale, and banner assets.
- **UI / tiny** — icons, emoji, avatars, loading/skeleton assets, trackers, and adaptive-stream fragments.

## How classification works

The classifier runs once when a record is prepared and caches its result. It combines dimensions, rendered dimensions, byte size, filename/URL/source text, provider, aspect ratio, original-resolution hints, and known naming patterns. It favors semantic sources such as page metadata, JSON-LD, X API media, and large/original assets.

This is a ranking/filtering system, not deletion. A false positive can always be recovered immediately by switching to **All**.

## Performance design

Classification is precomputed rather than rerun on every keystroke/filter change. The `npm run perf:smart` benchmark uses 30,000 media records and parity-checks cached filtering against recomputing the same classifier every pass.


## X-specific classification

0.4.1 treats `pbs.twimg.com/media/*` and `video.twimg.com/*` post media as high-priority content, while profile images, `ton.twimg.com` sports/product assets, `abs.twimg.com` UI assets, sidebar/navigation chrome, trackers, and promoted placements are demoted from Best Content. Nothing is deleted; switch to **All** to see the full lossless scan.
