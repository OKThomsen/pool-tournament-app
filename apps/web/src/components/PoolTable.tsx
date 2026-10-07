import { isPlayed, scoreFor, type PoolView } from '../poolView';
import { t } from '../strings';
import type { Match } from '../tournaments';

interface PoolTableProps {
  view: PoolView;
  names: Map<number, string>;
  /** Set for admins: clicking a cell enters or changes that match, from the row player's side. */
  onCellClick?: (match: Match, rowPlayer: number) => void;
}

/**
 * One pool as a matrix, like the workbook: each row is a player, read across. A played match
 * shows the row player's score, green for a win and red for a loss. The set score (frames won
 * and lost) is to the left of the name; wins and rank are on the right.
 */
export function PoolTable({ view, names, onCellClick }: PoolTableProps) {
  const { pool, standings, matchBetween } = view;
  return (
    <div className="table-scroll">
      <table className="pool-table">
        <caption>
          {t.pools.pool} {pool.name}
        </caption>
        <thead>
          <tr>
            <th className="set-score">{t.pools.setScore}</th>
            <th>{t.players.name}</th>
            {pool.playerIds.map((id) => (
              <th key={id} className="opponent">
                {names.get(id)}
              </th>
            ))}
            <th>{t.pools.won}</th>
            <th>#</th>
          </tr>
        </thead>
        <tbody>
          {pool.playerIds.map((rowId) => {
            const row = standings.get(rowId)!;
            return (
              <tr key={rowId}>
                <td className="set-score">
                  {row.framesFor} W - {row.framesAgainst} L
                </td>
                <th scope="row">{names.get(rowId)}</th>
                {pool.playerIds.map((colId) => {
                  if (colId === rowId) return <td key={colId} className="self" />;
                  const match = matchBetween(rowId, colId)!;
                  const score = isPlayed(match) ? scoreFor(match, rowId) : null;
                  const label = `${names.get(rowId)} – ${names.get(colId)}`;
                  return (
                    <td key={colId} className={score ? (score.won ? 'win' : 'loss') : ''}>
                      {onCellClick ? (
                        <button
                          type="button"
                          className="cell-button"
                          aria-label={label}
                          onClick={() => onCellClick(match, rowId)}
                        >
                          {score?.text ?? '+'}
                        </button>
                      ) : (
                        score?.text
                      )}
                    </td>
                  );
                })}
                <td>{row.won}</td>
                <td title={row.unresolvedTie ? t.pools.tied : undefined}>
                  {row.rank}
                  {row.unresolvedTie && '='}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "Up next" for pools of 3 and 5: the matches to play now and who sits out. */
export function UpNext({ view, names }: { view: PoolView; names: Map<number, string> }) {
  if (!view.scheduled) return null;
  if (view.complete) return <p className="up-next">{t.pools.complete}</p>;
  return (
    <p className="up-next">
      <strong>{t.ongoing.upNext}:</strong>{' '}
      {view.next.map((m) => `${names.get(m.playerAId!)} – ${names.get(m.playerBId!)}`).join(', ')}
      {view.sittingOut !== null && ` · ${t.pools.sittingOut}: ${names.get(view.sittingOut)}`}
    </p>
  );
}
