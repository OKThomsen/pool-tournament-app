import { formatDate } from '../format';
import type { Season } from '../seasons';
import { t } from '../strings';

/** The off-season message: no current season, and when the next one starts. */
export function NoSeason({ next }: { next: Season }) {
  return (
    <p>
      {t.season.none} <span className="date">{formatDate(next.start)}</span>.
    </p>
  );
}
