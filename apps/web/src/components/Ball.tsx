import type { CSSProperties } from 'react';

/** The colours of the solid balls 1–7, and the 8-ball. 9–15 are the same colours, striped. */
const COLOURS = ['#f5c518', '#1d4fc0', '#d8261f', '#5c2d91', '#f47a20', '#13804a', '#7c1d1d'];
const EIGHT = '#141414';

/** A number drawn as a pool ball, as the seeds in the bracket. */
export function Ball({ n, label }: { n: number; label?: string }) {
  const colour = n === 8 ? EIGHT : (COLOURS[(n - 1) % 8] ?? EIGHT);
  const striped = n > 8 && n < 16;
  return (
    <span
      className={`ball${striped ? ' striped' : ''}`}
      style={{ '--ball': colour } as CSSProperties}
      title={label}
      aria-label={label}
    >
      <span className="ball-number">{n}</span>
    </span>
  );
}
