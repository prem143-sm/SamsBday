import InfiniteGallery from '@/components/ui/3d-gallery-photography';
import { useState, type CSSProperties } from 'react';
import { MusicPlayer } from '@/src/components/ui/music-player';
import { photoLibrary } from '@/src/data/photo-library';
import { BirthdayClock } from '@/src/components/birthday-clock';
import { StoryMode } from '@/src/components/story-mode';

export default function App() {
  const [musicSource, setMusicSource] = useState<'local' | 'youtube'>('local');
  const [clockBottom, setClockBottom] = useState(0);
  const [youtubePlayerTop, setYouTubePlayerTop] = useState(0);
  const headingStyle = {
    '--heading-space-top': `${clockBottom + 24}px`,
    '--heading-space-bottom': `${youtubePlayerTop ? window.innerHeight - youtubePlayerTop + 24 : 0}px`,
  } as CSSProperties;

  return (
    <main className="min-h-screen w-full bg-slate-950 text-white">
      <InfiniteGallery
        images={photoLibrary}
        speed={1.2}
        visibleCount={12}
        className="h-screen w-full overflow-hidden rounded-none"
      />
      <BirthdayClock onLayoutChange={setClockBottom} />
      <StoryMode />

      <div className={`birthday-heading pointer-events-none fixed inset-0 flex items-center justify-center px-3 text-center mix-blend-exclusion text-white${musicSource === 'youtube' ? ' is-youtube-mode' : ''}`} style={headingStyle}>
        <h1 className="font-serif text-4xl tracking-tight md:text-7xl">
          <span className="italic">Happy Birthday Samiksha</span>
        </h1>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-10 text-center font-mono text-[11px] font-semibold uppercase text-white/90">
        <p>Use mouse wheel, arrow keys, or touch to navigate</p>
        <p className="opacity-60">Auto-play resumes after 3 seconds of inactivity</p>
      </div>
      <MusicPlayer onSourceChange={setMusicSource} onYouTubeBoundsChange={setYouTubePlayerTop} />
    </main>
  );
}
