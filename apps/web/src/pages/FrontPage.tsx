import { Link } from 'react-router';
import { Calendar } from '../components/Calendar';
import { Standings } from '../components/Standings';
import { NoSeason } from '../components/NoSeason';
import { useCurrentSeason } from '../seasons';
import { t } from '../strings';

const ADDRESS = 'Pantheonsgade 2, 5000 Odense';
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDRESS)}`;

/** Info about the club, with the calendar and the current season's leaderboard on the side. */
export function FrontPage() {
  return (
    <div className="columns">
      <section className="panel hero">
        <img className="wordmark" src="/brand/wordmark.png" alt={t.brand} />
        <h1>{t.frontpage.title}</h1>
        <div className="club-info">
          <h2>{t.frontpage.when}</h2>
          <p>{t.frontpage.training}</p>
          <p>{t.frontpage.tournaments}</p>
          <p>
            {t.frontpage.address}:{' '}
            <a href={MAPS_URL} target="_blank" rel="noreferrer">
              {ADDRESS}
            </a>
          </p>
        </div>
      </section>
      <div className="frontpage-side">
        <Calendar />
        <Leaderboard />
      </div>
    </div>
  );
}

function Leaderboard() {
  const season = useCurrentSeason();
  return (
    <aside className="panel scoreboard frontpage-leaderboard">
      <h2>
        <Link to="/saeson">{t.frontpage.leaderboard}</Link>
        {season.data?.season && <span className="season-label">{season.data.season.label}</span>}
      </h2>
      {season.isPending ? (
        <p>{t.loading}</p>
      ) : season.isError ? (
        <p className="error">{t.loadFailed}</p>
      ) : !season.data.season ? (
        <NoSeason next={season.data.next} />
      ) : season.data.standings.length === 0 ? (
        <p>{t.season.empty}</p>
      ) : (
        <Standings rows={season.data.standings} />
      )}
    </aside>
  );
}
