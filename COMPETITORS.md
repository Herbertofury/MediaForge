# Competing apps and reference workflows
Source review: **2026-11-12**.

This extends the existing [Challenger/reference scan](README.md#challengerreference-scan), which already names Imageye, Fatkun and Download All Images. It does not replace that earlier comparison or assert those apps have been freshly benchmarked.

| Reference | Relevant scope | Next fair comparison |
| --- | --- | --- |
| [Download All Images / save-images](https://github.com/belaviyo/save-images) | Browser image collection, including nested frames | Same page corpus: actual media found, false positives, selection/filtering and valid archive output. |
| [Picviewer CE+ / UserScripts](https://github.com/hoothin/UserScripts) | Image-viewer and userscript workflow; existing integration reference | Interaction coexistence, original image selection, zoom and keyboard usability with both tools enabled. |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Command-line audio/video extraction rather than an in-page selector | On authorized, supported public media compare rendition choice, metadata and failure explanations; do not assume browser/CLI capability parity. |

## Differentiation hypotheses and tests
- Useful visible-page results first, with complete deeper results arriving afterward, should beat an all-or-nothing loading screen without dropping media.
- [ ] Benchmark cold first-use and large-page scan completion separately, including long-task/input latency and peak memory.
- [ ] Verify iframe/Shadow DOM/lazy content, missing metadata and original-resolution selection against a manually counted corpus.
- [ ] Decode produced GIFs and validate ZIP entries/checksums; a download event is not proof of valid content.
- [ ] Test cancellation, interrupted jobs and unavailable/adaptive streams with explicit partial/unsupported status.
- [ ] Recheck Imageye and Fatkun through their official listings on the next review before claiming feature changes.

No access-control bypass, DRM removal or private media publication belongs in this comparison. Preserve original quality, completeness and existing privacy boundaries.

## Evidence and refresh rules
Review official release notes, documentation and issue trackers daily when the scheduled review runs. Record the source URL, check date, version/commit, relevant change, user impact and next experiment; retain last-good information and mark inaccessible sources. No change is a valid result. A scheduled review is not continuous monitoring.

This is a source-backed research shortlist, **not a head-to-head benchmark or a claim of feature/performance superiority**. Before recommending adoption, compare the current application and candidate on the same real workloads, machine, versions and correctness requirements. Retain raw timings, p50/p95 latency, CPU/memory, failures and rollback evidence. Check licensing and privacy before reuse; an open repository does not grant unrestricted reuse. New features remain proposals until approved, implemented and accepted.
