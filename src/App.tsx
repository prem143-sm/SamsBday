import InfiniteGallery from '@/components/ui/3d-gallery-photography';

const sampleImages = [
  {
    src: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=1200&q=80',
    alt: 'Mountain lake',
  },
  {
    src: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
    alt: 'Desert road',
  },
  {
    src: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80',
    alt: 'Forest valley',
  },
  {
    src: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
    alt: 'Coastal cliffs',
  },
  {
    src: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=80',
    alt: 'Lake sunrise',
  },
  {
    src: 'https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&w=1200&q=80',
    alt: 'City skyline',
  },
  {
    src: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
    alt: 'Mountain reflection',
  },
  {
    src: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1200&q=80',
    alt: 'Tropical landscape',
  },
];

export default function App() {
  return (
    <main className="min-h-screen w-full bg-slate-950 text-white">
      <InfiniteGallery
        images={sampleImages}
        speed={1.2}
        visibleCount={12}
        className="h-screen w-full overflow-hidden rounded-none"
      />

      <div className="pointer-events-none fixed inset-0 flex items-center justify-center px-3 text-center mix-blend-exclusion text-white">
        <h1 className="font-serif text-4xl tracking-tight md:text-7xl">
          <span className="italic">Happy Birthday Samiksha</span>
        </h1>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-10 text-center font-mono text-[11px] font-semibold uppercase text-white/90">
        <p>Use mouse wheel, arrow keys, or touch to navigate</p>
        <p className="opacity-60">Auto-play resumes after 3 seconds of inactivity</p>
      </div>
    </main>
  );
}
