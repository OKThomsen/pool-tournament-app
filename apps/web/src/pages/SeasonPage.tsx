import { formatDate } from '../format';
import { useCurrentSeason } from '../seasons';
import { t } from '../strings';

/** Sæson: the current season's standings. */
export function SeasonPage() {
  const season = useCurrentSeason();

  if (season.isPending) return <p>{t.loading}</p>;
  if (season.isError) return <p className="error">{t.loadFailed}</p>;

  const { label, start, end, standings } = season.data;
  return (
    <section className="panel">
      <h1>
        {t.season.title} {label}
      </h1>
      <p className="meta">
        {formatDate(start)} – {formatDate(end)}
      </p>
      {standings.length === 0 ? (
        <p>{t.season.empty}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t.players.name}</th>
                <th>{t.players.seasonPoints}</th>
                <th>{t.players.member}</th>
                <th>{t.players.participation}</th>
                <th>{t.players.wins}</th>
                <th>{t.players.semifinals}</th>
                <th>{t.players.quarterfinals}</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.playerId}>
                  <td>{row.rank}</td>
                  <td>{row.name}</td>
                  <td>{row.points}</td>
                  <td>{row.member ? t.yes : t.no}</td>
                  <td>{row.participation}</td>
                  <td>{row.wins}</td>
                  <td>{row.semifinals}</td>
                  <td>{row.quarterfinals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
