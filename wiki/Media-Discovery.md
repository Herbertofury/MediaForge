# Media Discovery

MediaForge GX deliberately separates **complete discovery** from **what is shown first**. The scanner keeps every discovered record; the smart classifier decides which records are likely useful enough for the default **Best content** view.

## Discovery sources

MediaForge combines media from:

- rendered `img` elements and natural dimensions;
- `srcset` / `picture` candidates;
- common lazy/original attributes;
- video/audio elements and nested sources;
- video posters;
- direct media links and resource hints;
- SVG image resources;
- inline CSS and accessible stylesheet URLs;
- Open Graph / Twitter media metadata;
- JSON-LD image/video/audio/music/podcast records;
- Resource Timing entries;
- open Shadow DOM roots;
- accessible iframe contexts;
- X/Twitter response metadata;
- provider-aware YouTube, Spotify, SoundCloud, and Bandcamp page semantics.

## No-loss rule

Smart filtering never deletes records. Switch to **All** to recover the complete scan immediately.

## Performance rule

Generic pages have no permanent full-document scan loop. Deep snapshots run on demand at background/cooperative priority, and metadata enrichment starts with likely-content records so useful information appears sooner without skipping the rest.
