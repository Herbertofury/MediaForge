# Audio & Streaming Platforms

MediaForge GX treats audio as a first-class media type alongside images and video.

## Direct audio support

Discovery recognizes MP3, M4A/MP4 audio, AAC, OGG/OGA, Opus, WAV, and FLAC from:

- `<audio>` and nested `<source>` elements;
- direct links and resource hints;
- Open Graph / Twitter audio metadata;
- JSON-LD `AudioObject`, `MusicRecording`, podcast/episode, and related `contentUrl` records;
- loaded Resource Timing entries when the URL itself identifies a media resource;
- accessible frames and open Shadow DOM.

Direct downloadable files get the same download, Save As, ZIP, URL-copy, JSON-export, filtering, and sorting workflows as other media.

## YouTube

On YouTube watch/Shorts/live/embed pages, MediaForge GX creates a semantic video record with title, artwork/poster, dimensions when available, and page/provider metadata. Direct media files exposed by ordinary web pages remain supported, but MediaForge GX does not attempt to defeat YouTube player restrictions, signed adaptive-stream delivery, or DRM. The semantic record therefore opens the source page instead of pretending a streamed player page is a direct MP4.

## Spotify

Spotify track/episode/show/album/playlist pages are recognized as audio-provider pages, with artwork and page metadata surfaced in the media library. MediaForge GX does not turn Spotify's protected playback into a direct-download service. If a site exposes an ordinary direct audio file outside a protected player, the generic direct-audio pipeline handles it normally.

The same provider-aware treatment is included for SoundCloud and Bandcamp pages so their player records do not get confused with direct audio files.
