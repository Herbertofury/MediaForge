# Development & QA

## Commands

```bash
npm test
npm run check
npm run perf:model
npm run perf:ui
npm run perf:smart
npm run qa
```

## Current verification

The 0.4 release suite contains 20 automated tests covering X rendition selection, original-photo upgrades, media extraction, filename/path safety, direct URL validation, data-URL sizing, duplicate merge behavior, GIF89a output, ten-minute 30 FPS timing accuracy, chunked >1 MiB GIF output, smart classification/provider recognition, panel parity/performance invariants, CRC32, and ZIP structure.

`tools/validate.cjs` verifies the MV3 manifests, Opera/Chromium panel references, all-frame scan configuration, permission allowlist, local-only scripts, JavaScript syntax, and rejection of `eval` / `new Function`.

Performance benchmarks are parity-checked and reported as workload/CPU measurements, not universal FPS promises.
