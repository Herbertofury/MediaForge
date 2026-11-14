# Repository instructions

Read `.agents/foundry/AGENTS-adapter.md` for the pinned shared engineering core.
Keep this file and nested instructions project-owned: setup, commands, constraints and acceptance belong here.

## Repository-local media contract

- Read README.md, package.json, THIRD_PARTY_NOTICES.md and docs/PERFORMANCE.md. This is a local-first Opera GX/Chromium MV3 extension; Node is for validation, not a runtime dependency.
- Run `npm run qa` for unit tests and manifest/syntax/security validation. The ZIP workflow additionally runs tools/zip-worker-browser.mjs in Chromium; fixture success is not Opera GX acceptance or a verified live X/provider session.
- Preserve the complete logical discovery result set. Instant content and deep discovery are separate cooperative lanes; smart filters must not delete results. Unknown metadata remains explicit and visible.
- Keep discovery, classification, media selection, GIF conversion, ZIP packaging, viewer and Picviewer integration independently usable through explicit interfaces. Optional integration failure must not break ordinary page or unrelated extension behavior.
- Preserve local processing, existing permissions and third-party notices. Do not add analytics, remote code, private tokens or access bypasses. Only use legitimately authorized media routes.
- Validate actual selected-download/ZIP/GIF outputs, cancellation/failure cleanup and resource limits; a manifest or build pass alone is not end-to-end acceptance. Compare equivalent workloads before performance claims.
