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
import { FitTable, ColumnLabel, matchesWordStart } from '../components/TableView';
import { useCreatePlayer, usePlayers, type Player } from '../players';
import { t } from '../strings';
import {
  useCreateTournament,
  useOngoingTournament,
  type GameFormat,
  type TournamentEntry,
} from '../tournaments';

export const FORMATS: GameFormat[] = ['8-ball', '9-ball', '10-ball'];

/** How many matches "Tilføj spiller" lists at most. */
const MAX_RESULTS = 10;

/**
 * CreateTurnering: pick date, format and players (and "For sjov kamp" for a tournament that
 * doesn't count, "Par turnering" for teams of two), then "Færdiggør" draws the pools.
 */
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
      initial={{
        date: todayInDenmark(),
        format: '8-ball',
        forFun: false,
        duo: false,
        entrants: [],
      }}
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

export type Entry = TournamentEntry;

interface EntryFormProps {
  title: string;
  /**
   * The players. In a "Par turnering" the teams follow each other: the first team's two players,
   * then the second team's, and so on.
   */
  initial: { date: string; format: GameFormat; forFun: boolean; duo: boolean; entrants: Player[] };
  busy: boolean;
  error?: string | null;
  /** What saving will do, shown above the buttons (for an existing tournament). */
  notice?: (playerIds: number[]) => string | null;
  onSubmit: (entry: Entry) => void;
  onCancel: () => void;
}

/**
 * A "Par turnering"'s places without the teams left with nobody: the players two by two, a team
 * per pair, with null for an empty place.
 */
function tidyTeams(slots: (Player | null)[]): (Player | null)[] {
  const kept: (Player | null)[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const team = slots.slice(i, i + 2);
    if (team.some((p) => p !== null)) kept.push(...team);
  }
  return kept;
}

/**
 * Date, format, "For sjov kamp", "Par turnering" and the player list, with "Færdiggør" and
 * "Annuller". Used to create a tournament and, with "Rediger spillere", to change one until the
 * knockout starts. In a "Par turnering" the list has a row per team with its two players; a
 * player added fills the first empty place, so taking someone out of a team and adding another
 * player replaces them.
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
  const [forFun, setForFun] = useState(initial.forFun);
  const [duo, setDuo] = useState(initial.duo);
  // The players in order; in a "Par turnering" two per team, with null for an empty place.
  const [slots, setSlots] = useState<(Player | null)[]>(initial.entrants);

  const chosen = slots.filter((p): p is Player => p !== null);
  const complete = chosen.length === slots.length && (!duo || slots.length % 2 === 0);
  const entrants = duo ? Math.ceil(slots.length / 2) : slots.length;
  const sizes = poolSizes(entrants);
  const playerIds = (duo ? chosen.filter((_, i) => i % 2 === 0) : chosen).map((p) => p.id);
  const partnerIds = chosen.filter((_, i) => i % 2 === 1).map((p) => p.id);
  const message = sizes && complete ? notice?.(playerIds) : null;

  const add = (player: Player) =>
    setSlots((current) => {
      if (current.some((p) => p?.id === player.id)) return current;
      const empty = current.indexOf(null);
      return empty < 0 ? [...current, player] : current.map((p, i) => (i === empty ? player : p));
    });
  const remove = (index: number) =>
    setSlots((current) =>
      duo
        ? tidyTeams(current.map((p, i) => (i === index ? null : p)))
        : current.filter((_, i) => i !== index),
    );
  // Switching on makes teams of the players two by two, in the order they were added.
  const switchDuo = (on: boolean) => {
    setDuo(on);
    setSlots(chosen);
  };

  const finish = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ date, format, playerIds, ...(duo && { partnerIds }), forFun, duo });
  };

  const place = (index: number) => {
    const player = slots[index];
    if (!player) return <span className="muted">–</span>;
    return (
      <>
        {player.name} <span className="muted">({player.baseHandicap})</span>{' '}
        <button
          type="button"
          className="link"
          aria-label={`${t.create.remove} ${player.name}`}
          title={t.create.remove}
          onClick={() => remove(index)}
        >
          ×
        </button>
      </>
    );
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
      <label className="checkbox for-fun">
        <input type="checkbox" checked={forFun} onChange={(e) => setForFun(e.target.checked)} />
        {t.forFun.label}
      </label>
      {forFun && <p className="muted">{t.forFun.help}</p>}
      <label className="checkbox for-fun">
        <input type="checkbox" checked={duo} onChange={(e) => switchDuo(e.target.checked)} />
        {t.duo.label}
      </label>
      {duo && <p className="muted">{t.duo.help}</p>}

      <PlayerSearch excluded={chosen} onAdd={add} />

      {duo ? (
        <FitTable className="entrants">
          <table className="teams">
            <thead>
              <tr>
                <th>{t.duo.player1}</th>
                <th>{t.duo.player2}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: entrants }, (_, team) => (
                <tr key={team}>
                  <td>{place(team * 2)}</td>
                  <td>{place(team * 2 + 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </FitTable>
      ) : (
        <FitTable className="entrants">
          <table>
            <thead>
              <tr>
                <th>{t.players.name}</th>
                <th>
                  <ColumnLabel full={t.players.baseHandicap} short={t.short.baseHandicap} />
                </th>
                <th>
                  <ColumnLabel full={t.players.frameHandicap} short={t.short.frameHandicap} />
                </th>
                <th>
                  <ColumnLabel full={t.players.member} short={t.short.member} />
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {chosen.map((player, i) => (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{player.baseHandicap}</td>
                  <td>{player.frameHandicap}</td>
                  <td>{player.member ? t.yes : t.no}</td>
                  <td>
                    <button type="button" className="link" onClick={() => remove(i)}>
                      {t.create.remove}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FitTable>
      )}

      <p>
        {duo
          ? `${t.duo.teams(entrants)} · ${t.create.count(chosen.length)}`
          : t.create.count(entrants)}
        {sizes && complete && ` · ${t.create.pools(sizes)}`}
        {!complete && ` · ${t.duo.incomplete}`}
        {complete && !sizes && entrants > 0 && ` · ${duo ? t.duo.tooFew : t.create.tooFew}`}
      </p>
      {message && <p className="notice">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={!sizes || !complete || busy}>
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
export function PlayerSearch({
  excluded,
  onAdd,
}: {
  excluded: Player[];
  onAdd: (p: Player) => void;
}) {
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
