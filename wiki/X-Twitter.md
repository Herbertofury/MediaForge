# X / Twitter

X commonly feeds video elements from `blob:` URLs while the downloadable direct MP4 variants live in X's own JSON responses. MediaForge therefore uses a MAIN-world response interceptor plus an isolated content-script bridge.

## Video quality

Direct MP4 variants are ranked by **visual area first, bitrate second**, avoiding a high-bitrate but lower-resolution rendition when a better visual rendition exists.

## Animated GIFs

X “GIFs” are normally looping MP4 animations. MediaForge offers the best direct MP4 and local conversion to a real GIF.

## Photos

`pbs.twimg.com` photo URLs are upgraded to `name=orig` when possible.

## Inline controls

MediaForge adds compact best/original download controls to X post action rows and a contextual GIF action for animated media. X SPA updates are handled by dirty/new-article targeting rather than repeated full-page article rescans.
