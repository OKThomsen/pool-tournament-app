import { PlayerName } from './PlayerName';
import { useSyncExternalStore, type CSSProperties } from 'react';
import { isPlayed, scoreFor, type PoolView } from '../poolView';
import { t } from '../strings';
import type { Match } from '../tournaments';

/**
 * Column widths in em, so the grid grows with the font on /live. Result cells are squares of
 * `cell` em: the rows are as tall as the result columns are wide (see .pool-table in the CSS).
 */
const COLUMN = { name: 9, cell: 5.5, won: 5, rank: 3.5 };

/**
 * On phones: players are numbered, the result columns are headed by those numbers instead of
 * names, and every column is narrower, so a pool of 5 fits the screen without swiping.
 */
const COMPACT_COLUMN = { name: 7.5, cell: 3, won: 2, rank: 2 };
const PHONE = '(max-width: 600px)';

function usePhone() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(PHONE);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia(PHONE).matches,
  );
}

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
 * shows the row player's score, green for a win and red for a loss. The blue title row has the
 * pool's name and race length, and each player's set score (frames won and lost) above their
 * column; wins and rank are on the right. On phones the table is compact (`COMPACT_COLUMN`).
 */
export function PoolTable({ view, names, slots, onCellClick }: PoolTableProps) {
  const { pool, standings, matchBetween } = view;
  const compact = usePhone();
  const column = compact ? COMPACT_COLUMN : COLUMN;
  const ids = pool.playerIds;
  const padding = Array.from({ length: Math.max(0, slots - ids.length) }, (_, i) => i);
  const columns = Math.max(slots, ids.length);
  const width = column.name + columns * column.cell + column.won + column.rank;
  // --width-em lets /live, and phones, scale the font so the whole table fits its column.
  const style = {
    width: `${width}em`,
    '--cell': `${column.cell}em`,
    '--width-em': width,
  } as CSSProperties;

  return (
    <div className="table-scroll">
      <table className={compact ? 'pool-table compact' : 'pool-table'} style={style}>
        <colgroup>
          <col style={{ width: `${column.name}em` }} />
          {Array.from({ length: columns }, (_, i) => (
            <col key={i} style={{ width: `${column.cell}em` }} />
          ))}
          <col style={{ width: `${column.won}em` }} />
          <col style={{ width: `${column.rank}em` }} />
        </colgroup>
        <thead>
          <tr className="pool-title">
            <th className="pool-name">
              {t.pools.pool} {pool.name}
              <small>{t.score.raceTo(pool.raceTo)}</small>
            </th>
            {ids.map((id) => {
              const row = standings.get(id)!;
              return (
                <th key={id} className="set-score" title={t.pools.setScore}>
                  {compact ? (
                    <>
                      {row.framesFor}W
                      <br />
                      {row.framesAgainst}L
                    </>
                  ) : (
                    `${row.framesFor} W - ${row.framesAgainst} L`
                  )}
                </th>
              );
            })}
            {padding.map((i) => (
              <th key={`pad-${i}`} />
            ))}
            <th />
            <th />
          </tr>
          <tr>
            <th>{t.players.name}</th>
            {ids.map((id, index) => (
              <th key={id} className="opponent" title={names.get(id)}>
                {compact ? index + 1 : <PlayerName label={names.get(id)} />}
              </th>
            ))}
            {padding.map((i) => (
              <th key={`pad-${i}`} className="opponent" />
            ))}
            <th title={t.pools.won}>{compact ? t.pools.wonShort : t.pools.won}</th>
            <th>#</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((rowId, index) => {
            const row = standings.get(rowId)!;
            return (
              <tr key={rowId}>
                <th scope="row" title={names.get(rowId)}>
                  {compact ? (
                    <span className="numbered">
                      <span className="row-number">{index + 1}</span>
                      <span className="numbered-name">
                        <PlayerName label={names.get(rowId)} />
                      </span>
                    </span>
                  ) : (
                    <PlayerName label={names.get(rowId)} />
                  )}
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
                <td className="won">{row.won}</td>
                <td className="rank" title={row.unresolvedTie ? t.pools.tied : undefined}>
                  {row.rank}
                  {row.unresolvedTie && '='}
                </td>
              </tr>
            );
          })}
          {padding.map((i) => (
            <tr key={`pad-${i}`} className="empty-row">
              {Array.from({ length: columns + 3 }, (_, j) => (
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
