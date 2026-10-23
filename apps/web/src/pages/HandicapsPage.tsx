import { useNavigate } from 'react-router';
import { TableSearch, matchesWordStart, useTableView, type Column } from '../components/TableView';
import { formatDate } from '../format';
import { formatHandicap, formatScore, useHandicaps, type PlayerRegulation } from '../handicaps';
import { t } from '../strings';

const COLUMNS: Column<PlayerRegulation>[] = [
  { key: 'name', value: (p) => p.name, first: 'asc' },
  // The ladder: base +3 … −4, then frame 0 … −4.
  { key: 'handicap', value: (p) => p.baseHandicap + p.frameHandicap },
  { key: 'score', value: (p) => p.score },
  { key: 'expires', value: (p) => p.expires, first: 'asc' },
  { key: 'lastAdjusted', value: (p) => p.lastAdjusted },
  { key: 'pending', value: (p) => p.pending.length },
];

const matches = (player: PlayerRegulation, query: string) => matchesWordStart(player.name, query);

/**
 * Handicapregulering (admins only): every player's handicap, hidden regulation score and when it
 * was last regulated, with the recommendations waiting to be resolved. A row opens the player.
 */
export function HandicapsPage() {
  const handicaps = useHandicaps();
  const navigate = useNavigate();
  const view = useTableView('view:handicap', handicaps.data ?? [], COLUMNS, matches);

  return (
    <section className="panel">
      <h1>{t.handicaps.title}</h1>
      <p className="muted">{t.handicaps.help}</p>
      {handicaps.isPending ? (
        <p>{t.loading}</p>
      ) : handicaps.isError ? (
        <p className="error">{t.loadFailed}</p>
      ) : handicaps.data.length === 0 ? (
        <p>{t.players.none}</p>
      ) : (
        <>
          <TableSearch
            value={view.query}
            onChange={view.setQuery}
            placeholder={t.handicaps.search}
          />
          <div className="table-scroll">
            <table className="clickable">
              <thead>
                <tr>
                  {view.header('name', t.handicaps.name)}
                  {view.header('handicap', t.handicaps.handicap)}
                  {view.header('score', t.handicaps.score)}
                  {view.header('expires', t.handicaps.expires)}
                  {view.header('lastAdjusted', t.handicaps.lastAdjusted)}
                  {view.header('pending', t.handicaps.pending)}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((player) => (
                  <tr key={player.id} onClick={() => navigate(`/admin/handicap/${player.id}`)}>
                    <td>
                      <a href={`/admin/handicap/${player.id}`} onClick={(e) => e.preventDefault()}>
                        {player.name}
                      </a>
                    </td>
                    <td>{formatHandicap(player.baseHandicap, player.frameHandicap)}</td>
                    <td>{formatScore(player.score)}</td>
                    <td>{player.expires ? formatDate(player.expires) : ''}</td>
                    <td>{player.lastAdjusted ? formatDate(player.lastAdjusted) : ''}</td>
                    <td>
                      {player.pending.map((r) => (
                        <span key={r.tournamentId} className={`recommendation-tag ${r.direction}`}>
                          {r.direction === 'harder' ? t.handicaps.harder : t.handicaps.easier}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view.rows.length === 0 && <p className="muted">{t.noMatches}</p>}
        </>
      )}
    </section>
  );
}
