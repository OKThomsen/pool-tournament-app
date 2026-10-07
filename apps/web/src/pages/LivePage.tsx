import { Bracket } from '../components/Bracket';
import { PoolTable, UpNext } from '../components/PoolTable';
import { formatDate } from '../format';
import { poolView } from '../poolView';
import { useCurrentSeason } from '../seasons';
import { t } from '../strings';
import { useOngoingTournament, useTournament } from '../tournaments';

/**
 * /live: the flatscreen in the club. Public and read-only, without the site header. Updates by
 * itself through the live update stream.
 */
export function LivePage() {
  const ongoing = useOngoingTournament();
  return (
    <div className="live">
      {ongoing.data ? <LiveTournament id={ongoing.data.id} /> : ongoing.isSuccess && <Idle />}
    </div>
  );
}

function LiveTournament({ id }: { id: number }) {
  const tournament = useTournament(id);
  if (!tournament.data) return null;
  const data = tournament.data;
  const names = new Map(data.players.map((p) => [p.id, p.name]));
  const slots = Math.max(...data.pools.map((pool) => pool.playerIds.length));

  return (
    <>
      <header className="live-header">
        <h1>{t.brand}</h1>
        <p>
          {t.tournaments.one} {formatDate(data.date)} · {data.format}
        </p>
      </header>
      {data.status === 'knockout' && <Bracket tournament={data} names={names} />}
      {data.status === 'draft' ? (
        <p className="live-message">{t.live.drawing}</p>
      ) : (
        <div className="live-pools">
          {data.pools.map((pool) => {
            const view = poolView(data, pool);
            return (
              <section key={pool.id} className="pool-block">
                <PoolTable view={view} names={names} slots={slots} />
                {data.status === 'pools' && <UpNext view={view} names={names} />}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Between tournaments: the season leaderboard. */
function Idle() {
  const season = useCurrentSeason();
  return (
    <>
      <header className="live-header">
        <h1>{t.brand}</h1>
        <p>{t.live.noTournament}</p>
      </header>
      {season.data && season.data.standings.length > 0 && (
        <section className="panel live-leaderboard">
          <h2>
            {t.frontpage.leaderboard} {season.data.label}
          </h2>
          <ol>
            {season.data.standings.map((row) => (
              <li key={row.playerId} value={row.rank}>
                {row.name} – {row.points}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
