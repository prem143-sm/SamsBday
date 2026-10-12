import { useEffect, useRef, useState } from 'react';
import { YouTubeMusicPlayer } from './youtube-music-player';
import './music-player.css';

interface MusicPlayerProps {
  onYouTubeBoundsChange?: (top: number) => void;
}

export function MusicPlayer({ onYouTubeBoundsChange }: MusicPlayerProps) {
  const [open, setOpen] = useState(false);
  const [youtubeExpanded, setYouTubeExpanded] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      onYouTubeBoundsChange?.(0);
      return;
    }

    const measure = () => {
      onYouTubeBoundsChange?.(container.getBoundingClientRect().top);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener('resize', measure);
    measure();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [onYouTubeBoundsChange, open, youtubeExpanded]);

  const toggleYouTube = () => {
    setYouTubeExpanded((expanded) => {
      if (expanded) setOpen(false);
      return !expanded;
    });
  };

  return (
    <section
      ref={containerRef}
      className={`music-player${youtubeExpanded ? ' is-youtube-expanded' : ''}`}
      aria-label="YouTube music player"
    >
      <button
        type="button"
        className="youtube-toggle"
        aria-controls="youtube-player-content"
        aria-expanded={youtubeExpanded}
        onClick={toggleYouTube}
      >
        <svg className="music-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="6" width="18" height="12" rx="3" />
          <path d="m10 9 5 3-5 3V9Z" fill="currentColor" stroke="none" />
        </svg>
        <span>YouTube Music</span>
      </button>
      {youtubeExpanded && (
        <div id="youtube-player-content" className="youtube-player-content">
          <YouTubeMusicPlayer
            open={open}
            onTogglePlaylist={() => setOpen((current) => !current)}
          />
        </div>
      )}
    </section>
  );
}
