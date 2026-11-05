import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { musicPlaylists } from '../../data/music-manifest';
import './music-player.css';

interface MusicPlayerProps {
  onBoundsChange?: (top: number) => void;
  onManageMedia?: () => void;
}

const formatTime = (seconds: number) => Number.isFinite(seconds) && seconds >= 0
  ? `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
  : '0:00';

function Icon({ children, className }: { children: React.ReactNode; className?: string }) {
  return <svg className={`music-svg${className ? " " + className : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

export function MusicPlayer({ onBoundsChange, onManageMedia }: MusicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

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
  const [shuffle, setShuffle] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const activePlaylist = musicPlaylists.find((item) => item.id === activePlaylistId) ?? musicPlaylists[0];
  const allTracks = activePlaylist?.tracks ?? [];

  const tracks = allTracks.filter((track) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return track.title.toLowerCase().includes(q);
  });

  const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : undefined;

  const getTracks = () => musicPlaylists.find((item) => item.id === activePlaylistIdRef.current)?.tracks ?? [];

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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.min(1, Math.max(0, volume / 100));
    audio.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    if (!panelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [panelOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [panelOpen]);

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
      return count === 1 && !failedTracksRef.current.has(list[0]?.id) ? 0 : -1;
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const advanceIndex = () => {
    const from = currentIndexRef.current;
    if (shuffleRef.current) {
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
      audio.play().catch(() => setPlaying(false));
    } else {
      setPlaying(false);
    }
  };

  const playTrack = (index: number) => {
    const track = getTracks()[index];
    if (!track) return;
    failedTracksRef.current.delete(track.id);
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

  const previous = () => {
    if (tracks.length === 0) return;
    const audio = audioRef.current;
    if (currentIndexRef.current >= 0 && audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    if (shuffleRef.current) {
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
    audio?.pause();
  };

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

  const next = () => {
    if (tracks.length === 0) return;
    const index = advanceIndex();
    if (index === -1) {
      setError('No playable songs are available right now.');
      return;
    }
    loadTrack(index, true);
  };

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
          <button type="button" className="music-manage-toggle" onClick={() => { setPanelOpen(false); onManageMedia?.(); }} aria-label="Manage Media">
            <Icon><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></Icon>
            <span>Manage Media</span>
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
          <div className="music-panel" role="dialog" aria-modal="true" aria-label="Your Music Library" onClick={(event) => event.stopPropagation()}>
            <div className="music-panel-header">
              <div className="music-header-left">
                <Icon className="music-header-icon"><path d="M12 3v10l5-5" /><circle cx="12" cy="8" r="3" /></Icon>
                <div className="music-header-info">
                  <strong>Your Music Library</strong>
                  <p>A little music, a lot of memories.</p>
                </div>
              </div>
              <div className="music-header-right">
                <button type="button" className="music-manage-btn" onClick={() => { setPanelOpen(false); onManageMedia?.(); }} aria-label="Manage Media">
                  <Icon><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></Icon>
                  <span>Manage Media</span>
                </button>
                <button type="button" onClick={() => setPanelOpen(false)} aria-label="Close playlist panel">×</button>
              </div>
            </div>

            <div className="playlist-selector-wrap" role="tablist" aria-label="Select a playlist">
              {musicPlaylists.map((playlist) => {
                const isSelected = playlist.id === activePlaylistId;
                return (
                  <button
                    key={playlist.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={`playlist-pill ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => switchPlaylist(playlist.id)}
                  >
                    <span className="pill-icon">♪</span>
                    <span className="pill-name">{playlist.name}</span>
                    <span className="pill-count">{playlist.tracks.length} track{playlist.tracks.length !== 1 ? 's' : ''}</span>
                  </button>
                );
              })}
            </div>

            <div className="playlist-search-wrap">
              <div className="search-icon">
                <Icon><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Icon>
              </div>
              <input
                type="search"
                className="playlist-search"
                placeholder="Search songs, artists, or titles..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Search songs"
              />
              {searchQuery && (
                <button type="button" className="search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
                  ×
                </button>
              )}
            </div>

            <div className="playlist-songs">
              {tracks.length === 0 ? (
                <div className="music-empty">
                  <p>{searchQuery ? 'No matching songs found.' : `No songs in ${activePlaylist?.name ?? 'this playlist'} yet.`}</p>
                  {searchQuery && <p className="music-empty-hint">Try adjusting your search.</p>}
                </div>
              ) : (
                tracks.map((track, index) => {
                  const isPlaying = index === currentIndex && playing;
                  const isSelected = index === currentIndex;
                  return (
                    <button
                      key={track.id}
                      type="button"
                      role="listitem"
                      className={`song-row ${isSelected ? 'is-active' : ''} ${isPlaying ? 'is-playing' : ''}`}
                      onClick={() => playTrack(index)}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <span className="song-number">
                        {isPlaying ? <Icon><path d="M9 5v14" /><path d="M15 5v14" /></Icon> : String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="song-info">
                        <span className="song-title" title={track.title}>{track.title}</span>
                        <span className="song-artist">
                          {isPlaying ? 'Now Playing' : activePlaylist.name}
                        </span>
                      </div>
                      <div className="song-actions">
                        <button type="button" className="song-play-btn" onClick={(e) => { e.stopPropagation(); playTrack(index); }} aria-label={isPlaying ? 'Pause' : 'Play'}>
                          <Icon>{isPlaying ? <><path d="M9 5v14" /><path d="M15 5v14" /></> : <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />}</Icon>
                        </button>
                        <button type="button" className="song-more-btn" onClick={(e) => { e.stopPropagation(); }} aria-label="More options">
                          <Icon><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></Icon>
                        </button>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}


