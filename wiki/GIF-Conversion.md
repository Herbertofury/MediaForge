# GIF Conversion

MediaForge GX 0.4 rebuilds the MP4-to-GIF path around frame correctness, long-video stability, and maximum visual quality.

## Maximum-quality default

The default preset uses:

- 256-color local palettes per encoded frame;
- stable ordered dithering for smoother gradients without random temporal noise;
- compositor-synchronized frame capture through `requestVideoFrameCallback()` when available;
- exact centisecond timing distribution so 24/30 FPS exports do not drift over long clips;
- exact duplicate-frame folding: visually identical source samples extend timing instead of wasting another encoded frame;
- chunked GIF output storage so large files do not repeatedly reallocate/copy one enormous contiguous buffer.

Two alternate presets are available: **Clean** (256 colors, no dither) and **Fast** (192 colors, no dither).

## Long-video corruption guardrails

Older builds waited only for `seeked`, which can occur before a newly decoded video frame is actually presented. 0.4 waits for the compositor frame callback after each seek when supported, then captures the canvas. It also removes the old 5,000-frame conversion cap.

The encoder now grows as fixed chunks and builds the final Blob from those chunks. A hard failure occurs before the output exceeds the browser-safe 3.75 GiB boundary; MediaForge GX will not knowingly save a partial/corrupt GIF.

## Timing accuracy

GIF frame delays are integer centiseconds. Instead of rounding every 30 FPS frame to the same 30 ms, MediaForge GX distributes 30/40 ms frame delays so cumulative playback duration tracks the source. The regression suite checks a ten-minute 30 FPS schedule to within 10 ms.