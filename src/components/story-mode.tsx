import { useState, type FormEvent } from 'react';
import {
  storyChapters,
  storyIntro,
  storyPassword,
  storySubtitle,
  storyTitle,
} from '@/src/data/story-content';

export function StoryMode() {
  const [state, setState] = useState<'closed' | 'unlock' | 'open'>('closed');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [chapter, setChapter] = useState(0);
  const close = () => { setState('closed'); setValue(''); setError(''); setChapter(0); };
  const unlock = (event: FormEvent) => {
    event.preventDefault();
    if (value === storyPassword) {
      setState('open');
      setValue('');
      setError('');
    } else {
      setError('That password is not quite right.');
    }
  };
  const current = storyChapters[chapter];

  return <>
    <button className="story-trigger" onClick={() => setState('unlock')}>Our Story <span aria-hidden="true">♡</span></button>
    {state === 'unlock' && <div className="story-layer" role="dialog" aria-modal="true" aria-label="Unlock Our Story"><form className="story-lock" onSubmit={unlock}><button className="story-close" type="button" onClick={close} aria-label="Close">×</button><p className="story-eyebrow">A little private memory</p><h2>Unlock Our Story</h2><label>Secret password<input autoFocus type="password" value={value} onChange={(event) => setValue(event.target.value)} /></label><p className="story-hint">Hint: date of our first meet</p>{error && <p className="story-error" role="status">{error}</p>}<div className="story-actions"><button type="button" onClick={close}>Cancel</button><button type="submit">Unlock</button></div></form></div>}
    {state === 'open' && <div className="story-layer" role="dialog" aria-modal="true" aria-label="Our Story"><article className="story-card"><header><div><p className="story-eyebrow">{storySubtitle}</p><h2>{storyTitle}</h2></div><button className="story-close" onClick={close} aria-label="Close and lock story">×</button></header><p className="story-opening">{storyIntro}</p><nav className="story-chapters" aria-label="Story chapters">{storyChapters.map((item, index) => <button key={item.title} className={index === chapter ? 'is-selected' : ''} onClick={() => setChapter(index)}>{index + 1}</button>)}</nav><div className="story-reading"><p className="story-progress">Chapter {chapter + 1} of {storyChapters.length}</p><h3>{current.title}</h3><p>{current.text}</p></div><footer className="story-actions"><button onClick={() => setChapter((index) => Math.max(0, index - 1))} disabled={chapter === 0}>Previous</button><button onClick={() => setChapter((index) => Math.min(storyChapters.length - 1, index + 1))} disabled={chapter === storyChapters.length - 1}>Next</button></footer></article></div>}
  </>;
}
