import { t } from '../strings';

/** The longest race the admin can choose (the server's limit for knockout rounds). */
export const MAX_RACE_TO = 15;

/**
 * "Først til": a race length as a number field, kept within `min`–`max`. Used wherever the
 * admin chooses one: the pools, the first knockout round and each later round.
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
  return (
    <label>
      {t.qualify.raceTo}
      <input
        type="number"
        min={min}
        max={max}
        required
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
      />
    </label>
  );
}
