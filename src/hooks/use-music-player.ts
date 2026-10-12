import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Track } from '@/src/data/music-library';

export type PlayerMode = 'artist' | 'shuffle';

export function useMusicPlayer(library: Track[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resumeOnTrackChange = useRef(false);
  const [mode, setModeState] = useState<PlayerMode>('artist');
  const [artist, setArtist] = useState('');
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');

  const artists = useMemo(() => [...new Set(library.map((track) => track.artist))], [library]);
  const playlist = useMemo(() => {
    if (mode === 'shuffle') return library;
    const selected = artist || artists[0];
    return library.filter((track) => track.artist === selected);
  }, [artist, artists, library, mode]);
  const track = playlist[index] ?? null;

  const chooseRandom = useCallback((exclude: number) => {
    if (library.length < 2) return 0;
    let next = exclude;
    while (next === exclude) next = Math.floor(Math.random() * library.length);
    return next;
  }, [library.length]);

  const next = useCallback(() => {
    if (!playlist.length) return;
    if (mode === 'shuffle') {
      const nextIndex = chooseRandom(index);
      setHistory((items) => [...items, index]);
      setIndex(nextIndex);
    } else {
      setIndex((value) => (value + 1) % playlist.length);
    }
  }, [chooseRandom, index, mode, playlist.length]);

  const previous = useCallback(() => {
    if (!playlist.length) return;
    if (mode === 'shuffle') {
      setHistory((items) => {
        const previousIndex = items[items.length - 1];
        if (previousIndex === undefined) return items;
        setIndex(previousIndex);
        return items.slice(0, -1);
      });
    } else {
      setIndex((value) => (value - 1 + playlist.length) % playlist.length);
    }
  }, [mode, playlist.length]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    try {
    if (audio.paused) { resumeOnTrackChange.current = true; await audio.play(); }
    else { resumeOnTrackChange.current = false; audio.pause(); }
      setError('');
    } catch {
      setError('Playback was blocked or this audio format is not supported.');
    }
  }, [track]);

  const selectTrack = useCallback((selectedIndex: number) => {
    resumeOnTrackChange.current = Boolean(audioRef.current && !audioRef.current.paused);
    if (mode === 'shuffle' && selectedIndex !== index) setHistory((items) => [...items, index]);
    setIndex(selectedIndex);
  }, [index, mode]);

  const setMode = useCallback((nextMode: PlayerMode) => {
    setModeState(nextMode);
    setHistory([]);
    setIndex(0);
  }, []);

  const selectArtist = useCallback((nextArtist: string) => {
    setArtist(nextArtist);
    setModeState('artist');
    setHistory([]);
    setIndex(0);
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    if (audioRef.current) audioRef.current.volume = nextVolume;
    setVolumeState(nextVolume);
    setMuted(nextVolume === 0);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [muted, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => { resumeOnTrackChange.current = true; setPlaying(true); };
    const onPause = () => setPlaying(false);
    const onError = () => setError('This track could not be loaded. Use Next to continue.');
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    const onEnded = () => { resumeOnTrackChange.current = true; next(); };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime); audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('play', onPlay); audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded); audio.removeEventListener('error', onError);
    };
  }, [next]);

  useEffect(() => {
    if (mode === 'artist' && !artist && artists[0]) setArtist(artists[0]);
  }, [artist, artists, mode]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    const shouldResume = resumeOnTrackChange.current || playing;
    audio.src = track.src;
    audio.load();
    setCurrentTime(0); setDuration(0); setError('');
    if (shouldResume) audio.play().catch(() => setError('Unable to continue playback.'));
  }, [track?.id]);

  return { audioRef, artists, playlist, track, index, mode, artist: artist || artists[0] || '', playing, currentTime, duration, volume, muted, error, togglePlay, next, previous, selectTrack, setMode, selectArtist, seek, setVolume, pause: () => audioRef.current?.pause(), toggleMuted: () => setMuted((value) => !value) };
}
