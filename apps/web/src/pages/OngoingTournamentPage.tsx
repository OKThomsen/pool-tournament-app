import { DEFAULT_RACE_TO } from '@franks/core';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { JoinCode } from '../components/JoinCode';
import { PoolEditor } from '../components/PoolEditor';
import { RaceToInput } from '../components/RaceToInput';
import { TournamentPlay } from '../components/TournamentPlay';
import { formatDate } from '../format';
import { t } from '../strings';
import {
  POOL_RACE_MAX,
  POOL_RACE_MIN,
  useCancelTournament,
  useSavePools,
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
      <JoinCode tournamentId={data.id} />
      {data.status === 'draft' ? (
        <DraftPools tournament={data} />
      ) : (
        <TournamentPlay tournament={data} manage />
      )}
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
  const [raceTo, setRaceTo] = useState(DEFAULT_RACE_TO);
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
      <div className="player-form">
        <RaceToInput
          value={raceTo}
          onChange={setRaceTo}
          min={POOL_RACE_MIN}
          max={POOL_RACE_MAX}
          disabled={busy}
        />
      </div>
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
        message={t.ongoing.confirmStart(raceTo)}
        confirmLabel={t.ongoing.finalizeBrackets}
        cancelLabel={t.cancel}
        onConfirm={() => {
          setConfirm(null);
          start.mutate(raceTo);
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
