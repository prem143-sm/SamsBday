# Samiksha birthday gallery

## Adding music

1. Copy an artist folder into `public/music/` (for example, `public/music/Arijit Singh/`).
2. Run `npm run music:scan`.
3. Refresh the site or restart the development server.

The scan script discovers supported browser audio files recursively and updates `src/data/music-library.ts`. The browser uses that generated library; it cannot read arbitrary folders on your computer at runtime.
