# Repository instructions

Read `.agents/athena/AGENTS-adapter.md` for the pinned shared engineering core.
Keep this file and nested instructions project-owned: setup, commands, constraints and acceptance belong here.

## Repository-local media contract

- Read README.md, package.json, THIRD_PARTY_NOTICES.md and docs/PERFORMANCE.md. This is a local-first Opera GX/Chromium MV3 extension; Node is for validation, not a runtime dependency.
- Run `npm run qa` for unit tests and manifest/syntax/security validation. The ZIP workflow additionally runs tools/zip-worker-browser.mjs in Chromium; fixture success is not Opera GX acceptance or a verified live X/provider session.
- Preserve the complete logical discovery result set. Instant content and deep discovery are separate cooperative lanes; smart filters must not delete results. Unknown metadata remains explicit and visible.
- Keep discovery, classification, media selection, GIF conversion, ZIP packaging, viewer and Picviewer integration independently usable through explicit interfaces. Optional integration failure must not break ordinary page or unrelated extension behavior.
- Preserve local processing, existing permissions and third-party notices. Do not add analytics, remote code, private tokens or access bypasses. Only use legitimately authorized media routes.
- Validate actual selected-download/ZIP/GIF outputs, cancellation/failure cleanup and resource limits; a manifest or build pass alone is not end-to-end acceptance. Compare equivalent workloads before performance claims.

## Mandatory pre-release optimization gate

Before finalizing every release, follow the owner-mandated [Athena zero-loss pre-release optimization standard](https://github.com/Herbertofury/Athena/blob/main/guidance/PRE_RELEASE_OPTIMIZATION.md). Evaluate shrink-anything, fast-anything and rust-anything using reviewed pinned tools in isolated worktrees; run applicable passes, compare equivalent complete workloads, keep only independently verified improvements, restore rejected changes, and record per-tool evidence or explicit inapplicability/blockers. Never weaken tests, delete required content, force a Rust rewrite or regress functionality, quality, portability, compatibility, security or protected performance metrics. Data/documentation-only releases and existing native Rust paths require honest applicability decisions, not artificial ports. Existing local and pinned governance requirements remain intact.

## Mandatory CLI-first / non-interruptive execution

For every task, follow the owner-mandated [Athena CLI-first execution standard](https://github.com/Herbertofury/Athena/blob/main/guidance/CLI_FIRST_EXECUTION.md). Prefer fast official CLI/headless commands, supported APIs/SDKs/connectors and tested local automation. If a required application has no usable structured interface, discover or build a reviewed [CLI-Anything](https://github.com/HKUDS/CLI-Anything) harness over the real supported backend (or a native command surface for first-party code). Use isolated browser/renderer/test sessions for necessary UI proof. Never take over the user's active desktop, mouse, keyboard, focus or browser profile without explicit authorization for unavoidable foreground interaction. Preserve real runtime acceptance, data, permissions, feature parity and portable mode. Record reusable command coverage and unresolved gaps; no fake CLI parity or unnecessary release delay.
