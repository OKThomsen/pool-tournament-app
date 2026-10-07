import { Link } from 'react-router';
import { useCurrentSeason } from '../seasons';
import { t } from '../strings';

/** Info about the club, with the current season's leaderboard on the side. */
export function FrontPage() {
  return (
    <div className="columns">
      <section className="panel">
        <h1>{t.frontpage.title}</h1>
        {/* The club's own text goes here; the wireframe only has placeholder copy. */}
        <p>{t.placeholder}</p>
      </section>
      <Leaderboard />
    </div>
  );
}

function Leaderboard() {
  const season = useCurrentSeason();
  return (
    <aside className="panel leaderboard">
      <h2>
        <Link to="/saeson">{t.frontpage.leaderboard}</Link>
      </h2>
      {season.isPending ? (
        <p>{t.loading}</p>
      ) : season.isError ? (
        <p className="error">{t.loadFailed}</p>
      ) : season.data.standings.length === 0 ? (
        <p>{t.season.empty}</p>
      ) : (
        <ol>
          {season.data.standings.map((row) => (
            <li key={row.playerId} value={row.rank}>
              {row.name} – {row.points}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
