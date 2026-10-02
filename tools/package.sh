#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-/mnt/data}"
VER="0.4.1"
make_variant() {
  local name="$1" manifest="$2"
  local dir="$OUT/.mfgx-$name"
  rm -rf "$dir"; mkdir -p "$dir/src" "$dir/vendor/gifenc" "$dir/icons"
  cp "$ROOT"/sidepanel.html "$ROOT"/sidepanel.css "$ROOT"/sidepanel.js "$ROOT"/converter.html "$ROOT"/converter.js "$ROOT"/zipper.html "$ROOT"/zipper.js "$ROOT"/LICENSE "$ROOT"/README.md "$ROOT"/THIRD_PARTY_NOTICES.md "$ROOT"/CHANGELOG.md "$dir/"
  cp "$ROOT"/src/background.js "$ROOT"/src/content.js "$ROOT"/src/content.css "$ROOT"/src/x-media.js "$ROOT"/src/x-interceptor.js "$ROOT"/src/quantize.mjs "$ROOT"/src/gif-utils.mjs "$ROOT"/src/media-classifier.js "$ROOT"/src/zip-core.js "$dir/src/"
  cp "$ROOT"/vendor/gifenc/gifenc.mjs "$dir/vendor/gifenc/"
  cp "$ROOT"/icons/icon16.png "$ROOT"/icons/icon32.png "$ROOT"/icons/icon48.png "$ROOT"/icons/icon128.png "$dir/icons/"
  cp "$ROOT/$manifest" "$dir/manifest.json"
  (cd "$dir" && zip -q -r "$OUT/MediaForge-GX-v${VER}-${name}.zip" .)
  rm -rf "$dir"
}
make_variant "OperaGX" "manifest.opera-gx.json"
make_variant "Chromium" "manifest.chromium.json"
(cd "$(dirname "$ROOT")" && zip -q -r "$OUT/MediaForge-GX-v${VER}-Source.zip" "$(basename "$ROOT")" -x '*/docs/sidepanel-preview.png')
sha256sum "$OUT/MediaForge-GX-v${VER}-OperaGX.zip" "$OUT/MediaForge-GX-v${VER}-Chromium.zip" "$OUT/MediaForge-GX-v${VER}-Source.zip" > "$OUT/MediaForge-GX-v${VER}-SHA256.txt"
