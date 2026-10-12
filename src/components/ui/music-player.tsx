import { useState } from 'react';
import { musicLibrary } from '@/src/data/music-library';
import { useMusicPlayer } from '@/src/hooks/use-music-player';
import { MusicPlaylist } from './music-playlist';
import './music-player.css';

const formatTime = (seconds: number) => Number.isFinite(seconds)
  ? `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
  : '0:00';

function PlayerIcon({ name }: { name: 'previous' | 'play' | 'pause' | 'next' | 'volume' | 'mute' | 'playlist' }) {
  const paths = {
    previous: <><path d="M6 5v14" /><path d="m18 6-8 6 8 6V6Z" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />,
    pause: <><path d="M9 5v14" /><path d="M15 5v14" /></>,
    next: <><path d="M18 5v14" /><path d="m6 6 8 6-8 6V6Z" /></>,
    volume: <><path d="M5 10v4h4l5 4V6L9 10H5Z" /><path d="M17 9a4 4 0 0 1 0 6" /><path d="M19 6a8 8 0 0 1 0 12" /></>,
    mute: <><path d="M5 10v4h4l5 4V6L9 10H5Z" /><path d="m18 9-4 4" /><path d="m14 9 4 4" /></>,
    playlist: <><path d="M8 6h12" /><path d="M8 12h12" /><path d="M8 18h12" /><path d="M4 6h.01" /><path d="M4 12h.01" /><path d="M4 18h.01" /></>,
  };
  return <svg className="music-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function MusicPlayer() {
  const [open, setOpen] = useState(false);
  const player = useMusicPlayer(musicLibrary);
  const noTracks = musicLibrary.length === 0;

  return <section className="music-player" aria-label="Music player">
    <audio ref={player.audioRef} preload="metadata" />
    <div className="music-core">
      <div className="music-controls">
        <button onClick={player.previous} disabled={noTracks} aria-label="Previous track"><PlayerIcon name="previous" /></button>
        <button className="music-play" onClick={player.togglePlay} disabled={noTracks} aria-label={player.playing ? 'Pause' : 'Play'}><PlayerIcon name={player.playing ? 'pause' : 'play'} /></button>
        <button onClick={player.next} disabled={noTracks} aria-label="Next track"><PlayerIcon name="next" /></button>
      </div>
      <div className="music-track" title={player.track?.title}>
        <strong>{player.track?.title ?? 'No music found'}</strong>
        <span>{player.track?.artist ?? 'Run npm run music:scan after adding songs'}</span>
        <div className="music-progress"><span>{formatTime(player.currentTime)}</span><input aria-label="Seek" type="range" min="0" max={player.duration || 0} step="0.1" value={Math.min(player.currentTime, player.duration || 0)} onChange={(event) => player.seek(Number(event.target.value))} disabled={!player.track} /><span>{formatTime(player.duration)}</span></div>
      </div>
      <div className="music-actions">
        <button className={player.muted ? 'is-selected' : ''} onClick={player.toggleMuted} aria-label={player.muted ? 'Unmute' : 'Mute'}><PlayerIcon name={player.muted ? 'mute' : 'volume'} /></button>
        <input className="music-volume" aria-label="Volume" type="range" min="0" max="1" step="0.05" value={player.volume} onChange={(event) => player.setVolume(Number(event.target.value))} />
        <button className="music-icon" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Toggle playlist"><PlayerIcon name="playlist" /></button>
      </div>
    </div>
    {player.error && <p className="music-error" role="status">{player.error}</p>}
    {open && <div className="music-drawer">
      <div className="music-modes"><button className={player.mode === 'artist' ? 'is-selected' : ''} onClick={() => player.setMode('artist')}>Artist Mode</button><button className={player.mode === 'shuffle' ? 'is-selected' : ''} onClick={() => player.setMode('shuffle')}>Shuffle All</button></div>
      {player.mode === 'artist' && <div className="music-artists">{player.artists.map((artist) => <button key={artist} className={artist === player.artist ? 'is-selected' : ''} onClick={() => player.selectArtist(artist)}>{artist}</button>)}</div>}
      <MusicPlaylist tracks={player.playlist} activeIndex={player.index} onSelect={player.selectTrack} />
    </div>}
  </section>;
}
