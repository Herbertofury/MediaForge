# Troubleshooting

## A page shows fewer media items than expected

1. Press **Refresh** in the MediaForge panel.
2. Scroll/load lazy content that has not entered the page yet.
3. Expand carousels/galleries if the site only creates media elements on demand.
4. Reload a page that was open before installing/updating the extension.
5. Remember that closed Shadow DOM and browser-internal pages cannot be introspected like normal page DOM.

## File size stays `Size ?`

Some origins reject HEAD and byte-range metadata requests. MediaForge intentionally keeps the record rather than hiding it.

## A video only appears as `blob:`

Generic adaptive-streaming pages can expose playback without a single direct file. X/Twitter has a dedicated metadata interceptor; arbitrary HLS/DASH reconstruction is a separate capability.

## The side panel feels busy on a giant page

0.3 virtualizes cards and yields during scanning, but a page with thousands of unique remote resources can still require real network metadata work. Disable automatic size probing if you want the initial list immediately and probe only when sorting/filtering by size.

## GIF conversion is slow

GIF is computationally expensive and limited to 256 colors per frame. High-resolution, long video sources naturally cost more CPU and memory than preserving the MP4.


## Long GIF exports look corrupt or drift out of sync

0.4 waits for a compositor-delivered decoded video frame after each seek when Chromium exposes `requestVideoFrameCallback()`, distributes GIF centisecond delays cumulatively instead of repeatedly rounding one frame delay, folds exact duplicate frames, and writes output in chunks. If a site gives MediaForge an inaccessible/protected player stream rather than a direct video file, use the provider page record instead of trying to convert the player blob.