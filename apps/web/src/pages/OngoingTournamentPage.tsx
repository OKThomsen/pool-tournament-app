import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ForFunSetting } from '../components/ForFun';
import { JoinCode } from '../components/JoinCode';
import { PoolEditor } from '../components/PoolEditor';
import { RaceToInput } from '../components/RaceToInput';
import { TournamentPlay } from '../components/TournamentPlay';
import { formatDate } from '../format';
import { t } from '../strings';
import {
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

/** OngoingTurnering: the admin's view of the tournament in progress. */
export function OngoingTournamentPage() {
  const id = Number(useParams().id);
  const tournament = useTournament(id);

  if (tournament.isPending) return <p>{t.loading}</p>;
  if (tournament.error instanceof ApiError && tournament.error.status === 404) {
    return <p>{t.notFound}</p>;
  }
  if (tournament.isError) return <p className="error">{t.loadFailed}</p>;

  const data = tournament.data;
  // A concluded tournament lives on its public page, where admins can still correct it.
  if (data.status === 'concluded') return <Navigate to={`/turneringer/${data.id}`} replace />;
  return (
    <section className="panel">
      <h1>
        {t.tournaments.one} {formatDate(data.date)}
      </h1>
      <p className="meta">
        {data.format} · {t.ongoing.week} {data.week} ·{' '}
        {data.season ? `${t.season.title} ${data.season}` : t.season.offSeason} ·{' '}
        {t.create.count(data.players.length)}
      </p>
      <ForFunSetting tournament={data} admin />
      <JoinCode tournamentId={data.id} />
      {data.status === 'draft' && <DraftPools tournament={data} />}
      {data.status === 'pools' && <PoolPlay tournament={data} />}
      {data.status === 'knockout' && (
        <>
          <TournamentPlay tournament={data} manage />
          <CancelTournament tournamentId={data.id} />
        </>
      )}
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

/** Before "Gå til turnering": rearrange the drawn pools, then start or cancel. */
function DraftPools({ tournament }: { tournament: Tournament }) {
  const navigate = useNavigate();
  const start = useStartTournament(tournament.id);
  const cancel = useDeleteTournament(tournament.id);
  const [confirm, setConfirm] = useState<'start' | 'cancel' | null>(null);
  const races = tournament.pools
    .map((pool) => `${t.pools.pool} ${pool.name}: ${t.score.raceTo(pool.raceTo).toLowerCase()}`)
    .join(', ');

  const busy = start.isPending || cancel.isPending;
  return (
    <>
      <div className="form-actions admin-tools">
        <EditPlayersButton tournamentId={tournament.id} />
      </div>
      <PoolsEditor tournament={tournament} />
      {(start.error || cancel.error) && (
        <p className="error" role="alert">
          {t.saveFailed}
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => setConfirm('start')}
        >
          {t.ongoing.finalizeBrackets}
        </button>
        <button type="button" className="link" disabled={busy} onClick={() => setConfirm('cancel')}>
          {t.ongoing.cancelTournament}
        </button>
      </div>
      <ConfirmDialog
        open={confirm === 'start'}
        message={t.ongoing.confirmStart(races)}
        confirmLabel={t.ongoing.finalizeBrackets}
        cancelLabel={t.cancel}
        onConfirm={() => {
          setConfirm(null);
          start.mutate();
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        message={t.ongoing.confirmCancel}
        confirmLabel={t.ongoing.cancelTournament}
        cancelLabel={t.cancel}
        onConfirm={() => {
          setConfirm(null);
          cancel.mutate(undefined, { onSuccess: () => navigate('/') });
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

/**
 * The pools being played. "Rediger spillere" and "Rediger puljer" stay available until the
 * knockout: the pool editor replaces the pool tables while it is open.
 */
function PoolPlay({ tournament }: { tournament: Tournament }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="form-actions admin-tools">
        <EditPlayersButton tournamentId={tournament.id} />
        <button
          type="button"
          className={editing ? 'primary' : 'secondary'}
          onClick={() => setEditing(!editing)}
        >
          {editing ? t.ongoing.done : t.ongoing.editPools}
        </button>
      </div>
      {editing ? (
        <>
          <PoolsEditor tournament={tournament} />
        </>
      ) : (
        <TournamentPlay tournament={tournament} manage />
      )}
      <CancelTournament tournamentId={tournament.id} />
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

/** "Annuller turnering" once play has started (the draft has its own, next to its buttons). */
function CancelTournament({ tournamentId }: { tournamentId: number }) {
  const navigate = useNavigate();
  const cancel = useDeleteTournament(tournamentId);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      {cancel.error && (
        <p className="error" role="alert">
          {t.saveFailed}
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="link"
          disabled={cancel.isPending}
          onClick={() => setConfirming(true)}
        >
          {t.ongoing.cancelTournament}
        </button>
      </div>
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
    </>
  );
}
