import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { musicPlaylists } from '../../data/music-manifest';
import './music-player.css';

interface MusicPlayerProps {
  onBoundsChange?: (top: number) => void;
}

const formatTime = (seconds: number) => Number.isFinite(seconds) && seconds >= 0
  ? `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
  : '0:00';

function Icon({ children }: { children: React.ReactNode }) {
  return <svg className="music-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

export function MusicPlayer({ onBoundsChange }: MusicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  // Refs mirror the playback context so async audio events never read stale state.
  const activePlaylistIdRef = useRef(musicPlaylists[0]?.id ?? '');
  const currentIndexRef = useRef(-1);
  const failedTracksRef = useRef<Set<string>>(new Set());
  const shuffleRef = useRef(false);
  const historyRef = useRef<number[]>([]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [activePlaylistId, setActivePlaylistId] = useState(activePlaylistIdRef.current);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  // Playback mode: false = normal queue order, true = shuffle. Starts in queue order.
  const [shuffle, setShuffle] = useState(false);

  const activePlaylist = musicPlaylists.find((item) => item.id === activePlaylistId) ?? musicPlaylists[0];
  const tracks = activePlaylist?.tracks ?? [];
  const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : undefined;

  const getTracks = () => musicPlaylists.find((item) => item.id === activePlaylistIdRef.current)?.tracks ?? [];

  // Report the player's top edge so the birthday heading can reserve space for it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      onBoundsChange?.(0);
      return;
    }
    const measure = () => onBoundsChange?.(container.getBoundingClientRect().top);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [onBoundsChange]);

  // Keep the single audio element's volume/mute in sync with the UI.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.min(1, Math.max(0, volume / 100));
    audio.muted = muted;
  }, [volume, muted]);

  // Close the playlist panel with Escape.
  useEffect(() => {
    if (!panelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [panelOpen]);

  // Find the next playable track in `direction`, skipping tracks that already failed.
  // Returns -1 when every track has failed so we stop instead of looping forever.
  const findPlayableIndex = (fromIndex: number, direction: 1 | -1) => {
    const list = getTracks();
    const count = list.length;
    if (count === 0) return -1;
    for (let step = 1; step <= count; step += 1) {
      const index = (((fromIndex + direction * step) % count) + count) % count;
      if (!failedTracksRef.current.has(list[index].id)) return index;
    }
    return -1;
  };

  // Pick a random playable track for shuffle, avoiding the current track (when
  // other options exist) and any track that already failed. Returns -1 only when
  // nothing else is playable, so shuffle can never loop on a failed track.
  const pickRandomIndex = (fromIndex: number) => {
    const list = getTracks();
    const count = list.length;
    if (count === 0) return -1;
    const candidates: number[] = [];
    for (let i = 0; i < count; i += 1) {
      if (i === fromIndex) continue;
      if (failedTracksRef.current.has(list[i].id)) continue;
      candidates.push(i);
    }
    if (candidates.length === 0) {
      // Only the current track (or nothing) is playable — replay it if it is the sole option.
      return count === 1 && !failedTracksRef.current.has(list[0]?.id) ? 0 : -1;
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  // Resolve the index to advance to based on the current playback mode.
  const advanceIndex = () => {
    const from = currentIndexRef.current;
    if (shuffleRef.current) {
      // Remember where we came from so Previous can walk back through history.
      if (from >= 0) historyRef.current.push(from);
      return pickRandomIndex(from);
    }
    return findPlayableIndex(from < 0 ? -1 : from, 1);
  };

  const loadTrack = (index: number, autoplay: boolean) => {
    const track = getTracks()[index];
    const audio = audioRef.current;
    if (!track || !audio) return;
    currentIndexRef.current = index;
    setCurrentIndex(index);
    setError('');
    setCurrentTime(0);
    setDuration(0);
    audio.src = track.url;
    audio.load();
    if (autoplay) {
      // Every autoplay call comes from a user gesture or a song that just ended,
      // so it is allowed; any rejection settles via onPlay/onError.
      audio.play().catch(() => setPlaying(false));
    } else {
      setPlaying(false);
    }
  };

  const playTrack = (index: number) => {
    const track = getTracks()[index];
    if (!track) return;
    // A manual pick gives a previously-failed file another chance.
    failedTracksRef.current.delete(track.id);
    // An explicit choice starts a fresh shuffle history from here.
    historyRef.current = [];
    loadTrack(index, true);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (tracks.length === 0) {
      setError('No songs yet in this playlist.');
      return;
    }
    if (!audio) return;
    if (currentIndexRef.current < 0) {
      const index = findPlayableIndex(-1, 1);
      if (index === -1) {
        setError('No playable songs are available right now.');
        return;
      }
      loadTrack(index, true);
      return;
    }
    if (audio.paused) audio.play().catch(() => setPlaying(false));
    else audio.pause();
  };

  const next = () => {
    if (tracks.length === 0) return;
    const index = advanceIndex();
    if (index === -1) {
      setError('No playable songs are available right now.');
      return;
    }
    loadTrack(index, true);
  };

  const previous = () => {
    if (tracks.length === 0) return;
    const audio = audioRef.current;
    // Restart the current song if we are already a few seconds in.
    if (currentIndexRef.current >= 0 && audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    if (shuffleRef.current) {
      // Walk back through shuffle history; fall back to a random other track.
      const previousIndex = historyRef.current.pop();
      if (previousIndex !== undefined && previousIndex >= 0 && previousIndex < tracks.length && !failedTracksRef.current.has(tracks[previousIndex].id)) {
        loadTrack(previousIndex, true);
        return;
      }
      const index = pickRandomIndex(currentIndexRef.current);
      if (index === -1) {
        setError('No playable songs are available right now.');
        return;
      }
      loadTrack(index, true);
      return;
    }
    if (currentIndexRef.current < 0) {
      next();
      return;
    }
    const index = findPlayableIndex(currentIndexRef.current, -1);
    if (index === -1) {
      setError('No playable songs are available right now.');
      return;
    }
    loadTrack(index, true);
  };

  const switchPlaylist = (id: string) => {
    const audio = audioRef.current;
    activePlaylistIdRef.current = id;
    setActivePlaylistId(id);
    currentIndexRef.current = -1;
    setCurrentIndex(-1);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError('');
    failedTracksRef.current = new Set();
    historyRef.current = [];
    // Stop current audio so switching playlists never overlaps playback.
    audio?.pause();
  };

  // Toggle shuffle without interrupting the current song; reset history on change.
  const toggleShuffle = () => {
    setShuffle((current) => {
      const nextValue = !current;
      shuffleRef.current = nextValue;
      historyRef.current = [];
      return nextValue;
    });
  };

  const handleEnded = () => {
    const index = advanceIndex();
    if (index === -1) {
      setPlaying(false);
      setError('End of playlist.');
      return;
    }
    loadTrack(index, true);
  };

  const handleError = () => {
    if (currentIndexRef.current < 0) return;
    const track = getTracks()[currentIndexRef.current];
    if (track) failedTracksRef.current.add(track.id);
    setPlaying(false);
    // Skip to the next track for the active mode, never retrying the failed one.
    const index = shuffleRef.current ? pickRandomIndex(currentIndexRef.current) : findPlayableIndex(currentIndexRef.current, 1);
    if (index === -1) {
      setError('That track could not be played, and no other playable songs remain.');
      return;
    }
    setError(`"${track?.title ?? 'That track'}" could not be played. Skipping to the next song.`);
    loadTrack(index, true);
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration === 0) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const changeVolume = (value: number) => {
    setVolume(value);
    if (value > 0 && muted) setMuted(false);
  };

  const toggleMute = () => setMuted((value) => !value);

  const title = currentTrack
    ? currentTrack.title
    : tracks.length === 0
      ? 'No songs yet'
      : 'Select a song';
  const subtitle = activePlaylist ? activePlaylist.name : 'Music';

  return (
    <section ref={containerRef} className="music-player" aria-label="Music player">
      <div className="music-core">
        <div className="music-controls">
          <button type="button" onClick={previous} disabled={tracks.length === 0} aria-label="Previous song">
            <Icon><path d="M6 5v14" /><path d="m18 6-8 6 8 6V6Z" /></Icon>
          </button>
          <button type="button" className="music-play" onClick={togglePlay} disabled={tracks.length === 0} aria-label={playing ? 'Pause' : 'Play'}>
            <Icon>{playing ? <><path d="M9 5v14" /><path d="M15 5v14" /></> : <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />}</Icon>
          </button>
          <button type="button" onClick={next} disabled={tracks.length === 0} aria-label="Next song">
            <Icon><path d="M18 5v14" /><path d="m6 6 8 6-8 6V6Z" /></Icon>
          </button>
        </div>

        <div className="music-track" title={title}>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>

        <button
          type="button"
          className={`music-shuffle-toggle${shuffle ? ' is-active' : ''}`}
          onClick={toggleShuffle}
          aria-pressed={shuffle}
          title={shuffle ? 'Shuffle is on — click to play in queue order' : 'Queue order is on — click to shuffle'}
        >
          <Icon>{shuffle
            ? <><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" /></>
            : <><path d="M10 6h10" /><path d="M10 12h10" /><path d="M10 18h9" /><path d="M4 5h.5v4" /><path d="M4 11h.5v4" /><path d="M4 17h.5v4" /></>}</Icon>
        </button>

        <div className="music-progress">
          <span>{formatTime(currentTime)}</span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            disabled={!currentTrack}
            onChange={(event) => seek(Number(event.target.value))}
          />
          <span>{formatTime(duration)}</span>
        </div>

        <div className="music-volume-group">
          <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            <Icon>{muted ? <><path d="M5 10v4h4l5 4V6L9 10H5Z" /><path d="m18 9-4 4" /><path d="m14 9 4 4" /></> : <><path d="M5 10v4h4l5 4V6L9 10H5Z" /><path d="M17 9a4 4 0 0 1 0 6" /></>}</Icon>
          </button>
          <input
            className="music-volume"
            type="range"
            aria-label="Volume"
            min={0}
            max={100}
            value={volume}
            onChange={(event) => changeVolume(Number(event.target.value))}
          />
        </div>

        <div className="music-playlist-wrap">
          <button type="button" className="music-playlist-toggle" onClick={() => setPanelOpen((open) => !open)} aria-expanded={panelOpen} aria-controls="music-playlist-panel">
            <Icon><path d="M8 6h12" /><path d="M8 12h12" /><path d="M8 18h12" /><path d="M4 6h.01" /><path d="M4 12h.01" /><path d="M4 18h.01" /></Icon>
            <span>Playlist</span>
          </button>
        </div>
      </div>

      {error && <p className="music-error" role="status">{error}</p>}

      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setDuration(value);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
        onError={handleError}
      />

      {panelOpen && createPortal(
        <div className="music-panel-backdrop" onClick={() => setPanelOpen(false)}>
          <div className="music-panel" role="dialog" aria-modal="true" aria-label="Music playlists" onClick={(event) => event.stopPropagation()}>
            <div className="music-panel-header">
              <strong>Playlists</strong>
              <button type="button" onClick={() => setPanelOpen(false)} aria-label="Close playlist panel">×</button>
            </div>

            <div className="playlist-tabs" role="tablist" aria-label="Select a playlist">
              {musicPlaylists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  role="tab"
                  aria-selected={playlist.id === activePlaylistId}
                  className={playlist.id === activePlaylistId ? 'is-selected' : ''}
                  onClick={() => switchPlaylist(playlist.id)}
                >
                  {playlist.name}
                </button>
              ))}
            </div>

            <div className="playlist-songs">
              {tracks.length === 0 ? (
                <p className="music-empty">
                  No songs in {activePlaylist?.name ?? 'this playlist'} yet. Add audio files to
                  <code> public/music/{activePlaylist?.folder}</code> and run <code>npm run music:scan</code>.
                </p>
              ) : (
                tracks.map((track, index) => (
                  <button
                    key={track.id}
                    type="button"
                    className={index === currentIndex ? 'is-selected' : ''}
                    onClick={() => playTrack(index)}
                  >
                    <span className="song-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="song-title">{track.title}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}


