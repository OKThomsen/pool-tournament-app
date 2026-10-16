import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../api';
import { isPlayed, poolView } from '../poolView';
import { t } from '../strings';
import {
  namesWithHandicap,
  tournamentKey,
  useClearResult,
  useConcludeTournament,
  useSetResult,
  type Match,
  type Tournament,
} from '../tournaments';
import { Bracket } from './Bracket';
import { ConfirmDialog } from './ConfirmDialog';
import { KnockoutSwap } from './KnockoutSwap';
import { PoolTable, UpNext } from './PoolTable';
import { QualifyPanel } from './QualifyPanel';
import { RacePanel } from './RacePanel';
import { ScoreDialog, type Scoring } from './ScoreDialog';
import { Toast, type ToastMessage } from './Toast';

interface TournamentPlayProps {
  tournament: Tournament;
  /**
   * Admins also complete the qualifier brackets and conclude the tournament. Players on /play
   * only enter results, each after a confirmation, and only in matches without one.
   */
  manage: boolean;
  /** Called when the API refuses a result with 401 (a player's code was replaced). */
  onUnauthorized?: () => void;
  /** Buttons at the top that jump straight to each pool (on /play, where the page gets long). */
  poolLinks?: boolean;
}

/**
 * After "finalize brackets": enter pool results; when every pool is done, "complete qualifier
 * brackets"; then enter knockout results in the bracket. Used by the admin's tournament page and
 * by players on /play.
 */
export function TournamentPlay({
  tournament,
  manage,
  onUnauthorized,
  poolLinks,
}: TournamentPlayProps) {
  const setResult = useSetResult(tournament.id);
  const clearResult = useClearResult(tournament.id);
  const queryClient = useQueryClient();
  const [scoring, setScoring] = useState<Scoring | null>(null);
  // A player's chosen score (the match's player A and B), waiting for "Ja".
  const [confirming, setConfirming] = useState<{ framesA: number; framesB: number } | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = (text: string) => setToast({ text, key: Date.now() });
  const [swapping, setSwapping] = useState(false);
  const names = namesWithHandicap(tournament.players);
  // "Næste kampe" shows names only; the handicap is already in the table above it.
  const plainNames = new Map(tournament.players.map((p) => [p.id, p.name]));
  const views = tournament.pools.map((pool) => poolView(tournament, pool));
  const slots = Math.max(...tournament.pools.map((pool) => pool.playerIds.length));
  const busy = setResult.isPending || clearResult.isPending;
  const close = () => {
    setScoring(null);
    setConfirming(null);
  };
  const inPools = tournament.status === 'pools';
  const score = (match: Match, player: number) => {
    // Once a result is in, only an admin can change it.
    if (!manage && isPlayed(match)) notify(t.score.locked);
    else setScoring({ match, player });
  };
  const onError = (error: Error) => {
    if (error instanceof ApiError && error.status === 401) {
      close();
      onUnauthorized?.();
    } else if (isLocked(error)) {
      // Someone else entered it first. Fetch the tournament to show their result.
      close();
      notify(t.score.alreadyEntered);
      queryClient.invalidateQueries({ queryKey: tournamentKey(tournament.id) });
    }
  };
  const save = (framesA: number, framesB: number) =>
    setResult.mutate(
      { matchId: scoring!.match.id, framesA, framesB },
      { onSuccess: close, onError },
    );

  const error = [setResult.error, clearResult.error].find((e) => e && !isLocked(e));
  // The final and, unless it's the final only, the third-place final.
  const deciders = tournament.matches.filter((m) => m.slot === 'FINAL' || m.slot === 'THIRD');
  const knockoutDone = deciders.length > 0 && deciders.every(isPlayed);

  return (
    <>
      {poolLinks && <PoolLinks tournament={tournament} />}
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
          {manage && (
            <div className="form-actions admin-tools">
              <button
                type="button"
                className={swapping ? 'primary' : 'secondary'}
                onClick={() => setSwapping(!swapping)}
              >
                {swapping ? t.ongoing.done : t.knockout.swap}
              </button>
            </div>
          )}
          {manage && !swapping && <RacePanel tournament={tournament} />}
          {swapping ? (
            <KnockoutSwap tournament={tournament} />
          ) : (
            <Bracket tournament={tournament} names={names} onPlayerClick={score} />
          )}
          {manage && knockoutDone && <Conclude tournament={tournament} />}
        </>
      )}
      <h2>{t.stages.pools}</h2>
      {views.map((view) => (
        <div key={view.pool.id} id={poolAnchor(view.pool.id)} className="pool-block">
          <PoolTable
            view={view}
            names={names}
            slots={slots}
            onCellClick={inPools ? score : undefined}
          />
          {inPools && <UpNext view={view} names={plainNames} />}
        </div>
      ))}
      {manage && inPools && views.every((view) => view.complete) && (
        <QualifyPanel tournament={tournament} views={views} names={names} />
      )}
      <ScoreDialog
        scoring={confirming ? null : scoring}
        names={names}
        busy={busy}
        allowClear={manage}
        onScore={(framesA, framesB) =>
          manage ? save(framesA, framesB) : setConfirming({ framesA, framesB })
        }
        onClear={() => clearResult.mutate(scoring!.match.id, { onSuccess: close, onError })}
        onClose={close}
      />
      {scoring && confirming && (
        <ConfirmDialog
          open
          message={confirmMessage(scoring, confirming, plainNames)}
          confirmLabel={t.yes}
          cancelLabel={t.score.back}
          onConfirm={() => {
            if (!busy) save(confirming.framesA, confirming.framesB);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

const poolAnchor = (poolId: number) => `pool-${poolId}`;

/** The API's answer when a player tries to change a result that's already in. */
const isLocked = (error: Error) => error instanceof ApiError && error.code === 'result_locked';

/** "… August 2 – 1 Oskar?", from the side of the player who was tapped, like the score dialog. */
function confirmMessage(
  { match, player }: Scoring,
  { framesA, framesB }: { framesA: number; framesB: number },
  names: Map<number, string>,
): string {
  const isA = match.playerAId === player;
  const opponent = isA ? match.playerBId! : match.playerAId!;
  return t.score.confirm(
    names.get(player)!,
    isA ? framesA : framesB,
    isA ? framesB : framesA,
    names.get(opponent)!,
  );
}

/** One button per pool; a tap scrolls straight to that pool. */
function PoolLinks({ tournament }: { tournament: Tournament }) {
  return (
    <nav className="pool-links" aria-label={t.pools.jumpTo}>
      {tournament.pools.map((pool) => (
        <button
          key={pool.id}
          type="button"
          onClick={() => document.getElementById(poolAnchor(pool.id))?.scrollIntoView()}
        >
          {t.pools.pool} {pool.name}
        </button>
      ))}
    </nav>
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
