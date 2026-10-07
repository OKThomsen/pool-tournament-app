import {
  DEFAULT_RACE_TO,
  qualifyFromPools,
  suggestedKnockoutSize,
  UnsupportedQualificationError,
  type KnockoutSize,
} from '@franks/core';
import { useState } from 'react';
import { ApiError } from '../api';
import type { PoolView } from '../poolView';
import { t } from '../strings';
import { useSetPoolTiebreak, useStartKnockout, type Tournament } from '../tournaments';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * "complete qualifier brackets": choose quarterfinals or semifinals and the race length, see who
 * qualifies (worked out with the same core rules the server uses), and settle any tie that
 * decides who goes through before confirming.
 */
export function QualifyPanel({
  tournament,
  views,
  names,
}: {
  tournament: Tournament;
  views: PoolView[];
  names: Map<number, string>;
}) {
  const playerCount = tournament.players.length;
  const sizes = ([8, 4] as const).filter((size) => size <= playerCount);
  const [size, setSize] = useState<KnockoutSize>(() =>
    Math.min(suggestedKnockoutSize(playerCount), sizes[0] ?? 4) === 8 ? 8 : 4,
  );
  const [raceTo, setRaceTo] = useState(DEFAULT_RACE_TO);
  // The admin's order for players tied across pools at the cut-off.
  const [crossPoolOrder, setCrossPoolOrder] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const setTiebreak = useSetPoolTiebreak(tournament.id);
  const startKnockout = useStartKnockout(tournament.id);

  let preview: { qualifiers: number[]; ties: number[][] } | null = null;
  try {
    const standings = views.map((view) => [...view.standings.values()]);
    const result = qualifyFromPools(standings, size, crossPoolOrder.map(String));
    preview = {
      qualifiers: result.qualifiers.map((row) => Number(row.playerId)),
      ties: result.unresolved.map((group) => group.map(Number)),
    };
  } catch (error) {
    if (!(error instanceof UnsupportedQualificationError)) throw error;
  }

  const poolOf = (player: number) => views.find((v) => v.pool.playerIds.includes(player))!.pool;
  const settle = (group: number[], order: number[]) => {
    const pool = poolOf(group[0]!);
    if (group.every((p) => poolOf(p).id === pool.id)) {
      setTiebreak.mutate({ poolId: pool.id, playerIds: order });
    } else {
      setCrossPoolOrder((current) => [...current.filter((p) => !order.includes(p)), ...order]);
    }
  };

  const ready = preview !== null && preview.ties.length === 0;
  return (
    <section className="qualify">
      <h2>{t.ongoing.completeQualifiers}</h2>
      <div className="player-form">
        <fieldset className="choice">
          <legend>{t.qualify.knockout}</legend>
          {sizes.map((option) => (
            <label key={option} className="checkbox">
              <input
                type="radio"
                name="size"
                checked={size === option}
                onChange={() => setSize(option)}
              />
              {option === 8 ? t.qualify.quarterfinals : t.qualify.semifinals}
            </label>
          ))}
        </fieldset>
        <label>
          {t.qualify.raceTo}
          <input
            type="number"
            min={1}
            max={15}
            required
            value={raceTo}
            onChange={(e) => setRaceTo(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
      </div>

      {preview === null ? (
        <p className="error">{t.qualify.cannot}</p>
      ) : (
        <>
          {preview.ties.map((group) => (
            <TieResolver
              key={group.join()}
              group={group}
              names={names}
              busy={setTiebreak.isPending}
              onSettle={(order) => settle(group, order)}
            />
          ))}
          {preview.ties.length === 0 && (
            <>
              <p>{t.qualify.qualifiers(preview.qualifiers.length)}</p>
              <ol className="qualifiers">
                {preview.qualifiers.map((id) => (
                  <li key={id}>
                    {names.get(id)}{' '}
                    <span className="muted">
                      ({t.pools.pool} {poolOf(id).name})
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}

      {startKnockout.error && (
        <p className="error" role="alert">
          {startKnockout.error instanceof ApiError && startKnockout.error.code === 'unresolved_ties'
            ? t.qualify.tiesLeft
            : t.saveFailed}
        </p>
      )}
      <button
        type="button"
        className="primary"
        disabled={!ready || startKnockout.isPending}
        onClick={() => setConfirming(true)}
      >
        {t.ongoing.completeQualifiers}
      </button>
      <ConfirmDialog
        open={confirming}
        message={t.qualify.confirm(
          size === 8 ? t.qualify.quarterfinals : t.qualify.semifinals,
          raceTo,
        )}
        confirmLabel={t.ongoing.completeQualifiers}
        cancelLabel={t.cancel}
        onConfirm={() => {
          setConfirming(false);
          startKnockout.mutate({ size, raceTo, adminOrder: crossPoolOrder });
        }}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}

/** Tied players the admin puts in order by clicking them, best first. */
function TieResolver({
  group,
  names,
  busy,
  onSettle,
}: {
  group: number[];
  names: Map<number, string>;
  busy: boolean;
  onSettle: (order: number[]) => void;
}) {
  const [order, setOrder] = useState<number[]>([]);
  const pick = (player: number) => {
    const next = [...order, player];
    // The last one is decided by the others.
    if (next.length === group.length - 1) {
      onSettle([...next, group.find((p) => !next.includes(p))!]);
      setOrder([]);
    } else {
      setOrder(next);
    }
  };

  return (
    <div className="tie">
      <p>
        <strong>{t.qualify.tie(group.map((p) => names.get(p)!).join(', '))}</strong>
        <br />
        {t.qualify.pickOrder}
      </p>
      <div className="tie-buttons">
        {group.map((player) => {
          const place = order.indexOf(player);
          return (
            <button
              key={player}
              type="button"
              className="score-button"
              disabled={busy || place !== -1}
              onClick={() => pick(player)}
            >
              {place !== -1 && `${place + 1}. `}
              {names.get(player)}
            </button>
          );
        })}
        {order.length > 0 && (
          <button type="button" className="link" onClick={() => setOrder([])}>
            {t.qualify.startOver}
          </button>
        )}
      </div>
    </div>
  );
}
