# Installation

## Opera GX

1. Download the current **OperaGX** build from the repository release/artifact.
2. Extract it to a permanent folder.
3. Open `opera://extensions`.
4. Enable **Developer mode**.
5. Choose **Load unpacked**.
6. Select the extracted folder containing `manifest.json`.
7. Reload pages that were already open before installation.
8. Pin MediaForge GX to the Opera sidebar/extensions area if desired.

MediaForge ships an Opera `sidebar_action` panel and the normal Chromium extension surface, so the same codebase can use Opera's persistent sidebar while remaining compatible with Chromium browsers.

## Chrome / Edge / Brave / other Chromium browsers

Use the **Chromium** build, extract it, then load it unpacked from the browser's extensions page.

## Updating

Replace the extracted files with the newer build, then press **Reload** on the extension card. Reload existing web pages after an update so their content scripts use the new version.

## Permissions

MediaForge GX currently uses:

- `downloads`
- `storage`
- `tabs`
- `sidePanel`
- `scripting`
- `<all_urls>` host access

See [Security & Privacy](Security-Privacy) for why each permission exists.
