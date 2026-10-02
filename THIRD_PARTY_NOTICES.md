# Third-party notices

## gifenc encoder core

MediaForge GX includes an adapted subset of the GIF bitstream encoder from:

- Project: `gifenc`
- Author: Matt DesLauriers
- Source: https://github.com/mattdesl/gifenc
- License: MIT

Original license notice:

> The MIT License (MIT)  
> Copyright (c) 2017 Matt DesLauriers

Permission is granted, free of charge, to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software, subject to inclusion of the copyright and permission notice. The software is provided without warranty.

The MediaForge GX palette quantizer in `src/quantize.mjs` is project code and is not copied from gifenc's PNN quantizer.

## Picviewer CE+

Picviewer CE+ is an interoperability target. MediaForge GX does **not** bundle the supplied Picviewer CE+ userscript. The bridge recognizes Picviewer's public DOM toolbar and augments it with separate MediaForge GX controls when Picviewer is present.

Upstream: https://github.com/hoothin/UserScripts

The user-supplied Picviewer CE+ source also embeds third-party components such as FileSaver.js and JSZip; those components are not copied into this extension.

## X downloader references

The following MIT-licensed projects were inspected as reference implementations while designing the independent MediaForge GX X-media pipeline. Their repositories are not bundled as dependencies:

- https://github.com/amitkma/x-media-downloader — MIT, Copyright (c) 2026 Amit Kumar.
- https://github.com/Sato-Isolated/x-video-download — MIT.

## Bulk image downloader reference scan

`belaviyo/save-images` (Download All Images) was inspected as a public reference for the kinds of metadata/filter/deep-scan capabilities users expect from a mature bulk image downloader.

- Source: https://github.com/belaviyo/save-images
- License: Mozilla Public License 2.0

MediaForge GX's 0.2 scanner/filter UI is independent project code; the upstream extension is not bundled and no MPL source file is copied into this project.
