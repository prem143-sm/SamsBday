import { useEffect, useMemo, useState } from 'react';
import type { GalleryImage } from '@/src/data/photo-library';

interface PageLoaderProps {
  images: GalleryImage[];
}

const heroImage = '/Photos/optimized/my%20fevt%20pic%20sam.webp';
const assetTimeout = 12_000;
const initialImageCount = 12;

export function PageLoader({ images }: PageLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [complete, setComplete] = useState(false);
  const [visible, setVisible] = useState(true);
  const sources = useMemo(
    () => [...new Set([...images.slice(0, initialImageCount).map((image) => image.src), heroImage])],
    [images],
  );

  useEffect(() => {
    let cancelled = false;
    let completed = 0;
    const updateProgress = () => {
      completed += 1;
      if (!cancelled) setTargetProgress(Math.round((completed / sources.length) * 100));
    };

    const documentReady = new Promise<void>((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
        return;
      }
      const onLoad = () => resolve();
      window.addEventListener('load', onLoad, { once: true });
      window.setTimeout(resolve, assetTimeout);
    });

    const imagesReady = Promise.all(sources.map((src) => new Promise<void>((resolve) => {
      const image = new Image();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        updateProgress();
        resolve();
      };
      const timeout = window.setTimeout(finish, assetTimeout);
      image.onload = finish;
      image.onerror = finish;
      image.src = src;
    })));

    Promise.all([documentReady, imagesReady]).then(() => {
      if (cancelled) return;
      setTargetProgress(100);
      setAssetsReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [sources]);

  useEffect(() => {
    if (progress >= targetProgress) return;

    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(targetProgress, current + 1));
    }, 14);

    return () => window.clearInterval(timer);
  }, [progress, targetProgress]);

  useEffect(() => {
    if (!assetsReady || progress < 100) return;

    const fadeTimer = window.setTimeout(() => setComplete(true), 180);
    const hideTimer = window.setTimeout(() => setVisible(false), 760);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [assetsReady, progress]);

  if (!visible) return null;

  return (
    <section className={`page-loader${complete ? ' is-complete' : ''}`} aria-live="polite" aria-label="Loading birthday page">
      <img className="page-loader-portrait" src={heroImage} alt="" aria-hidden="true" />
      <div className="page-loader-copy">
        <p className="page-loader-kicker">A little celebration is loading</p>
        <h1>Happy Birthday Samiksha</h1>
        <div className="page-loader-status">
          <span>Loading {progress}%</span>
          <span className="page-loader-track" aria-hidden="true">
            <span className="page-loader-fill" style={{ transform: `scaleX(${progress / 100})` }} />
          </span>
        </div>
      </div>
    </section>
  );
}
