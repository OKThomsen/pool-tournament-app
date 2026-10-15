import { poolSizes, todayInDenmark } from '@franks/core';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '../api';
import { Modal } from '../components/Modal';
import {
  emptyPlayerInput,
  PlayerFields,
  playerErrorMessage,
  toPlayerRequest,
} from '../components/PlayerFields';
import { matchesWordStart } from '../components/TableView';
import { useCreatePlayer, usePlayers, type Player } from '../players';
import { t } from '../strings';
import { useCreateTournament, useOngoingTournament, type GameFormat } from '../tournaments';

const FORMATS: GameFormat[] = ['8-ball', '9-ball', '10-ball'];

/** How many matches "Tilføj spiller" lists at most. */
const MAX_RESULTS = 10;

/** CreateTurnering: pick date, format and players, then "Færdiggør" draws the pools. */
export function CreateTournamentPage() {
  const navigate = useNavigate();
  const ongoing = useOngoingTournament();
  const createTournament = useCreateTournament();

  if (ongoing.data) {
    return (
      <section className="panel">
        <h1>{t.nav.newTournament}</h1>
        <p>{t.create.alreadyRunning}</p>
        <Link to={`/admin/turnering/${ongoing.data.id}`}>{t.create.goToRunning}</Link>
      </section>
    );
  }

  const error = createTournament.error;
  return (
    <EntryForm
      title={t.nav.newTournament}
      initial={{ date: todayInDenmark(), format: '8-ball', entrants: [] }}
      busy={createTournament.isPending}
      error={
        error &&
        (error instanceof ApiError && error.code === 'tournament_in_progress'
          ? t.create.alreadyRunning
          : t.saveFailed)
      }
      onSubmit={(entry) =>
        createTournament.mutate(entry, {
          onSuccess: (tournament) => navigate(`/admin/turnering/${tournament.id}`),
        })
      }
      onCancel={() => navigate('/')}
    />
  );
}

export interface Entry {
  date: string;
  format: GameFormat;
  playerIds: number[];
}

interface EntryFormProps {
  title: string;
  initial: { date: string; format: GameFormat; entrants: Player[] };
  busy: boolean;
  error?: string | null;
  /** What saving will do, shown above the buttons (for an existing tournament). */
  notice?: (playerIds: number[]) => string | null;
  onSubmit: (entry: Entry) => void;
  onCancel: () => void;
}

/**
 * Date, format and the player list, with "Færdiggør" and "Annuller". Used to create a tournament
 * and, with "Rediger spillere", to change one until the knockout starts.
 */
export function EntryForm({
  title,
  initial,
  busy,
  error,
  notice,
  onSubmit,
  onCancel,
}: EntryFormProps) {
  const [date, setDate] = useState(initial.date);
  const [format, setFormat] = useState<GameFormat>(initial.format);
  const [entrants, setEntrants] = useState<Player[]>(initial.entrants);

  const sizes = poolSizes(entrants.length);
  const playerIds = entrants.map((p) => p.id);
  const message = sizes ? notice?.(playerIds) : null;
  const add = (player: Player) =>
    setEntrants((current) =>
      current.some((p) => p.id === player.id) ? current : [...current, player],
    );

  const finish = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ date, format, playerIds });
  };

  return (
    <form className="panel create-tournament" onSubmit={finish}>
      <h1>{title}</h1>
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
      {message && <p className="notice">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={!sizes || busy}>
          {t.create.finish}
        </button>
        <button type="button" className="link" onClick={onCancel}>
          {t.create.cancel}
        </button>
      </div>
    </form>
  );
}

/**
 * "Tilføj spiller": a live search that matches the start of any word in a name, like the
 * search on Spillere ("jo" finds "Martin Johansen"). When nobody matches
 * exactly, "Tilføj ny spiller" opens a form for the new player (handicaps, Medlem), which
 * creates them and adds them in one step.
 */
function PlayerSearch({ excluded, onAdd }: { excluded: Player[]; onAdd: (p: Player) => void }) {
  const [query, setQuery] = useState('');
  const players = usePlayers();
  const [creating, setCreating] = useState(false);

  const name = query.trim();
  const results = (players.data ?? [])
    .filter((p) => matchesWordStart(p.name, name) && !excluded.some((e) => e.id === p.id))
    .slice(0, MAX_RESULTS);
  const exactMatch = (players.data ?? []).some((p) => p.name.toLowerCase() === name.toLowerCase());

  const pick = (player: Player) => {
    onAdd(player);
    setQuery('');
  };

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
          {players.isSuccess && results.length === 0 && (
            <li className="muted">{t.create.noMatch}</li>
          )}
          {players.isSuccess && !exactMatch && (
            <li>
              <button type="button" className="add-new" onClick={() => setCreating(true)}>
                {t.create.addNewPlayer}: {name}
              </button>
            </li>
          )}
        </ul>
      )}
      <NewPlayerDialog
        open={creating}
        name={name}
        onAdded={(player) => {
          setCreating(false);
          pick(player);
        }}
        onClose={() => setCreating(false)}
      />
    </div>
  );
}

/**
 * "Tilføj ny spiller": the new player's name (from the search), handicaps and membership.
 * Rendered outside the tournament form, since forms can't be nested.
 */
function NewPlayerDialog({
  open,
  name,
  onAdded,
  onClose,
}: {
  open: boolean;
  name: string;
  onAdded: (player: Player) => void;
  onClose: () => void;
}) {
  return createPortal(
    <Modal open={open} onClose={onClose}>
      <NewPlayerForm name={name} onAdded={onAdded} onClose={onClose} />
    </Modal>,
    document.body,
  );
}

function NewPlayerForm({
  name,
  onAdded,
  onClose,
}: {
  name: string;
  onAdded: (player: Player) => void;
  onClose: () => void;
}) {
  const createPlayer = useCreatePlayer();
  const [input, setInput] = useState({ ...emptyPlayerInput, name });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // React events bubble through the portal to the tournament form; don't submit that too.
    event.stopPropagation();
    createPlayer.mutate(toPlayerRequest(input), { onSuccess: onAdded });
  };

  return (
    <form onSubmit={submit}>
      <h2>{t.create.addNewPlayer}</h2>
      <div className="player-form">
        <PlayerFields input={input} onChange={setInput} />
      </div>
      {createPlayer.error && (
        <p className="error" role="alert">
          {playerErrorMessage(createPlayer.error)}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={createPlayer.isPending}>
          {t.create.addNewPlayer}
        </button>
        <button type="button" className="link" onClick={onClose}>
          {t.cancel}
        </button>
      </div>
    </form>
  );
}
