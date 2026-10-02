# Security & Privacy

MediaForge GX is local-first.

- No analytics SDK.
- No upload-based media conversion service.
- GIF conversion is local.
- ZIP creation is local.
- Remote JavaScript is not loaded into extension pages.
- Repository validation rejects `eval` and `new Function`.

## Permissions

| Permission | Purpose |
| --- | --- |
| `downloads` | Save direct media, GIFs, ZIPs, and JSON manifests |
| `storage` | Preferences and short-lived local jobs |
| `tabs` | Active-tab communication and local converter/ZIP worker tabs |
| `sidePanel` | Chromium side-panel integration |
| `scripting` | User-requested deep snapshots across accessible frames |
| `<all_urls>` | Generic page media discovery, metadata, thumbnails, and direct media access |

## Provider boundaries

MediaForge surfaces useful semantic information for streaming providers without pretending protected/player streams are ordinary downloadable files. Direct media exposed by normal web pages still uses the generic downloader path.
