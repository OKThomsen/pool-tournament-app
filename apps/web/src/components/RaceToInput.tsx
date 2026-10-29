import { useEffect, useState } from 'react';
import { t } from '../strings';

/** The longest race the admin can choose (the server's limit for knockout rounds). */
export const MAX_RACE_TO = 15;

/** What an emptied field becomes when the admin leaves it. */
const DEFAULT_RACE_TO = 2;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * "Først til": a race length as a number field, kept within `min`–`max`. Used wherever the
 * admin chooses one: the pools, the first knockout round and each later round.
 *
 * The field can be emptied to type a new number: a number within range counts as soon as it's
 * typed, and on leaving the field an empty one becomes 2 and one out of range is pulled back in.
 */
export function RaceToInput({
  value,
  onChange,
  min = 1,
  max = MAX_RACE_TO,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));

  // Follow changes from outside (a save, another admin), unless the field already says so.
  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  const type = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    if (raw !== '' && Number.isInteger(n) && n >= min && n <= max && n !== value) onChange(n);
  };

  const leave = () => {
    const n = clamp(text === '' ? DEFAULT_RACE_TO : Math.round(Number(text)) || min, min, max);
    setText(String(n));
    if (n !== value) onChange(n);
  };

  return (
    <label>
      {t.qualify.raceTo}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        disabled={disabled}
        value={text}
        onChange={(e) => type(e.target.value)}
        onBlur={leave}
      />
    </label>
  );
}
