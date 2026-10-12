import { useEffect, useRef, useState } from 'react';

const timeZone = 'Asia/Kolkata';
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  hourCycle: 'h23',
});

type ZonedDate = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function indiaNow(): ZonedDate {
  const parts = dateFormatter.formatToParts(new Date());
  const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
}

const asUtc = (date: ZonedDate) => Date.UTC(date.year, date.month - 1, date.day, date.hour, date.minute, date.second);
const plural = (value: number, unit: string) => `${value} ${unit}${value === 1 ? '' : 's'}`;

function ageParts(now: ZonedDate) {
  let years = now.year - 2003;
  let months = now.month - 10;
  let days = now.day - 15;
  let hours = now.hour;
  let minutes = now.minute;
  let seconds = now.second;
  if (seconds < 0) { seconds += 60; minutes -= 1; }
  if (minutes < 0) { minutes += 60; hours -= 1; }
  if (hours < 0) { hours += 24; days -= 1; }
  if (days < 0) { const previousMonthDays = new Date(Date.UTC(now.year, now.month - 1, 0)).getUTCDate(); days += previousMonthDays; months -= 1; }
  if (months < 0) { months += 12; years -= 1; }
  return { years, months, days, hours, minutes, seconds };
}

function countdownParts(now: ZonedDate) {
  const current = asUtc(now);
  let target = Date.UTC(now.year, 9, 15, 0, 0, 0);
  if (current >= target) target = Date.UTC(now.year + 1, 9, 15, 0, 0, 0);
  let remaining = Math.max(0, Math.floor((target - current) / 1000));
  const days = Math.floor(remaining / 86400); remaining %= 86400;
  const hours = Math.floor(remaining / 3600); remaining %= 3600;
  const minutes = Math.floor(remaining / 60);
  return { days, hours, minutes, seconds: remaining % 60 };
}

interface BirthdayClockProps { onLayoutChange?: (bottom: number) => void; }

export function BirthdayClock({ onLayoutChange }: BirthdayClockProps) {
  const [now, setNow] = useState(indiaNow);
  const clockRef = useRef<HTMLElement | null>(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(indiaNow()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!clockRef.current) return;
    const measure = () => onLayoutChange?.(clockRef.current?.getBoundingClientRect().bottom ?? 0);
    const observer = new ResizeObserver(measure);
    observer.observe(clockRef.current);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [onLayoutChange]);
  const age = ageParts(now);
  const countdown = countdownParts(now);
  return <aside ref={clockRef} className="birthday-clock" aria-label="Samiksha's live age and next birthday countdown">
    <section><strong>Samiksha is {age.years} years old</strong><p>{[plural(age.years, 'Year'), plural(age.months, 'Month'), plural(age.days, 'Day'), plural(age.hours, 'Hour'), plural(age.minutes, 'Minute'), plural(age.seconds, 'Second')].join(' · ')}</p></section>
    <section><strong>Next Birthday <span aria-hidden="true">🎂</span></strong><p>{[plural(countdown.days, 'Day'), plural(countdown.hours, 'Hour'), plural(countdown.minutes, 'Minute'), plural(countdown.seconds, 'Second')].join(' · ')}</p></section>
  </aside>;
}
