import { NoSeason } from '../components/NoSeason';
import { TableSearch, matchesWordStart, useTableView, type Column } from '../components/TableView';
import { formatDate } from '../format';
import { useCurrentSeason, type SeasonStanding } from '../seasons';
import { t } from '../strings';

const COLUMNS: Column<SeasonStanding>[] = [
  { key: 'rank', value: (row) => row.rank, first: 'asc' },
  { key: 'name', value: (row) => row.name, first: 'asc' },
  { key: 'points', value: (row) => row.points },
  { key: 'member', value: (row) => row.member },
  { key: 'participation', value: (row) => row.participation },
  { key: 'wins', value: (row) => row.wins },
  { key: 'semifinals', value: (row) => row.semifinals },
  { key: 'quarterfinals', value: (row) => row.quarterfinals },
];

const matches = (row: SeasonStanding, query: string) => matchesWordStart(row.name, query);

/**
 * Sæson: the current season's standings. Every column sorts, and # keeps the season rank
 * whatever the order; the search finds players.
 */
export function SeasonPage() {
  const season = useCurrentSeason();
  const view = useTableView('view:saeson', season.data?.standings ?? [], COLUMNS, matches);

  if (season.isPending) return <p>{t.loading}</p>;
  if (season.isError) return <p className="error">{t.loadFailed}</p>;

  if (!season.data.season) {
    return (
      <section className="panel">
        <h1>{t.season.title}</h1>
        <NoSeason next={season.data.next} />
      </section>
    );
  }

  const { label, start, end } = season.data.season;
  return (
    <section className="panel">
      <h1>
        {t.season.title} {label}
      </h1>
      <p className="meta">
        {formatDate(start)} – {formatDate(end)}
      </p>
      {season.data.standings.length === 0 ? (
        <p>{t.season.empty}</p>
      ) : (
        <>
          <TableSearch value={view.query} onChange={view.setQuery} placeholder={t.players.search} />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {view.header('rank', '#')}
                  {view.header('name', t.players.name)}
                  {view.header('points', t.players.seasonPoints)}
                  {view.header('member', t.players.member)}
                  {view.header('participation', t.players.participation)}
                  {view.header('wins', t.players.wins)}
                  {view.header('semifinals', t.players.semifinals)}
                  {view.header('quarterfinals', t.players.quarterfinals)}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
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
          {view.rows.length === 0 && <p className="muted">{t.noMatches}</p>}
        </>
      )}
    </section>
  );
}
