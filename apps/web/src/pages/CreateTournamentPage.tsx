import { poolSizes, todayInDenmark } from '@franks/core';
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../api';
import { useCreatePlayer, useSearchPlayers, type Player } from '../players';
import { t } from '../strings';
import { useCreateTournament, useOngoingTournament, type GameFormat } from '../tournaments';

const FORMATS: GameFormat[] = ['8-ball', '9-ball', '10-ball'];

/** The value, but only after it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** CreateTurnering: pick date, format and players, then "Færdiggør" draws the pools. */
export function CreateTournamentPage() {
  const navigate = useNavigate();
  const ongoing = useOngoingTournament();
  const createTournament = useCreateTournament();
  const [date, setDate] = useState(todayInDenmark());
  const [format, setFormat] = useState<GameFormat>('8-ball');
  const [entrants, setEntrants] = useState<Player[]>([]);

  if (ongoing.data) {
    return (
      <section className="panel">
        <h1>{t.nav.newTournament}</h1>
        <p>{t.create.alreadyRunning}</p>
        <Link to={`/admin/turnering/${ongoing.data.id}`}>{t.create.goToRunning}</Link>
      </section>
    );
  }

  const sizes = poolSizes(entrants.length);
  const add = (player: Player) =>
    setEntrants((current) =>
      current.some((p) => p.id === player.id) ? current : [...current, player],
    );

  const finish = (event: FormEvent) => {
    event.preventDefault();
    createTournament.mutate(
      { date, format, playerIds: entrants.map((p) => p.id) },
      { onSuccess: (tournament) => navigate(`/admin/turnering/${tournament.id}`) },
    );
  };

  return (
    <form className="panel create-tournament" onSubmit={finish}>
      <h1>{t.nav.newTournament}</h1>
      <div className="player-form">
        <label>
          {t.tournaments.date}
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {t.tournaments.format}
          <select value={format} onChange={(e) => setFormat(e.target.value as GameFormat)}>
            {FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>

      <PlayerSearch excluded={entrants} onAdd={add} />

      <div className="table-scroll entrants">
        <table>
          <thead>
            <tr>
              <th>{t.players.name}</th>
              <th>{t.players.baseHandicap}</th>
              <th>{t.players.frameHandicap}</th>
              <th>{t.players.member}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entrants.map((player) => (
              <tr key={player.id}>
                <td>{player.name}</td>
                <td>{player.baseHandicap}</td>
                <td>{player.frameHandicap}</td>
                <td>{player.member ? t.yes : t.no}</td>
                <td>
                  <button
                    type="button"
                    className="link"
                    onClick={() => setEntrants((all) => all.filter((p) => p.id !== player.id))}
                  >
                    {t.create.remove}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        {t.create.count(entrants.length)}
        {sizes && entrants.length > 0 && ` · ${t.create.pools(sizes)}`}
        {!sizes && entrants.length > 0 && ` · ${t.create.tooFew}`}
      </p>
      {createTournament.error && (
        <p className="error" role="alert">
          {createTournament.error instanceof ApiError &&
          createTournament.error.code === 'tournament_in_progress'
            ? t.create.alreadyRunning
            : t.saveFailed}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={!sizes || createTournament.isPending}>
          {t.create.finish}
        </button>
        <button type="button" className="link" onClick={() => navigate('/')}>
          {t.create.cancel}
        </button>
      </div>
    </form>
  );
}

/**
 * "Tilføj spiller": a live search that matches the start of a name. When nobody matches
 * exactly, "Tilføj ny spiller" creates the player and adds them in one step.
 */
function PlayerSearch({ excluded, onAdd }: { excluded: Player[]; onAdd: (p: Player) => void }) {
  const [query, setQuery] = useState('');
  const search = useSearchPlayers(useDebounced(query, 150));
  const createPlayer = useCreatePlayer();

  const name = query.trim();
  const results = (search.data ?? []).filter((p) => !excluded.some((e) => e.id === p.id));
  const exactMatch = (search.data ?? []).some((p) => p.name.toLowerCase() === name.toLowerCase());

  const pick = (player: Player) => {
    onAdd(player);
    setQuery('');
  };

  const createAndAdd = () =>
    createPlayer.mutate(
      { name, baseHandicap: 0, frameHandicap: 0, member: false },
      { onSuccess: (player) => pick(player) },
    );

  // Enter picks the first match, so a known player can be added without the mouse.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (results[0]) pick(results[0]);
  };

  return (
    <div className="player-search">
      <input
        type="search"
        placeholder={t.create.addPlayer}
        aria-label={t.create.addPlayer}
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {name && (
        <ul className="search-results">
          {results.map((player) => (
            <li key={player.id}>
              <button type="button" onClick={() => pick(player)}>
                {player.name}
              </button>
            </li>
          ))}
          {search.isSuccess && results.length === 0 && (
            <li className="muted">{t.create.noMatch}</li>
          )}
          {search.isSuccess && !exactMatch && (
            <li>
              <button
                type="button"
                className="add-new"
                disabled={createPlayer.isPending}
                onClick={createAndAdd}
              >
                {t.create.addNewPlayer}: {name}
              </button>
            </li>
          )}
        </ul>
      )}
      {createPlayer.error && (
        <p className="error" role="alert">
          {createPlayer.error instanceof ApiError && createPlayer.error.code === 'name_taken'
            ? t.players.nameTaken
            : t.saveFailed}
        </p>
      )}
    </div>
  );
}
