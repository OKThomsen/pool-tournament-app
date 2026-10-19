import { updatePools } from '@franks/core';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { t } from '../strings';
import { useEditTournament, useTournament, type Tournament } from '../tournaments';
import { EntryForm, type Entry } from './CreateTournamentPage';

/**
 * "Rediger spillere": the player list, date and format of the tournament in progress, filled in
 * as they are, until the knockout starts. "Færdiggør" goes back to the pools.
 */
export function EditTournamentPage() {
  const id = Number(useParams().id);
  const tournament = useTournament(id);

  if (tournament.isPending) return <p>{t.loading}</p>;
  if (tournament.error instanceof ApiError && tournament.error.status === 404) {
    return <p>{t.notFound}</p>;
  }
  if (tournament.isError) return <p className="error">{t.loadFailed}</p>;
  const data = tournament.data;
  if (data.status !== 'draft' && data.status !== 'pools') {
    return <Navigate to={`/admin/turnering/${data.id}`} replace />;
  }
  return <EditForm tournament={data} />;
}

/** What saving the player list will do to the pools: drawn again, or how many results go. */
function consequences(tournament: Tournament, playerIds: number[]) {
  const kept = updatePools(
    tournament.pools.map((pool) => pool.playerIds.map(String)),
    playerIds.map(String),
  );
  const played = tournament.matches.filter((m) => m.stage === 'pool' && m.framesA !== null);
  const lost = kept
    ? played.filter((m) => !playerIds.includes(m.playerAId!) || !playerIds.includes(m.playerBId!))
        .length
    : played.length;
  return { redraw: kept === null, lost };
}

function describe({ redraw, lost }: { redraw: boolean; lost: number }) {
  const parts = [redraw && t.create.redraw, lost > 0 && t.create.resultsLost(lost)];
  return parts.filter(Boolean).join(' ') || null;
}

function EditForm({ tournament }: { tournament: Tournament }) {
  const navigate = useNavigate();
  const edit = useEditTournament(tournament.id);
  const [pending, setPending] = useState<Entry | null>(null);
  const back = () => navigate(`/admin/turnering/${tournament.id}`);
  const save = (entry: Entry) => edit.mutate(entry, { onSuccess: back });

  // The list shows what the tournament has on record (Medlem on its date); the rest of a
  // player's record isn't needed here.
  const entrants = tournament.players.map((p) => ({ ...p, memberSince: null, lastAdjusted: null }));

  return (
    <>
      <EntryForm
        title={t.create.editTitle}
        initial={{
          date: tournament.date,
          format: tournament.format,
          forFun: tournament.forFun,
          entrants,
        }}
        busy={edit.isPending}
        error={edit.error && t.saveFailed}
        notice={(playerIds) => describe(consequences(tournament, playerIds))}
        onSubmit={(entry) => {
          const { redraw, lost } = consequences(tournament, entry.playerIds);
          // Ask first when results go, or the admin's own pool changes are drawn over.
          if (lost > 0 || (redraw && tournament.status === 'pools')) setPending(entry);
          else save(entry);
        }}
        onCancel={back}
      />
      <ConfirmDialog
        open={pending !== null}
        message={pending ? (describe(consequences(tournament, pending.playerIds)) ?? '') : ''}
        confirmLabel={t.create.finish}
        cancelLabel={t.cancel}
        onConfirm={() => {
          save(pending!);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
