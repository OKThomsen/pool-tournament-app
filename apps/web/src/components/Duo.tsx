import { t } from '../strings';
import type { Tournament } from '../tournaments';

/** The "Par turnering" mark, as on Turneringer and /live. */
export function DuoTag() {
  return <span className="tag">{t.duo.label}</span>;
}

/** Under a tournament's title, for everyone: the mark and what it means, when it's on. */
export function DuoNote({ tournament }: { tournament: Tournament }) {
  if (!tournament.duo) return null;
  return (
    <p className="for-fun">
      <DuoTag /> <span className="muted">{t.duo.help}</span>
    </p>
  );
}

/** "12 spillere", or in a "Par turnering" "6 hold". */
export function entrantCount(tournament: Tournament): string {
  const n = tournament.players.length;
  return tournament.duo ? t.duo.teams(n) : t.create.count(n);
}
