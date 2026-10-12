# Samiksha birthday gallery

## Adding music

1. Copy an artist folder into `public/music/` (for example, `public/music/Arijit Singh/`).
2. Run `npm run music:scan`.
3. Refresh the site or restart the development server.

The scan script discovers supported browser audio files recursively and updates `src/data/music-library.ts`. The browser uses that generated library; it cannot read arbitrary folders on your computer at runtime.

## YouTube playlists

In the player, select **YouTube playlists**, open the playlist button, then enter a name and a standard YouTube playlist URL (or a YouTube watch URL containing a `list` parameter). Playlist names and IDs are stored only in this browser's localStorage. Playback uses YouTube's visible official IFrame player; private, deleted, or unavailable playlists remain subject to YouTube access rules.
