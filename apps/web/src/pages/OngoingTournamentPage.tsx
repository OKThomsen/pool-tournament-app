import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PoolEditor } from '../components/PoolEditor';
import { PoolTable, UpNext } from '../components/PoolTable';
import { ScoreDialog } from '../components/ScoreDialog';
import { formatDate } from '../format';
import { poolView } from '../poolView';
import { t } from '../strings';
import {
  useCancelTournament,
  useClearResult,
  useSavePools,
  useSetResult,
  useStartTournament,
  useTournament,
  type Match,
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
  return (
    <section className="panel">
      <h1>
        {t.tournaments.title} {formatDate(data.date)}
      </h1>
      <p>
        {data.format} · {t.ongoing.week} {data.week} · {t.season.title} {data.season} ·{' '}
        {t.create.count(data.players.length)}
      </p>
      {data.status === 'draft' ? <DraftPools tournament={data} /> : <PoolPlay tournament={data} />}
    </section>
  );
}

/** Before "finalize brackets": rearrange the drawn pools, then start or cancel. */
function DraftPools({ tournament }: { tournament: Tournament }) {
  const navigate = useNavigate();
  const savePools = useSavePools(tournament.id);
  const start = useStartTournament(tournament.id);
  const cancel = useCancelTournament(tournament.id);
  const [arrangement, setArrangement] = useState(() => tournament.pools.map((p) => p.playerIds));
  const [confirm, setConfirm] = useState<'start' | 'cancel' | null>(null);
  const names = new Map(tournament.players.map((p) => [p.id, p.name]));

  // Follow the server's copy when it changes (for example after saving).
  useEffect(() => setArrangement(tournament.pools.map((p) => p.playerIds)), [tournament.pools]);

  const change = (next: number[][]) => {
    setArrangement(next);
    savePools.mutate(next);
  };

  const busy = savePools.isPending || start.isPending || cancel.isPending;
  return (
    <>
      <h2>{t.stages.pools}</h2>
      <PoolEditor pools={arrangement} names={names} disabled={busy} onChange={change} />
      {(savePools.error || start.error || cancel.error) && (
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
        message={t.ongoing.confirmStart}
        confirmLabel={t.ongoing.finalizeBrackets}
        cancelLabel={t.cancel}
        onConfirm={() => {
          setConfirm(null);
          start.mutate(undefined);
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

/** After "finalize brackets": enter results in the pool tables. */
function PoolPlay({ tournament }: { tournament: Tournament }) {
  const setResult = useSetResult(tournament.id);
  const clearResult = useClearResult(tournament.id);
  const [scoring, setScoring] = useState<Match | null>(null);
  const names = new Map(tournament.players.map((p) => [p.id, p.name]));
  const views = tournament.pools.map((pool) => poolView(tournament, pool));
  const busy = setResult.isPending || clearResult.isPending;
  const close = () => setScoring(null);

  return (
    <>
      <h2>{t.stages.pools}</h2>
      {(setResult.error || clearResult.error) && (
        <p className="error" role="alert">
          {t.saveFailed}
        </p>
      )}
      {views.map((view) => (
        <div key={view.pool.id} className="pool-block">
          <PoolTable view={view} names={names} onCellClick={setScoring} />
          <UpNext view={view} names={names} />
        </div>
      ))}
      {views.every((view) => view.complete) && <p className="notice">{t.pools.allComplete}</p>}
      <ScoreDialog
        match={scoring}
        names={names}
        busy={busy}
        onScore={(framesA, framesB) =>
          setResult.mutate({ matchId: scoring!.id, framesA, framesB }, { onSuccess: close })
        }
        onClear={() => clearResult.mutate(scoring!.id, { onSuccess: close })}
        onClose={close}
      />
    </>
  );
}
