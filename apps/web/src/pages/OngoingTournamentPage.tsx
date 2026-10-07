import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api';
import { Bracket } from '../components/Bracket';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PoolEditor } from '../components/PoolEditor';
import { PoolTable, UpNext } from '../components/PoolTable';
import { QualifyPanel } from '../components/QualifyPanel';
import { ScoreDialog, type Scoring } from '../components/ScoreDialog';
import { formatDate } from '../format';
import { isPlayed, poolView } from '../poolView';
import { t } from '../strings';
import {
  useCancelTournament,
  useClearResult,
  useConcludeTournament,
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
  // A concluded tournament lives on its public page, where admins can still correct it.
  if (data.status === 'concluded') return <Navigate to={`/turneringer/${data.id}`} replace />;
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

/**
 * After "finalize brackets": enter pool results; when every pool is done, "complete qualifier
 * brackets"; then enter knockout results in the bracket.
 */
function PoolPlay({ tournament }: { tournament: Tournament }) {
  const setResult = useSetResult(tournament.id);
  const clearResult = useClearResult(tournament.id);
  const [scoring, setScoring] = useState<Scoring | null>(null);
  const names = new Map(tournament.players.map((p) => [p.id, p.name]));
  const views = tournament.pools.map((pool) => poolView(tournament, pool));
  const slots = Math.max(...tournament.pools.map((pool) => pool.playerIds.length));
  const busy = setResult.isPending || clearResult.isPending;
  const close = () => setScoring(null);
  const inPools = tournament.status === 'pools';
  const score = (match: Match, player: number) => setScoring({ match, player });

  const error = setResult.error ?? clearResult.error;
  const knockoutDone = ['FINAL', 'THIRD'].every((slot) => {
    const match = tournament.matches.find((m) => m.slot === slot);
    return match && isPlayed(match);
  });

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error instanceof ApiError && error.code === 'later_match_played'
            ? t.knockout.laterPlayed
            : t.saveFailed}
        </p>
      )}
      {tournament.status === 'knockout' && (
        <>
          <h2>{t.knockout.title}</h2>
          <Bracket tournament={tournament} names={names} onPlayerClick={score} />
          {knockoutDone && <Conclude tournament={tournament} />}
        </>
      )}
      <h2>{t.stages.pools}</h2>
      {views.map((view) => (
        <div key={view.pool.id} className="pool-block">
          <PoolTable
            view={view}
            names={names}
            slots={slots}
            onCellClick={inPools ? score : undefined}
          />
          {inPools && <UpNext view={view} names={names} />}
        </div>
      ))}
      {inPools && views.every((view) => view.complete) && (
        <QualifyPanel tournament={tournament} views={views} names={names} />
      )}
      <ScoreDialog
        scoring={scoring}
        names={names}
        busy={busy}
        onScore={(framesA, framesB) =>
          setResult.mutate({ matchId: scoring!.match.id, framesA, framesB }, { onSuccess: close })
        }
        onClear={() => clearResult.mutate(scoring!.match.id, { onSuccess: close })}
        onClose={close}
      />
    </>
  );
}

/** "conclude tournament": saves placements and points, then shows the finished tournament. */
function Conclude({ tournament }: { tournament: Tournament }) {
  const conclude = useConcludeTournament(tournament.id);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="notice">
      <p>{t.knockout.done}</p>
      {conclude.error && (
        <p className="error" role="alert">
          {t.saveFailed}
        </p>
      )}
      <button
        type="button"
        className="primary"
        disabled={conclude.isPending}
        onClick={() => setConfirming(true)}
      >
        {t.ongoing.concludeTournament}
      </button>
      <ConfirmDialog
        open={confirming}
        message={t.ongoing.confirmConclude}
        confirmLabel={t.ongoing.concludeTournament}
        cancelLabel={t.cancel}
        onConfirm={() => {
          setConfirming(false);
          conclude.mutate(undefined, {
            onSuccess: () => navigate(`/turneringer/${tournament.id}`),
          });
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
