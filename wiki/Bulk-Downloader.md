# Bulk Downloader

The **Media on this page** panel is designed as a high-density media library rather than a one-shot downloader popup.

## Search

Search matches filename, URL, title/alt text, host, type, extension, MIME, and discovery source. Multiple words are ANDed.

Regex is supported:

```text
/character.*\.png/i
```

## Sorting

- Page position
- File size: largest / smallest
- Megapixels
- Width
- Height
- Type
- Filename
- URL

Unknown values are kept visible and sorted after known values instead of being silently dropped.

## Filters

- Images / GIFs / video / audio / SVG
- File-size presets and custom min/max MB
- Minimum/maximum width and height
- 512 / 1024 / 2048+ dimension presets
- 4 MP+
- Portrait / landscape / square-ish
- Same-host only
- Hide unknown metadata

## Selection

Selection is logical, not tied to currently materialized cards. That matters for virtualization: you can select all 2,000 matching records even though only the first viewport-sized batch exists in the DOM.

Actions include:

- Download selected
- ZIP selected
- Copy selected URLs
- Export JSON manifest
- Select visible
- Invert visible
- Clear selection

## Per-item actions

Every relevant record can expose:

- Download
- Save As
- View
- Copy URL
- Open source
- Save as real GIF for compatible MP4 animation/video
- Google Lens for HTTP(S) images
