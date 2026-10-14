# Samiksha birthday gallery

## Local Music Player

The music player streams local audio files from two playlists:

- **Sam's Playlist** → `public/music/Sams-Playlist/`
- **Prem's Playlist** → `public/music/Prems-Playlist/`

Supported formats: MP3, M4A, WAV, OGG, and FLAC (FLAC plays only where the browser can decode it). Unsupported or missing files are skipped automatically.

### Adding songs

1. Drop your audio files into the matching folder above.
2. Regenerate the manifest:

   ```bash
   npm run music:scan
   ```

This scans both folders and rewrites `src/data/music-manifest.ts` with the real tracks (stable ids, browser URLs, and readable titles derived from the filenames). The manifest is also refreshed automatically before every `npm run build`.

