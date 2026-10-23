import { useNavigate, useParams } from 'react-router';
import { ApiError } from '../api';
import { NoSeason } from '../components/NoSeason';
import { Rank } from '../components/Standings';
import {
  ColumnLabel,
  FitTable,
  TableSearch,
  matchesWordStart,
  useTableView,
  type Column,
} from '../components/TableView';
import { formatDate } from '../format';
import {
  seasonId,
  useCurrentSeason,
  useSeason,
  useSeasons,
  type Season,
  type SeasonStanding,
} from '../seasons';
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
 * Sæson: the current season's standings at /saeson, and an earlier season's at /saeson/1-2026.
 * The picker lists the current season and every season with a concluded tournament.
 */
export function SeasonPage() {
  const { id } = useParams();
  const current = useCurrentSeason();
  const picked = useSeason(id);
  const shown = id ? picked : current;

  if (shown.isPending) return <p>{t.loading}</p>;
  if (shown.error instanceof ApiError && shown.error.status === 404) return <p>{t.notFound}</p>;
  if (shown.isError) return <p className="error">{t.loadFailed}</p>;

  const season = shown.data.season;
  const currentLabel = current.data?.season?.label;
  return (
    <section className="panel">
      <div className="season-heading">
        <h1>{season ? `${t.season.title} ${season.label}` : t.season.title}</h1>
        <SeasonPicker selected={season?.label} currentLabel={currentLabel} />
      </div>
      {!season ? (
        current.data && <NoSeason next={current.data.next} />
      ) : (
        <>
          <p className="meta">
            {formatDate(season.start)} – {formatDate(season.end)}
            {season.label !== currentLabel && ` · ${t.season.finished}`}
          </p>
          <SeasonTable standings={shown.data.standings} />
        </>
      )}
    </section>
  );
}

/** Jumps to another season; the current one lives at /saeson. */
function SeasonPicker({
  selected,
  currentLabel,
}: {
  selected: string | undefined;
  currentLabel: string | undefined;
}) {
  const seasons = useSeasons();
  const navigate = useNavigate();
  const options: Season[] = seasons.data ?? [];
  // Nothing to choose between.
  if (options.length === 0 || (options.length === 1 && options[0]!.label === selected)) {
    return null;
  }

  return (
    <select
      className="season-picker"
      aria-label={t.season.pick}
      value={selected ?? ''}
      onChange={(event) => {
        const label = event.target.value;
        navigate(label === currentLabel ? '/saeson' : `/saeson/${seasonId(label)}`);
      }}
    >
      {/* In the off-season nothing is selected until a past season is picked. */}
      {!selected && <option value="">{t.season.pick}</option>}
      {options.map((season) => (
        <option key={season.label} value={season.label}>
          {season.label}
          {season.label === currentLabel && ` (${t.season.current})`}
        </option>
      ))}
    </select>
  );
}

function SeasonTable({ standings }: { standings: SeasonStanding[] }) {
  const view = useTableView('view:saeson', standings, COLUMNS, matches);
  if (standings.length === 0) return <p>{t.season.empty}</p>;

  return (
    <>
      <TableSearch value={view.query} onChange={view.setQuery} placeholder={t.players.search} />
      <FitTable>
        <table>
          <thead>
            <tr>
              {view.header('rank', '#')}
              {view.header('name', t.players.name)}
              {view.header(
                'points',
                <ColumnLabel full={t.players.seasonPoints} short={t.short.seasonPoints} />,
              )}
              {view.header(
                'member',
                <ColumnLabel full={t.players.member} short={t.short.member} />,
              )}
              {view.header(
                'participation',
                <ColumnLabel full={t.players.participation} short={t.short.participation} />,
              )}
              {view.header('wins', <ColumnLabel full={t.players.wins} short={t.short.wins} />)}
              {view.header(
                'semifinals',
                <ColumnLabel full={t.players.semifinals} short={t.short.semifinals} />,
              )}
              {view.header(
                'quarterfinals',
                <ColumnLabel full={t.players.quarterfinals} short={t.short.quarterfinals} />,
              )}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.playerId}>
                <td className="season-rank">
                  <Rank rank={row.rank} />
                </td>
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
      </FitTable>
      {view.rows.length === 0 && <p className="muted">{t.noMatches}</p>}
    </>
  );
}
