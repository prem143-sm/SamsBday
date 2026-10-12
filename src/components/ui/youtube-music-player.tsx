import { useCallback, useEffect, useRef, useState } from 'react';

interface SavedPlaylist { id: string; name: string; playlistId: string; url: string; }
interface YouTubeMusicPlayerProps { open: boolean; onTogglePlaylist: () => void; }

const storageKey = 'samiksha-youtube-playlists';
const formatTime = (seconds: number) => Number.isFinite(seconds)
  ? `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}` : '0:00';

const extractPlaylistId = (value: string) => {
  try {
    const url = new URL(value.trim());
    if (!['www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) return null;
    const id = url.searchParams.get('list');
    return id && /^[\w-]{10,}$/.test(id) ? id : null;
  } catch { return null; }
};

function Icon({ children }: { children: React.ReactNode }) {
  return <svg className="music-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

export function YouTubeMusicPlayer({ open, onTogglePlaylist }: YouTubeMusicPlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);
  const [playlists, setPlaylists] = useState<SavedPlaylist[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as SavedPlaylist[]; } catch { return []; }
  });
  const [selected, setSelected] = useState<SavedPlaylist | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('Choose a YouTube playlist');
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(playlists)); }, [playlists]);
  const sync = useCallback(() => {
    const player = playerRef.current;
    if (!player?.getCurrentTime) return;
    setCurrentTime(player.getCurrentTime() || 0);
    setDuration(player.getDuration() || 0);
    const data = player.getVideoData?.();
    if (data?.title) setTitle(data.title);
  }, []);
  const clearTimer = () => { if (timerRef.current !== null) window.clearInterval(timerRef.current); timerRef.current = null; };
  const startTimer = () => { clearTimer(); timerRef.current = window.setInterval(sync, 500); };

  useEffect(() => () => { clearTimer(); playerRef.current?.destroy?.(); }, []);

  const loadPlaylist = useCallback((playlist: SavedPlaylist) => {
    setSelected(playlist); setError(''); setTitle(playlist.name); setCurrentTime(0); setDuration(0);
    const initialize = () => {
      if (!mountRef.current) return;
      playerRef.current?.destroy?.();
      mountRef.current.innerHTML = '';
      const yt = (window as any).YT;
      playerRef.current = new yt.Player(mountRef.current, {
        width: '260', height: '146', playerVars: { listType: 'playlist', list: playlist.playlistId, playsinline: 1 },
        events: {
          onReady: (event: any) => { event.target.setVolume(volume); sync(); },
          onStateChange: (event: any) => { const state = (window as any).YT.PlayerState; setPlaying(event.data === state.PLAYING); if (event.data === state.PLAYING) startTimer(); else if (event.data === state.ENDED) { sync(); } },
          onError: () => setError('YouTube could not load this playlist or its current video.'),
        },
      });
    };
    if ((window as any).YT?.Player) { initialize(); return; }
    const script = document.querySelector<HTMLScriptElement>('script[data-youtube-iframe-api]');
    (window as any).onYouTubeIframeAPIReady = initialize;
    if (!script) { const element = document.createElement('script'); element.src = 'https://www.youtube.com/iframe_api'; element.dataset.youtubeIframeApi = 'true'; document.head.appendChild(element); }
  }, [sync, volume]);

  const addPlaylist = (event: React.FormEvent) => {
    event.preventDefault(); const playlistId = extractPlaylistId(url);
    if (!name.trim() || !playlistId) { setError('Enter a playlist name and a valid YouTube playlist URL.'); return; }
    const playlist = { id: crypto.randomUUID(), name: name.trim(), playlistId, url: url.trim() };
    setPlaylists((items) => [...items, playlist]); setName(''); setUrl(''); setError(''); loadPlaylist(playlist);
  };
  const call = (method: string) => { const player = playerRef.current; if (player?.[method]) player[method](); };
  const togglePlay = () => { if (!playerRef.current) { setError('Select a saved playlist first.'); return; } call(playing ? 'pauseVideo' : 'playVideo'); };
  const seek = (value: number) => { playerRef.current?.seekTo?.(value, true); setCurrentTime(value); };
  const changeVolume = (value: number) => { setVolume(value); playerRef.current?.setVolume?.(value); };
  const toggleMute = () => { if (!playerRef.current) return; if (muted) playerRef.current.unMute(); else playerRef.current.mute(); setMuted((value) => !value); };

  return <>
    <div className="music-core youtube-core">
      <div className="youtube-frame" ref={mountRef} aria-label="YouTube playlist player" />
      <div className="music-track" title={title}><strong>{title}</strong><span>{selected?.name ?? 'Add a playlist to begin'}</span><div className="music-progress"><span>{formatTime(currentTime)}</span><input aria-label="Seek YouTube video" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} disabled={!playerRef.current} onChange={(event) => seek(Number(event.target.value))} /><span>{formatTime(duration)}</span></div></div>
      <div className="music-controls youtube-controls"><button onClick={() => call('previousVideo')} aria-label="Previous video"><Icon><path d="M6 5v14" /><path d="m18 6-8 6 8 6V6Z" /></Icon></button><button className="music-play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}><Icon>{playing ? <><path d="M9 5v14" /><path d="M15 5v14" /></> : <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />}</Icon></button><button onClick={() => call('nextVideo')} aria-label="Next video"><Icon><path d="M18 5v14" /><path d="m6 6 8 6-8 6V6Z" /></Icon></button></div>
      <div className="music-actions"><button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}><Icon>{muted ? <><path d="M5 10v4h4l5 4V6L9 10H5Z" /><path d="m18 9-4 4" /><path d="m14 9 4 4" /></> : <><path d="M5 10v4h4l5 4V6L9 10H5Z" /><path d="M17 9a4 4 0 0 1 0 6" /></>}</Icon></button><input className="music-volume" aria-label="YouTube volume" type="range" min="0" max="100" value={volume} onChange={(event) => changeVolume(Number(event.target.value))} /><button onClick={onTogglePlaylist} aria-expanded={open} aria-label="Open YouTube playlists"><Icon><><path d="M8 6h12" /><path d="M8 12h12" /><path d="M8 18h12" /><path d="M4 6h.01" /><path d="M4 12h.01" /><path d="M4 18h.01" /></></Icon></button></div>
    </div>
    {error && <p className="music-error" role="status">{error}</p>}
    {open && <div className="music-drawer youtube-drawer"><form className="youtube-form" onSubmit={addPlaylist}><input aria-label="Playlist name" placeholder="Playlist name" value={name} onChange={(event) => setName(event.target.value)} /><input aria-label="YouTube playlist URL" placeholder="YouTube playlist URL" value={url} onChange={(event) => setUrl(event.target.value)} /><button type="submit">Add playlist</button></form><div className="youtube-library">{playlists.length ? playlists.map((playlist) => <div key={playlist.id}><button className={selected?.id === playlist.id ? 'is-selected' : ''} onClick={() => loadPlaylist(playlist)}>{playlist.name}</button><button onClick={() => { if (selected?.id === playlist.id) { playerRef.current?.destroy?.(); setSelected(null); } setPlaylists((items) => items.filter((item) => item.id !== playlist.id)); }} aria-label={`Remove ${playlist.name}`}>×</button></div>) : <p className="music-empty">No saved YouTube playlists yet.</p>}</div></div>}
  </>;
}
