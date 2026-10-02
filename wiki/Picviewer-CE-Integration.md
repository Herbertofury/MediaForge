# Picviewer CE+ Integration

MediaForge GX is designed to coexist with Picviewer CE+ instead of replacing its mature image-hover workflow.

When MediaForge detects Picviewer's `#pv-float-bar-container`, it leaves Picviewer's own controls intact and adds only the missing MediaForge actions:

- **GX↓** for MediaForge-aware best/original download;
- contextual **GIF** export for compatible video/animation media.

If Picviewer is not present, MediaForge supplies its own compact hover toolbar and fullscreen viewer with gallery navigation, wheel zoom, fit/1:1, rotate, flip, video controls, download, URL copy, and GIF export.

The integration is intentionally additive: Picviewer remains independently updateable and MediaForge does not bundle or overwrite the userscript.
