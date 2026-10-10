import { todayInDenmark } from '@franks/core';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api';
import { useSession } from '../auth';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  useCreatePlayer,
  useDeletePlayer,
  usePlayers,
  useUpdatePlayer,
  type PlayerInput,
  type PlayerWithStats,
} from '../players';
import { t } from '../strings';

/**
 * Spillere: every registered player. Admins can also add, edit and delete players here.
 * Sæsonpoint is left out in the off-season, when there is no current season.
 */
export function PlayersPage() {
  const admin = useSession();
  const players = usePlayers();
  const inSeason = players.data?.some((player) => player.seasonPoints !== null) ?? false;
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<PlayerWithStats | null>(null);
  const deletePlayer = useDeletePlayer();

  const confirmDelete = () => {
    if (deleting) deletePlayer.mutate(deleting.id);
    setDeleting(null);
  };

  return (
    <section className="panel">
      <h1>{t.players.title}</h1>
      {admin && <AddPlayerForm />}
      {deletePlayer.error && (
        <p className="error" role="alert">
          {errorMessage(deletePlayer.error)}
        </p>
      )}
      {players.isPending ? (
        <p>{t.loading}</p>
      ) : players.isError ? (
        <p className="error">{t.loadFailed}</p>
      ) : players.data.length === 0 ? (
        <p>{t.players.none}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t.players.name}</th>
                <th>{t.players.baseHandicap}</th>
                <th>{t.players.frameHandicap}</th>
                <th>{t.players.member}</th>
                {inSeason && <th>{t.players.seasonPoints}</th>}
                <th>{t.players.participation}</th>
                <th>{t.players.wins}</th>
                <th>{t.players.semifinals}</th>
                <th>{t.players.quarterfinals}</th>
                {admin && <th />}
              </tr>
            </thead>
            <tbody>
              {players.data.map((player) =>
                editingId === player.id ? (
                  <EditPlayerRow
                    key={player.id}
                    player={player}
                    onDone={() => setEditingId(null)}
                  />
                ) : (
                  <tr key={player.id}>
                    <td>{player.name}</td>
                    <td>{player.baseHandicap}</td>
                    <td>{player.frameHandicap}</td>
                    <td>{player.member ? t.yes : t.no}</td>
                    {inSeason && <td>{player.seasonPoints}</td>}
                    <td>{player.participation}</td>
                    <td>{player.wins}</td>
                    <td>{player.semifinals}</td>
                    <td>{player.quarterfinals}</td>
                    {admin && (
                      <td className="actions">
                        <button
                          type="button"
                          className="link"
                          onClick={() => setEditingId(player.id)}
                        >
                          {t.players.edit}
                        </button>
                        <button type="button" className="link" onClick={() => setDeleting(player)}>
                          {t.players.delete}
                        </button>
                      </td>
                    )}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={deleting !== null}
        message={deleting ? t.players.confirmDelete(deleting.name) : ''}
        confirmLabel={t.players.delete}
        cancelLabel={t.cancel}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}

function errorMessage(error: Error): string {
  if (error instanceof ApiError && error.code === 'name_taken') return t.players.nameTaken;
  if (error instanceof ApiError && error.code === 'member_since_in_future') {
    return t.players.memberSinceFuture;
  }
  if (error instanceof ApiError && error.code === 'player_has_tournaments') {
    return t.players.hasTournaments;
  }
  return t.saveFailed;
}

const emptyInput: PlayerInput = { name: '', baseHandicap: 0, frameHandicap: 0, member: false };

/** The start date only goes with `member: true`; left empty, the server uses today. */
function toRequest({ memberSince, ...input }: PlayerInput): PlayerInput {
  return input.member && memberSince ? { ...input, memberSince } : input;
}

function AddPlayerForm() {
  const createPlayer = useCreatePlayer();
  const [input, setInput] = useState(emptyInput);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createPlayer.mutate(toRequest(input), { onSuccess: () => setInput(emptyInput) });
  };

  return (
    <form className="player-form" onSubmit={submit}>
      <PlayerFields input={input} onChange={setInput} />
      <button type="submit" className="primary" disabled={createPlayer.isPending}>
        {t.create.addNewPlayer}
      </button>
      {createPlayer.error && (
        <p className="error" role="alert">
          {errorMessage(createPlayer.error)}
        </p>
      )}
    </form>
  );
}

function EditPlayerRow({ player, onDone }: { player: PlayerWithStats; onDone: () => void }) {
  const updatePlayer = useUpdatePlayer();
  const [input, setInput] = useState<PlayerInput>({
    name: player.name,
    baseHandicap: player.baseHandicap,
    frameHandicap: player.frameHandicap,
    member: player.member,
    memberSince: player.memberSince ?? undefined,
  });

  const save = (event: FormEvent) => {
    event.preventDefault();
    updatePlayer.mutate({ id: player.id, ...toRequest(input) }, { onSuccess: onDone });
  };

  return (
    <tr>
      <td colSpan={10}>
        <form className="player-form" onSubmit={save}>
          <PlayerFields input={input} onChange={setInput} />
          <button type="submit" className="primary" disabled={updatePlayer.isPending}>
            {t.save}
          </button>
          <button type="button" className="link" onClick={onDone}>
            {t.cancel}
          </button>
          {updatePlayer.error && (
            <p className="error" role="alert">
              {errorMessage(updatePlayer.error)}
            </p>
          )}
        </form>
      </td>
    </tr>
  );
}

function PlayerFields({
  input,
  onChange,
}: {
  input: PlayerInput;
  onChange: (input: PlayerInput) => void;
}) {
  const today = todayInDenmark();
  return (
    <>
      <label>
        {t.players.name}
        <input
          required
          maxLength={60}
          value={input.name}
          onChange={(event) => onChange({ ...input, name: event.target.value })}
        />
      </label>
      <label>
        {t.players.baseHandicap}
        <input
          type="number"
          required
          min={-20}
          max={20}
          value={input.baseHandicap}
          onChange={(event) => onChange({ ...input, baseHandicap: Number(event.target.value) })}
        />
      </label>
      <label>
        {t.players.frameHandicap}
        <input
          type="number"
          required
          min={-20}
          max={20}
          value={input.frameHandicap}
          onChange={(event) => onChange({ ...input, frameHandicap: Number(event.target.value) })}
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={input.member}
          onChange={(event) => onChange({ ...input, member: event.target.checked })}
        />
        {t.players.member}
      </label>
      {input.member && (
        <label>
          {t.players.memberSince}
          <input
            type="date"
            max={today}
            value={input.memberSince ?? today}
            onChange={(event) => onChange({ ...input, memberSince: event.target.value })}
          />
        </label>
      )}
    </>
  );
}
