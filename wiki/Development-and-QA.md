# Development & QA

## Commands

```bash
npm test
npm run check
npm run perf:model
npm run qa
```

## Test coverage

The current suite covers:

- X rendition selection
- original X photo URL upgrading
- X payload media extraction
- trusted video-host rejection
- filename/path sanitization
- direct URL validation
- data-URL byte sizing
- duplicate record merge behavior
- GIF89a output
- ZIP CRC32 and envelope validity
- 0.3 performance-contract workload thresholds

## Static validation

`tools/validate.cjs` checks:

- MV3 manifest requirements
- Opera + Chromium panel references
- all-frame deep scanning configuration
- permission allowlist
- required files
- local-only script loading
- JavaScript syntax
- rejection of `eval` / `new Function`

## Performance model

`tools/perf-model.cjs` intentionally reports workload reductions rather than pretending a synthetic benchmark equals real browser latency. Use browser tracing/profile evidence when validating a specific website or machine.

## Performance checks

Run `npm run perf:model` for deterministic workload reductions and `npm run perf:ui` for the parity-checked 20,000-record panel CPU benchmark.
