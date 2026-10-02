# Media Discovery

MediaForge GX deliberately uses multiple independent discovery paths, then de-duplicates by media type + URL while keeping the richest metadata.

## DOM sources

- `<img>` current source
- natural dimensions
- `srcset`
- `<picture><source>`
- lazy/original attributes such as `data-original`, `data-full-src`, `data-hires`, `data-zoom-image`, `data-src`
- linked image/video/audio files
- `<video>` and `<audio>` direct sources
- video posters
- SVG `<image>` references
- inline CSS `url(...)`

## Page metadata

- Open Graph image/video/audio entries
- Twitter card media entries

## CSS resources

Accessible stylesheet rules are inspected for media URLs. The stylesheet result is cached and only invalidated when relevant style/stylesheet nodes are added, avoiding repeated CSSOM walks.

## Network/resource discovery

A buffered `PerformanceObserver` receives Resource Timing entries and keeps media-like resources in a cache. This catches extensionless CDN image/video/audio URLs that may be hard to identify from filename alone.

## Shadow DOM

Open shadow roots are discovered cooperatively and cached. DOM mutations invalidate that cache, but discovery is deferred until the next deep snapshot instead of becoming a continuous browsing-time traversal.

## Frames

The MV3 service worker requests a snapshot from all accessible frames with `chrome.scripting.executeScript({allFrames:true})`, then merges and de-duplicates the results.

## X/Twitter

X requires a special path because videos are often rendered through `blob:` URLs. See [X / Twitter](X-Twitter).
