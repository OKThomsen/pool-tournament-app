import type { ReactNode } from 'react';
import { Bracket } from '../components/Bracket';
import { PoolTable, UpNext } from '../components/PoolTable';
import { Standings } from '../components/Standings';
import { formatDate } from '../format';
import { poolView } from '../poolView';
import { useCurrentSeason } from '../seasons';
import { t } from '../strings';
import { useOngoingTournament, useTournament } from '../tournaments';

/**
 * /live: the flatscreen in the club. Public and read-only, without the site header, in the dark
 * theme (less glare in a dim bar). Updates by itself through the live update stream.
 */
export function LivePage() {
  const ongoing = useOngoingTournament();
  return (
    <div className="live theme-dark">
      {ongoing.data ? <LiveTournament id={ongoing.data.id} /> : ongoing.isSuccess && <Idle />}
    </div>
  );
}

/** The logo, a "Live" badge, and what is on. */
function LiveHeader({ children }: { children: ReactNode }) {
  return (
    <header className="live-header">
      <img src="/brand/roundel.png" alt="" />
      <h1>{t.brand}</h1>
      <span className="live-badge">{t.live.badge}</span>
      <p>{children}</p>
    </header>
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
      <LiveHeader>
        {t.tournaments.one} {formatDate(data.date)} · {data.format}
      </LiveHeader>
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
      <LiveHeader>{t.live.noTournament}</LiveHeader>
      {season.data && season.data.standings.length > 0 && (
        <section className="panel scoreboard live-leaderboard">
          <h2>
            {t.frontpage.leaderboard}
            <span className="season-label">{season.data.label}</span>
          </h2>
          <Standings rows={season.data.standings} />
        </section>
      )}
    </>
  );
}
