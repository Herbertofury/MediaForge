# Security & Privacy

MediaForge GX is local-first.

## No analytics / remote conversion

- No analytics SDK
- No remote JavaScript
- No hosted media-conversion backend
- GIF conversion is local
- ZIP creation is local

## Permission rationale

| Permission | Why it exists |
| --- | --- |
| `downloads` | Save direct media, ZIPs, GIFs, JSON manifests |
| `storage` | Preferences and short-lived local jobs |
| `tabs` | Active-tab communication and local converter/ZIP worker tabs |
| `sidePanel` | Chromium side-panel integration |
| `scripting` | Snapshot media across accessible frames |
| `<all_urls>` | Generic current-page media discovery and user-requested media access |

## Defensive behaviors

- `eval` and `new Function` are forbidden by repository validation.
- Remote `<script src="https://...">` is forbidden in extension HTML.
- Download filenames are sanitized for Windows-invalid names and path traversal.
- X direct video handling accepts trusted direct media hosts instead of arbitrary script URLs.
