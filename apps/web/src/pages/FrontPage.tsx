import { Link } from 'react-router';
import { Standings } from '../components/Standings';
import { useCurrentSeason } from '../seasons';
import { t } from '../strings';

/** Info about the club, with the current season's leaderboard on the side. */
export function FrontPage() {
  return (
    <div className="columns">
      <section className="panel hero">
        <img className="wordmark" src="/brand/wordmark.png" alt={t.brand} />
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
    <aside className="panel scoreboard">
      <h2>
        <Link to="/saeson">{t.frontpage.leaderboard}</Link>
        {season.data && <span className="season-label">{season.data.label}</span>}
      </h2>
      {season.isPending ? (
        <p>{t.loading}</p>
      ) : season.isError ? (
        <p className="error">{t.loadFailed}</p>
      ) : season.data.standings.length === 0 ? (
        <p>{t.season.empty}</p>
      ) : (
        <Standings rows={season.data.standings} />
      )}
    </aside>
  );
}
