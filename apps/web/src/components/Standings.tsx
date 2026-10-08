import type { SeasonStanding } from '../seasons';

/** Season standings as "rank, name, points" rows: the frontpage scoreboard and /live. */
export function Standings({ rows }: { rows: SeasonStanding[] }) {
  return (
    <ol className="standings">
      {rows.map((row) => (
        <li key={row.playerId}>
          <span className="rank">{row.rank}</span>
          <span className="name">{row.name}</span>
          <span className="points">{row.points}</span>
        </li>
      ))}
    </ol>
  );
}
