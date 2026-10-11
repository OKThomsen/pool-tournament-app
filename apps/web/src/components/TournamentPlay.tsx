import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../api';
import { isPlayed, poolView } from '../poolView';
import { t } from '../strings';
import {
  useClearResult,
  useConcludeTournament,
  useSetResult,
  type Match,
  type Tournament,
} from '../tournaments';
import { Bracket } from './Bracket';
import { ConfirmDialog } from './ConfirmDialog';
import { PoolTable, UpNext } from './PoolTable';
import { QualifyPanel } from './QualifyPanel';
import { RacePanel } from './RacePanel';
import { ScoreDialog, type Scoring } from './ScoreDialog';

interface TournamentPlayProps {
  tournament: Tournament;
  /**
   * Admins also complete the qualifier brackets and conclude the tournament. Players on /play
   * only enter results.
   */
  manage: boolean;
  /** Called when the API refuses a result with 401 (a player's code was replaced). */
  onUnauthorized?: () => void;
}

/**
 * After "finalize brackets": enter pool results; when every pool is done, "complete qualifier
 * brackets"; then enter knockout results in the bracket. Used by the admin's tournament page and
 * by players on /play.
 */
export function TournamentPlay({ tournament, manage, onUnauthorized }: TournamentPlayProps) {
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
  const onError = (error: Error) => {
    if (error instanceof ApiError && error.status === 401) {
      close();
      onUnauthorized?.();
    }
  };

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
          {manage && <RacePanel tournament={tournament} />}
          <Bracket tournament={tournament} names={names} onPlayerClick={score} />
          {manage && knockoutDone && <Conclude tournament={tournament} />}
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
      {manage && inPools && views.every((view) => view.complete) && (
        <QualifyPanel tournament={tournament} views={views} names={names} />
      )}
      <ScoreDialog
        scoring={scoring}
        names={names}
        busy={busy}
        onScore={(framesA, framesB) =>
          setResult.mutate(
            { matchId: scoring!.match.id, framesA, framesB },
            { onSuccess: close, onError },
          )
        }
        onClear={() => clearResult.mutate(scoring!.match.id, { onSuccess: close, onError })}
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
