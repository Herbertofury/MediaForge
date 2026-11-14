---
name: mediaforge-output-qa
description: Implement and verify MediaForge GX current-page discovery, bulk selection, GIF conversion and complete ZIP outputs without losing deep results or confusing provider records with downloadable media.
---

# MediaForge discovery-to-output QA

Read AGENTS.md, package.json, docs/PERFORMANCE.md and the relevant wiki guide. This is a local-first Chromium/Opera GX extension; Node runs validation, not the installed extension.

## Preserve independent lanes and full logical content

Trace instant content discovery and cooperative deep discovery separately. Instant useful media is an early result, not permission to abandon deeper frames, open Shadow DOM, CSS, metadata or cached resources. Keep richer metadata when merging duplicates. Best Content may filter probable page chrome; All must restore the complete logical result set. Unknown size/type/access remains explicit.

The current side panel intentionally virtualizes mounted cards. Preserve the complete underlying selection/filter/sort/export model rather than importing an unrelated app's ban on virtualization. Test selecting items, changing filters and sort, scrolling out and back, and exporting the original intended selection. GIF, ZIP, viewer and Picviewer integration remain independent capabilities.

## Verify real output and failed work

For direct downloads retain original media URL and identity; do not treat a semantic YouTube/Spotify/provider record as a freely downloadable file. Use authorized routes and preserve existing permissions. Never work around a login, subscription, DRM or provider restriction to make a test pass.

For ZIP use tests/zip-core.test.cjs and tests/zip-worker.test.cjs, then the actual extension worker harness tools/zip-worker-browser.mjs. Check unavailable-item handling, retry after access recovery, cancellation, complete selected contents and final file bytes. A downloaded archive is not automatically a complete selection. Keep filename/path-traversal protections.

For GIF read wiki/GIF-Conversion.md and run tests/gif-core.test.cjs, tests/gif-long.test.cjs and tests/gif-worker.test.cjs. Preserve compositor-presented frame capture, cumulative centisecond timing, duplicate-frame duration and chunked output. Verify decoded frame content and duration, cancellation and explicit resource-limit failure; do not save a partial/corrupt result or silently switch maximum-quality work to a lower-quality preset.

## Run current verification

Run npm run qa for Node tests plus manifest/syntax/security checks. The repository's .github/workflows/zip-export.yml adds the Chromium extension worker test and retained artifacts. Follow that workflow's setup rather than guessing browser prerequisites. A browser harness can prove generated fixtures and actual extension code paths, not live X authorization or Opera GX behavior.

Use npm run perf:model, perf:first, perf:ui and perf:smart as the documented workload contracts when changing relevant performance paths. These do not substitute for equivalent real-page timing, memory and complete-output comparisons. Record both early useful media and full deep completion; do not stop timing before deferred work finishes.

Keep local conversion, no analytics/remote code, trusted X media hosts and THIRD_PARTY_NOTICES.md intact. A new permission or external converter is a separate consequential choice, not an automatic optimization.

## Closeout evidence

Record exact extension files/build, fixture versus public/authorized source, discovered and selected counts, output hashes/completeness, cancellation/retry state, raw timing and memory limits. Preserve failures and last-good data. Verify source merge, hosted CI, packaged extension and loaded browser identity separately. Do not call media actually playing, files complete or native Opera acceptance unless observed.
