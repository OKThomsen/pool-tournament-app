import { useState, type FormEvent } from 'react';
import { useSession } from '../auth';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  emptyPlayerInput,
  PlayerFields,
  playerErrorMessage,
  toPlayerRequest,
} from '../components/PlayerFields';
import { TableSearch, matchesWordStart, useTableView, type Column } from '../components/TableView';
import {
  useCreatePlayer,
  useDeletePlayer,
  usePlayers,
  useUpdatePlayer,
  type PlayerInput,
  type PlayerWithStats,
} from '../players';
import { t } from '../strings';

const COLUMNS: Column<PlayerWithStats>[] = [
  { key: 'name', value: (p) => p.name, first: 'asc' },
  { key: 'baseHandicap', value: (p) => p.baseHandicap },
  { key: 'frameHandicap', value: (p) => p.frameHandicap },
  { key: 'member', value: (p) => p.member },
  { key: 'seasonPoints', value: (p) => p.seasonPoints },
  { key: 'participation', value: (p) => p.participation },
  { key: 'wins', value: (p) => p.wins },
  { key: 'semifinals', value: (p) => p.semifinals },
  { key: 'quarterfinals', value: (p) => p.quarterfinals },
];

const matches = (player: PlayerWithStats, query: string) => matchesWordStart(player.name, query);

/**
 * Spillere: every registered player. Every column sorts, and the search finds players. Admins can also add, edit and delete players here.
 * Sæsonpoint is left out in the off-season, when there is no current season.
 */
export function PlayersPage() {
  const admin = useSession();
  const players = usePlayers();
  const inSeason = players.data?.some((player) => player.seasonPoints !== null) ?? false;
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<PlayerWithStats | null>(null);
  const deletePlayer = useDeletePlayer();
  const view = useTableView('view:spillere', players.data ?? [], COLUMNS, matches);

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
          {playerErrorMessage(deletePlayer.error)}
        </p>
      )}
      {players.isPending ? (
        <p>{t.loading}</p>
      ) : players.isError ? (
        <p className="error">{t.loadFailed}</p>
      ) : players.data.length === 0 ? (
        <p>{t.players.none}</p>
      ) : (
        <>
          <TableSearch value={view.query} onChange={view.setQuery} placeholder={t.players.search} />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {view.header('name', t.players.name)}
                  {view.header('baseHandicap', t.players.baseHandicap)}
                  {view.header('frameHandicap', t.players.frameHandicap)}
                  {view.header('member', t.players.member)}
                  {inSeason && view.header('seasonPoints', t.players.seasonPoints)}
                  {view.header('participation', t.players.participation)}
                  {view.header('wins', t.players.wins)}
                  {view.header('semifinals', t.players.semifinals)}
                  {view.header('quarterfinals', t.players.quarterfinals)}
                  {admin && <th />}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((player) =>
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
                          <button
                            type="button"
                            className="link"
                            onClick={() => setDeleting(player)}
                          >
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
          {view.rows.length === 0 && <p className="muted">{t.noMatches}</p>}
        </>
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

function AddPlayerForm() {
  const createPlayer = useCreatePlayer();
  const [input, setInput] = useState(emptyPlayerInput);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createPlayer.mutate(toPlayerRequest(input), { onSuccess: () => setInput(emptyPlayerInput) });
  };

  return (
    <form className="player-form" onSubmit={submit}>
      <PlayerFields input={input} onChange={setInput} />
      <button type="submit" className="primary" disabled={createPlayer.isPending}>
        {t.create.addNewPlayer}
      </button>
      {createPlayer.error && (
        <p className="error" role="alert">
          {playerErrorMessage(createPlayer.error)}
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
    updatePlayer.mutate({ id: player.id, ...toPlayerRequest(input) }, { onSuccess: onDone });
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
              {playerErrorMessage(updatePlayer.error)}
            </p>
          )}
        </form>
      </td>
    </tr>
  );
}
