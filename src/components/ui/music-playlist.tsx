import type { Track } from '@/src/data/music-library';

interface MusicPlaylistProps {
  tracks: Track[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function MusicPlaylist({ tracks, activeIndex, onSelect }: MusicPlaylistProps) {
  if (!tracks.length) return <p className="music-empty">No playable tracks were found.</p>;
  return <ol className="music-playlist">
    {tracks.map((track, index) => <li key={track.id}>
      <button className={index === activeIndex ? 'is-active' : ''} onClick={() => onSelect(index)}>
        <span>{track.title}</span><small>{track.artist}</small>
      </button>
    </li>)}
  </ol>;
}
