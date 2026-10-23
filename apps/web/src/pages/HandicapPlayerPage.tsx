import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatDate } from '../format';
import {
  formatHandicap,
  formatScore,
  usePlayerRegulation,
  useResolveRecommendation,
  type PendingRecommendation,
  type PlayerRegulationDetail,
  type RegulationStep,
} from '../handicaps';
import { t } from '../strings';

/**
 * One player's handicap regulation (admins only): the same as on Handicapregulering, the
 * recommendations to apply or dismiss, and every tournament since the first with the placement,
 * the handicap at the time and the regulation score after it, newest first.
 */
export function HandicapPlayerPage() {
  const id = Number(useParams().id);
  const regulation = usePlayerRegulation(id);

  if (regulation.isPending) return <p>{t.loading}</p>;
  if (regulation.error instanceof ApiError && regulation.error.status === 404) {
    return <p>{t.notFound}</p>;
  }
  if (regulation.isError) return <p className="error">{t.loadFailed}</p>;
  const player = regulation.data;

  return (
    <section className="panel">
      <p>
        <Link to="/admin/handicap">← {t.handicaps.back}</Link>
      </p>
      <h1>{player.name}</h1>
      <dl className="facts">
        <div>
          <dt>{t.handicaps.handicap}</dt>
          <dd>{formatHandicap(player.baseHandicap, player.frameHandicap)}</dd>
        </div>
        <div>
          <dt>{t.handicaps.score}</dt>
          <dd>{formatScore(player.score)}</dd>
        </div>
        {player.expires && (
          <div>
            <dt>{t.handicaps.expires}</dt>
            <dd>{formatDate(player.expires)}</dd>
          </div>
        )}
        <div>
          <dt>{t.handicaps.lastAdjusted}</dt>
          <dd>{player.lastAdjusted ? formatDate(player.lastAdjusted) : '–'}</dd>
        </div>
      </dl>
      {player.pending.map((recommendation) => (
        <Recommendation
          key={recommendation.tournamentId}
          player={player}
          recommendation={recommendation}
        />
      ))}
      <h2>{t.handicaps.history}</h2>
      {player.history.length === 0 ? (
        <p>{t.handicaps.noHistory}</p>
      ) : (
        <div className="table-scroll">
          <table className="regulation-history">
            <thead>
              <tr>
                <th>{t.handicaps.date}</th>
                <th>{t.handicaps.event}</th>
                <th>{t.handicaps.poolWins}</th>
                <th>{t.handicaps.handicap}</th>
                <th>{t.handicaps.change}</th>
                <th>{t.handicaps.scoreAfter}</th>
              </tr>
            </thead>
            <tbody>
              {player.history.map((step, i) => (
                <HistoryRow key={i} step={step} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Recommendation({
  player,
  recommendation,
}: {
  player: PlayerRegulationDetail;
  recommendation: PendingRecommendation;
}) {
  const resolve = useResolveRecommendation(player.id);
  const [confirm, setConfirm] = useState<'apply' | 'dismiss' | null>(null);
  const from = formatHandicap(player.baseHandicap, player.frameHandicap);
  const to =
    recommendation.next && formatHandicap(recommendation.next.base, recommendation.next.frame);

  const run = () => {
    if (confirm) resolve.mutate({ tournamentId: recommendation.tournamentId, action: confirm });
    setConfirm(null);
  };

  return (
    <div className="notice recommendation">
      <p>
        {t.handicaps.recommendation(recommendation.direction, formatDate(recommendation.date))}
        {to && `: ${from} → ${to}`}
      </p>
      {!to && <p className="muted">{t.handicaps.atLimit}</p>}
      <div className="actions">
        {to && (
          <button
            type="button"
            className="primary"
            disabled={resolve.isPending}
            onClick={() => setConfirm('apply')}
          >
            {t.handicaps.apply}
          </button>
        )}
        <button
          type="button"
          className="secondary"
          disabled={resolve.isPending}
          onClick={() => setConfirm('dismiss')}
        >
          {t.handicaps.dismiss}
        </button>
      </div>
      {resolve.error && (
        <p className="error" role="alert">
          {resolve.error instanceof ApiError && resolve.error.code === 'not_pending'
            ? t.handicaps.notPending
            : t.saveFailed}
        </p>
      )}
      <ConfirmDialog
        open={confirm !== null}
        message={
          confirm === 'apply' && to
            ? t.handicaps.confirmApply(player.name, from, to)
            : t.handicaps.confirmDismiss(player.name)
        }
        confirmLabel={confirm === 'apply' ? t.handicaps.apply : t.handicaps.dismiss}
        cancelLabel={t.cancel}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function HistoryRow({ step }: { step: RegulationStep }) {
  if (step.kind === 'tournament') {
    return (
      <tr className={step.recommendation ? 'reached' : undefined}>
        <td>
          <Link to={`/turneringer/${step.tournamentId}`}>{formatDate(step.date)}</Link>
        </td>
        <td>
          {t.placements[step.placement as keyof typeof t.placements]}
          {step.historical && <span className="muted"> ({t.handicaps.entered})</span>}
          {step.recommendation && <strong> · {t.handicaps.reached(step.recommendation)}</strong>}
        </td>
        <td>{step.poolWins ?? '–'}</td>
        <td>{formatHandicap(step.baseHandicap, step.frameHandicap)}</td>
        <td>{step.change === 0 ? '' : formatScore(step.change)}</td>
        <td>{formatScore(step.score)}</td>
      </tr>
    );
  }
  const text =
    step.kind === 'expired'
      ? t.handicaps.expired
      : step.reason === 'dismissed'
        ? t.handicaps.dismissed
        : t.handicaps[step.reason](
            formatHandicap(step.oldBase, step.oldFrame),
            formatHandicap(step.newBase, step.newFrame),
          );
  return (
    <tr className="reset">
      <td>{formatDate(step.date)}</td>
      <td colSpan={4}>{text}</td>
      <td>0</td>
    </tr>
  );
}
