import type { Song } from '../../lib/model';
import './Artwork.css';

/**
 * A cover, drawn from the song's own id.
 *
 * No stock photography and no remote images: the app makes no external requests,
 * and a placeholder that has to be fetched is worse than none. The id seeds two
 * hues and a waveform, so a song looks the same every time you open the list and
 * different from the one above it — which is the only job a cover does here,
 * until there is a real one to upload.
 */
export function Artwork({ song, className }: { song: Song; className?: string }) {
  const seed = hash(song.id);
  const hue = seed % 360;
  const second = (hue + 40 + (seed % 60)) % 360;
  const id = `art-${song.id}`;

  // A fixed count so the shape reads as a waveform rather than as noise, with
  // the heights coming off the same seed.
  const bars = Array.from({ length: 11 }, (_, index) => {
    const height = 0.25 + ((hash(`${song.id}:${String(index)}`) % 100) / 100) * 0.7;
    return { x: 8 + index * 8.4, height };
  });

  return (
    <span className={className ? `art ${className}` : 'art'}>
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className="art__svg">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={`hsl(${String(hue)} 45% 26%)`} />
            <stop offset="100%" stopColor={`hsl(${String(second)} 40% 12%)`} />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#${id})`} />
        {bars.map((bar) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={50 - (bar.height * 70) / 2}
            width="3.2"
            height={bar.height * 70}
            rx="1.6"
            fill="rgb(255 255 255 / 22%)"
          />
        ))}
      </svg>
    </span>
  );
}

/** FNV-1a. Small, stable, and it does not need to be a good hash. */
function hash(value: string): number {
  let out = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    out ^= value.charCodeAt(index);
    out = Math.imul(out, 16777619);
  }
  return Math.abs(out);
}
