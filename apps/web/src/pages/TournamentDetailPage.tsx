import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api';
import { useSession } from '../auth';
import { AdminLayout } from '../components/AdminPanel';
import { Bracket } from '../components/Bracket';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ForFunNote, ForFunSetting } from '../components/ForFun';
import { PoolTable } from '../components/PoolTable';
import { ScoreDialog, type Scoring } from '../components/ScoreDialog';
import { formatDate } from '../format';
import { poolView } from '../poolView';
import { t } from '../strings';
import {
  useDeleteTournament,
  useReopenTournament,
  useSetResult,
  useTournament,
  type Match,
  type Tournament,
} from '../tournaments';

/**
 * Turneringer/Turnering: a tournament's full result — final placings, the knockout and the
 * pools. Admins can correct results here; placements and points update at once, and the admin
 * panel has "Genåbn turnering", "For sjov kamp" and "Slet turnering". An old tournament entered
 * afterwards has its placings only. A "For sjov kamp" shows no points.
 */
export function TournamentDetailPage() {
  const id = Number(useParams().id);
  const tournament = useTournament(id);
  const admin = useSession();

  if (tournament.isPending) return <p>{t.loading}</p>;
  if (tournament.error instanceof ApiError && tournament.error.status === 404) {
    return <p>{t.notFound}</p>;
  }
  if (tournament.isError) return <p className="error">{t.loadFailed}</p>;
  const data = tournament.data;
  const concluded = data.status === 'concluded';

  return (
    <section className="panel">
      <AdminLayout panel={admin && concluded ? <ConcludedAdmin tournament={data} /> : undefined}>
        <h1>
          {t.tournaments.one} {formatDate(data.date)}
        </h1>
        <p className="meta">
          {data.format} · {t.ongoing.week} {data.week} ·{' '}
          {data.season ? `${t.season.title} ${data.season}` : t.season.offSeason} ·{' '}
          {t.create.count(data.players.length)}
        </p>
        <ForFunNote tournament={data} />
        {concluded ? (
          <Concluded tournament={data} admin={Boolean(admin)} />
        ) : (
          <p>
            {t.detail.inProgress}{' '}
            <Link to={admin ? `/admin/turnering/${data.id}` : '/live'}>
              {admin ? t.create.goToRunning : t.detail.followLive}
            </Link>
          </p>
        )}
      </AdminLayout>
    </section>
  );
}

/**
 * The admin panel of a concluded tournament: how to correct it, "Genåbn turnering" (not for an
 * old tournament, which has no knockout to go back to), "For sjov kamp" and "Slet turnering".
 */
function ConcludedAdmin({ tournament }: { tournament: Tournament }) {
  const reopen = useReopenTournament(tournament.id);
  const remove = useDeleteTournament(tournament.id);
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'reopen' | 'delete' | null>(null);
  const old = tournament.historical;

  const error = reopen.error ?? remove.error;
  const message =
    error instanceof ApiError && error.code === 'tournament_in_progress'
      ? t.detail.otherInProgress
      : error && t.saveFailed;

  return (
    <>
      {!old && (
        <>
          <p className="muted small">{t.detail.correctHelp}</p>
          <div className="admin-panel-actions">
            <button
              type="button"
              className="secondary"
              disabled={reopen.isPending}
              onClick={() => setConfirm('reopen')}
            >
              {t.detail.reopen}
            </button>
          </div>
          <ForFunSetting tournament={tournament} />
        </>
      )}
      <div>
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
        <button
          type="button"
          className="link danger"
          disabled={remove.isPending}
          onClick={() => setConfirm('delete')}
        >
          {t.detail.delete}
        </button>
      </div>
      <ConfirmDialog
        open={confirm === 'reopen'}
        message={t.detail.confirmReopen}
        confirmLabel={t.detail.reopen}
        cancelLabel={t.cancel}
        onConfirm={() => {
          setConfirm(null);
          reopen.mutate(undefined);
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        message={t.detail.confirmDelete}
        confirmLabel={t.detail.delete}
        cancelLabel={t.cancel}
        onConfirm={() => {
          setConfirm(null);
          remove.mutate(undefined, { onSuccess: () => navigate('/turneringer') });
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

function Concluded({ tournament, admin }: { tournament: Tournament; admin: boolean }) {
  const setResult = useSetResult(tournament.id);
  const [scoring, setScoring] = useState<Scoring | null>(null);
  const names = new Map(tournament.players.map((p) => [p.id, p.name]));
  const slots = Math.max(...tournament.pools.map((pool) => pool.playerIds.length));
  const score = admin ? (match: Match, player: number) => setScoring({ match, player }) : undefined;
  const close = () => setScoring(null);
  const old = tournament.historical;
  // A fun tournament's points count nowhere, so they aren't shown.
  const points = !tournament.forFun;

  const error = setResult.error;
  const message =
    error instanceof ApiError &&
    (error.code === 'later_match_played' || error.code === 'would_change_qualification')
      ? t.detail.needsReopen
      : error && t.saveFailed;

  return (
    <>
      {old && <p className="muted">{t.old.entered}</p>}
      <h2>{t.detail.placings}</h2>
      <div className="table-scroll">
        <table className="placings">
          <thead>
            <tr>
              <th>{t.detail.placement}</th>
              <th>{t.players.name}</th>
              {points && <th>{t.detail.points}</th>}
              {!old && <th>{t.detail.poolWins}</th>}
            </tr>
          </thead>
          <tbody>
            {tournament.results.map((result) => (
              <tr key={result.playerId} className={`placement-${result.placement}`}>
                <td>{t.placements[result.placement]}</td>
                <td>{names.get(result.playerId)}</td>
                {points && <td>{result.points}</td>}
                {!old && <td>{result.matchesWon}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}

      {!old && (
        <>
          <h2>{t.knockout.title}</h2>
          <Bracket tournament={tournament} names={names} onPlayerClick={score} />
          <h2>{t.stages.pools}</h2>
          {tournament.pools.map((pool) => (
            <div key={pool.id} className="pool-block">
              <PoolTable
                view={poolView(tournament, pool)}
                names={names}
                slots={slots}
                onCellClick={score}
              />
            </div>
          ))}
        </>
      )}

      <ScoreDialog
        scoring={scoring}
        names={names}
        busy={setResult.isPending}
        allowClear={false}
        onScore={(framesA, framesB) =>
          setResult.mutate({ matchId: scoring!.match.id, framesA, framesB }, { onSuccess: close })
        }
        onClear={close}
        onClose={close}
      />
    </>
  );
}
