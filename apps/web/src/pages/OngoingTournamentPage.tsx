import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api';
import { AdminLayout } from '../components/AdminPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ForFunNote, ForFunSetting } from '../components/ForFun';
import { JoinCode } from '../components/JoinCode';
import { PoolEditor } from '../components/PoolEditor';
import { RaceToInput } from '../components/RaceToInput';
import { TournamentPlay } from '../components/TournamentPlay';
import { formatDate } from '../format';
import { t } from '../strings';
import {
  hasLonePool,
  namesWithHandicap,
  POOL_RACE_MAX,
  POOL_RACE_MIN,
  poolResults,
  resultsLost,
  useDeleteTournament,
  useRandomizePools,
  useSavePools,
  useSetPoolRace,
  useStartTournament,
  useTournament,
  type Tournament,
} from '../tournaments';

/**
 * OngoingTurnering: the admin's view of the tournament in progress. The admin's tools (the join
 * code, "Rediger spillere", "Rediger puljer", "For sjov kamp", "Annuller turnering") are in the
 * admin panel beside it.
 */
export function OngoingTournamentPage() {
  const id = Number(useParams().id);
  const tournament = useTournament(id);
  // "Rediger puljer" during pool play: the pool editor replaces the pool tables while it's on.
  const [editingPools, setEditingPools] = useState(false);

  if (tournament.isPending) return <p>{t.loading}</p>;
  if (tournament.error instanceof ApiError && tournament.error.status === 404) {
    return <p>{t.notFound}</p>;
  }
  if (tournament.isError) return <p className="error">{t.loadFailed}</p>;

  const data = tournament.data;
  // A concluded tournament lives on its public page, where admins can still correct it.
  if (data.status === 'concluded') return <Navigate to={`/turneringer/${data.id}`} replace />;
  // Players and pools can change until the knockout starts.
  const beforeKnockout = data.status === 'draft' || data.status === 'pools';
  const panel = (
    <>
      <JoinCode tournamentId={data.id} />
      {beforeKnockout && (
        <div className="admin-panel-actions">
          <EditPlayersButton tournamentId={data.id} />
          {data.status === 'pools' && (
            <button
              type="button"
              className={editingPools ? 'primary' : 'secondary'}
              onClick={() => setEditingPools(!editingPools)}
            >
              {editingPools ? t.ongoing.done : t.ongoing.editPools}
            </button>
          )}
        </div>
      )}
      <ForFunSetting tournament={data} />
      <CancelTournament tournamentId={data.id} />
    </>
  );
  return (
    <section className="panel">
      <AdminLayout panel={panel}>
        <h1>
          {t.tournaments.one} {formatDate(data.date)}
        </h1>
        <p className="meta">
          {data.format} · {t.ongoing.week} {data.week} ·{' '}
          {data.season ? `${t.season.title} ${data.season}` : t.season.offSeason} ·{' '}
          {t.create.count(data.players.length)}
        </p>
        <ForFunNote tournament={data} />
        {data.status === 'draft' && <DraftPools tournament={data} />}
        {data.status === 'pools' &&
          (editingPools ? (
            <PoolsEditor tournament={data} />
          ) : (
            <TournamentPlay tournament={data} manage />
          ))}
        {data.status === 'knockout' && <TournamentPlay tournament={data} manage />}
      </AdminLayout>
    </section>
  );
}

/** "Rediger spillere": back to the player list, which keeps everyone already added. */
function EditPlayersButton({ tournamentId }: { tournamentId: number }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="secondary"
      onClick={() => navigate(`/admin/turnering/${tournamentId}/rediger`)}
    >
      {t.ongoing.editPlayers}
    </button>
  );
}

/** Before "Gå til turnering": rearrange the drawn pools, then start. */
function DraftPools({ tournament }: { tournament: Tournament }) {
  const start = useStartTournament(tournament.id);
  const [confirming, setConfirming] = useState(false);
  const races = tournament.pools
    .map((pool) => `${t.pools.pool} ${pool.name}: ${t.score.raceTo(pool.raceTo).toLowerCase()}`)
    .join(', ');

  return (
    <>
      <PoolsEditor tournament={tournament} />
      {start.error && (
        <p className="error" role="alert">
          {t.saveFailed}
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="primary"
          disabled={start.isPending || hasLonePool(tournament)}
          onClick={() => setConfirming(true)}
        >
          {t.ongoing.finalizeBrackets}
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        message={t.ongoing.confirmStart(races)}
        confirmLabel={t.ongoing.finalizeBrackets}
        cancelLabel={t.cancel}
        onConfirm={() => {
          setConfirming(false);
          start.mutate();
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

/**
 * The pools with drag and drop, each with its race length, and "Randomize". Every change is saved
 * at once; a change that would delete results asks first. A pool's race length is locked once it
 * has a result.
 */
function PoolsEditor({ tournament }: { tournament: Tournament }) {
  const savePools = useSavePools(tournament.id);
  const randomize = useRandomizePools(tournament.id);
  const setRace = useSetPoolRace(tournament.id);
  const [arrangement, setArrangement] = useState(() => tournament.pools.map((p) => p.playerIds));
  const [confirm, setConfirm] = useState<
    { kind: 'move'; next: number[][]; lost: number } | { kind: 'randomize'; lost: number } | null
  >(null);
  const names = namesWithHandicap(tournament.players);

  // Follow the server's copy when it changes (for example after saving).
  useEffect(() => setArrangement(tournament.pools.map((p) => p.playerIds)), [tournament.pools]);

  const apply = (next: number[][]) => {
    setArrangement(next);
    savePools.mutate(next);
  };
  const change = (next: number[][]) => {
    const lost = resultsLost(tournament, next);
    if (lost > 0) setConfirm({ kind: 'move', next, lost });
    else apply(next);
  };
  const shuffle = () => {
    const lost = poolResults(tournament);
    if (lost > 0) setConfirm({ kind: 'randomize', lost });
    else randomize.mutate();
  };

  const busy = savePools.isPending || randomize.isPending || setRace.isPending;
  const played = (poolId: number) =>
    tournament.matches.some((m) => m.poolId === poolId && m.framesA !== null);
  // Pools keep their place (A, B …), so the box at `index` is tournament.pools[index].
  const raceField = (index: number) => {
    const pool = tournament.pools[index];
    if (!pool) return null;
    return (
      <div className="pool-race">
        <RaceToInput
          value={pool.raceTo}
          onChange={(raceTo) => setRace.mutate({ poolId: pool.id, raceTo })}
          min={POOL_RACE_MIN}
          max={POOL_RACE_MAX}
          disabled={busy || played(pool.id)}
        />
      </div>
    );
  };

  return (
    <>
      <h2>{t.stages.pools}</h2>
      <PoolEditor
        pools={arrangement}
        names={names}
        disabled={busy}
        onChange={change}
        footer={raceField}
      />
      {tournament.pools.some((pool) => played(pool.id)) && (
        <p className="muted">{t.pools.raceLocked}</p>
      )}
      {(savePools.error || randomize.error || setRace.error) && (
        <p className="error" role="alert">
          {t.saveFailed}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="secondary" disabled={busy} onClick={shuffle}>
          {t.pools.randomize}
        </button>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        message={
          confirm?.kind === 'move'
            ? t.pools.confirmMove(confirm.lost)
            : t.pools.confirmRandomize(confirm?.lost ?? 0)
        }
        confirmLabel={confirm?.kind === 'move' ? t.ongoing.done : t.pools.randomize}
        cancelLabel={t.cancel}
        onConfirm={() => {
          if (confirm?.kind === 'move') apply(confirm.next);
          else randomize.mutate();
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

/** "Annuller turnering", at the bottom of the admin panel: deletes the tournament. */
function CancelTournament({ tournamentId }: { tournamentId: number }) {
  const navigate = useNavigate();
  const cancel = useDeleteTournament(tournamentId);
  const [confirming, setConfirming] = useState(false);
  return (
    <div>
      {cancel.error && (
        <p className="error" role="alert">
          {t.saveFailed}
        </p>
      )}
      <button
        type="button"
        className="link danger"
        disabled={cancel.isPending}
        onClick={() => setConfirming(true)}
      >
        {t.ongoing.cancelTournament}
      </button>
      <ConfirmDialog
        open={confirming}
        message={t.ongoing.confirmCancel}
        confirmLabel={t.ongoing.cancelTournament}
        cancelLabel={t.cancel}
        onConfirm={() => {
          setConfirming(false);
          cancel.mutate(undefined, { onSuccess: () => navigate('/') });
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
