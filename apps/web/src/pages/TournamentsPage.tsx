import { useNavigate } from 'react-router';
import { formatDate } from '../format';
import { t } from '../strings';
import { useConcludedTournaments } from '../tournaments';

/** Turneringer: concluded tournaments, newest first. A row opens the tournament. */
export function TournamentsPage() {
  const tournaments = useConcludedTournaments();
  const navigate = useNavigate();

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
        <div className="table-scroll">
          <table className="clickable">
            <thead>
              <tr>
                <th>{t.tournaments.date}</th>
                <th>{t.tournaments.winner}</th>
                <th>{t.tournaments.participants}</th>
                <th>{t.tournaments.format}</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.data.map((row) => (
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
      )}
    </section>
  );
}
