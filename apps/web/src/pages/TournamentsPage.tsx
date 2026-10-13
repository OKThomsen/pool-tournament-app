import { useNavigate } from 'react-router';
import { TableSearch, matchesWordStart, useTableView, type Column } from '../components/TableView';
import { formatDate } from '../format';
import { t } from '../strings';
import { useConcludedTournaments, type TournamentSummary } from '../tournaments';

const COLUMNS: Column<TournamentSummary>[] = [
  { key: 'date', value: (row) => row.date },
  { key: 'winner', value: (row) => row.winner, first: 'asc' },
  { key: 'participants', value: (row) => row.participants },
  // 8-, 9-, 10-ball by the number of balls.
  { key: 'format', value: (row) => parseInt(row.format, 10), first: 'asc' },
];

/** The winner's name, or the date as shown ("10-2026" finds October 2026). */
function matches(row: TournamentSummary, query: string) {
  const q = query.trim();
  return matchesWordStart(row.winner ?? '', q) || formatDate(row.date).includes(q);
}

/**
 * Turneringer: concluded tournaments, newest first. A row opens the tournament. Every column
 * sorts, and the search finds a winner or a date.
 */
export function TournamentsPage() {
  const tournaments = useConcludedTournaments();
  const navigate = useNavigate();
  const view = useTableView('view:turneringer', tournaments.data ?? [], COLUMNS, matches);

  return (
    <section className="panel">
      <h1>{t.tournaments.title}</h1>
      {tournaments.isPending ? (
        <p>{t.loading}</p>
      ) : tournaments.isError ? (
        <p className="error">{t.loadFailed}</p>
      ) : tournaments.data.length === 0 ? (
        <p>{t.tournaments.none}</p>
      ) : (
        <>
          <TableSearch
            value={view.query}
            onChange={view.setQuery}
            placeholder={t.tournaments.search}
          />
          <div className="table-scroll">
            <table className="clickable">
              <thead>
                <tr>
                  {view.header('date', t.tournaments.date)}
                  {view.header('winner', t.tournaments.winner)}
                  {view.header('participants', t.tournaments.participants)}
                  {view.header('format', t.tournaments.format)}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.id} onClick={() => navigate(`/turneringer/${row.id}`)}>
                    <td>
                      <a href={`/turneringer/${row.id}`} onClick={(e) => e.preventDefault()}>
                        {formatDate(row.date)}
                      </a>
                    </td>
                    <td>{row.winner}</td>
                    <td>{row.participants}</td>
                    <td>{row.format}</td>
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
