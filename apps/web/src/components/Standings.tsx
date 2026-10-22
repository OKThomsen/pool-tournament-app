import type { SeasonStanding } from '../seasons';
import { t } from '../strings';
import { Ball } from './Ball';

/** The places drawn as pool balls, like the seeds in the bracket. */
const BALL_PLACES = 3;

/** A season rank: 1st to 3rd as pool balls (a shared place too), the rest as a number. */
export function Rank({ rank }: { rank: number }) {
  return rank <= BALL_PLACES ? <Ball n={rank} label={t.frontpage.place(rank)} /> : <>{rank}</>;
}

/** Season standings as "rank, name, points" rows: the frontpage scoreboard and /live. */
export function Standings({ rows }: { rows: SeasonStanding[] }) {
  return (
    <ol className="standings">
      {rows.map((row) => (
        <li key={row.playerId}>
          <span className="rank">
            <Rank rank={row.rank} />
          </span>
          <span className="name">{row.name}</span>
          <span className="points">{row.points}</span>
        </li>
      ))}
    </ol>
  );
}
