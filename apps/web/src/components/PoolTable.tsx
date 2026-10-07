import type { CSSProperties } from 'react';
import { isPlayed, scoreFor, type PoolView } from '../poolView';
import { t } from '../strings';
import type { Match } from '../tournaments';

/**
 * Column widths in em, so the grid grows with the font on /live. Result cells are squares of
 * `cell` em: the rows are as tall as the result columns are wide (see .pool-table in the CSS).
 */
const COLUMN = { setScore: 7, name: 9, cell: 5.5, won: 5, rank: 3.5 };

interface PoolTableProps {
  view: PoolView;
  names: Map<number, string>;
  /**
   * Rows and result columns to draw, normally the size of the tournament's largest pool. A
   * smaller pool gets empty rows and columns, so every pool has the same size and lines up.
   */
  slots: number;
  /** Set for admins: clicking a cell enters or changes that match, from the row player's side. */
  onCellClick?: (match: Match, rowPlayer: number) => void;
}

/**
 * One pool as a matrix, like the workbook: each row is a player, read across. A played match
 * shows the row player's score, green for a win and red for a loss. The set score (frames won
 * and lost) is to the left of the name; wins and rank are on the right.
 */
export function PoolTable({ view, names, slots, onCellClick }: PoolTableProps) {
  const { pool, standings, matchBetween } = view;
  const ids = pool.playerIds;
  const padding = Array.from({ length: Math.max(0, slots - ids.length) }, (_, i) => i);
  const columns = Math.max(slots, ids.length);
  const width = COLUMN.setScore + COLUMN.name + columns * COLUMN.cell + COLUMN.won + COLUMN.rank;
  const style = { width: `${width}em`, '--cell': `${COLUMN.cell}em` } as CSSProperties;

  return (
    <div className="table-scroll">
      <table className="pool-table" style={style}>
        <caption>
          {t.pools.pool} {pool.name}
        </caption>
        <colgroup>
          <col style={{ width: `${COLUMN.setScore}em` }} />
          <col style={{ width: `${COLUMN.name}em` }} />
          {Array.from({ length: columns }, (_, i) => (
            <col key={i} style={{ width: `${COLUMN.cell}em` }} />
          ))}
          <col style={{ width: `${COLUMN.won}em` }} />
          <col style={{ width: `${COLUMN.rank}em` }} />
        </colgroup>
        <thead>
          <tr>
            <th className="set-score">{t.pools.setScore}</th>
            <th>{t.players.name}</th>
            {ids.map((id) => (
              <th key={id} className="opponent" title={names.get(id)}>
                {names.get(id)}
              </th>
            ))}
            {padding.map((i) => (
              <th key={`pad-${i}`} className="opponent" />
            ))}
            <th>{t.pools.won}</th>
            <th>#</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((rowId) => {
            const row = standings.get(rowId)!;
            return (
              <tr key={rowId}>
                <td className="set-score">
                  {row.framesFor} W - {row.framesAgainst} L
                </td>
                <th scope="row" title={names.get(rowId)}>
                  {names.get(rowId)}
                </th>
                {ids.map((colId) => {
                  if (colId === rowId) return <td key={colId} className="self" />;
                  const match = matchBetween(rowId, colId)!;
                  const score = isPlayed(match) ? scoreFor(match, rowId) : null;
                  const label = `${names.get(rowId)} – ${names.get(colId)}`;
                  return (
                    <td
                      key={colId}
                      className={`result ${score ? (score.won ? 'win' : 'loss') : ''}`}
                    >
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
                {padding.map((i) => (
                  <td key={`pad-${i}`} className="empty" />
                ))}
                <td>{row.won}</td>
                <td title={row.unresolvedTie ? t.pools.tied : undefined}>
                  {row.rank}
                  {row.unresolvedTie && '='}
                </td>
              </tr>
            );
          })}
          {padding.map((i) => (
            <tr key={`pad-${i}`} className="empty-row">
              {Array.from({ length: columns + 4 }, (_, j) => (
                <td key={j} className="empty" />
              ))}
            </tr>
          ))}
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
