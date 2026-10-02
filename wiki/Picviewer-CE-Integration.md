# Picviewer CE+ Integration

MediaForge GX is designed to coexist with Picviewer CE+ instead of replacing its strong image-viewing workflow.

When `#pv-float-bar-container` is present and the bridge is enabled, MediaForge adds only the missing actions:

- `GX↓` — MediaForge best/original download path
- `GIF` — real GIF conversion when the current record is a compatible MP4 animation/video

Picviewer's own zoom, rotate, gallery, magnifier, batch-save, and viewing behavior is left intact.

If Picviewer is not present, MediaForge supplies its own hover bar and fullscreen viewer with zoom, fit/1:1, rotate, flip, gallery navigation, download, URL copy, and GIF conversion.
