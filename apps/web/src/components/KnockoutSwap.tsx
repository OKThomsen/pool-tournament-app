import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useState } from 'react';
import { ApiError } from '../api';
import { isPlayed } from '../poolView';
import { t } from '../strings';
import { useSwapKnockout, type Match, type Tournament } from '../tournaments';

const ROUND_TITLE = {
  QF: () => t.stages.quarterfinals,
  SF: () => t.stages.semifinals,
  FINAL: () => t.stages.final,
} as const;

/**
 * "Byt spillere": the knockout's first round, where the admin drags a player onto another to
 * swap them, or drags in a player who didn't advance to take someone's place. Every change is
 * saved at once. Matches with a result are locked.
 */
export function KnockoutSwap({ tournament }: { tournament: Tournament }) {
  const swap = useSwapKnockout(tournament.id);
  const [dragging, setDragging] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // A short press before dragging on touch screens, so the page can still be scrolled.
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );
  const names = new Map(tournament.players.map((p) => [p.id, p.name]));
  const seedOf = (player: number) => tournament.seeds.indexOf(player) + 1;

  // The first round: the quarterfinals, the semifinals, or the final only.
  const knockout = tournament.matches.filter((m) => m.stage !== 'pool');
  const stage = (['QF', 'SF', 'FINAL'] as const).find((s) => knockout.some((m) => m.stage === s))!;
  const firstRound = knockout.filter((m) => m.stage === stage);
  const inBracket = new Set(firstRound.flatMap((m) => [m.playerAId!, m.playerBId!]));
  const outside = tournament.players.filter((p) => !inBracket.has(p.id));
  const locked = new Set(firstRound.filter(isPlayed).flatMap((m) => [m.playerAId, m.playerBId]));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over) return;
    const from = Number(active.data.current?.playerId);
    const to = Number(over.data.current?.playerId);
    if (from === to) return;
    // The server swaps a player in the bracket with anyone, so name the one in the bracket first.
    if (inBracket.has(from)) swap.mutate({ playerId: from, otherId: to });
    else if (inBracket.has(to)) swap.mutate({ playerId: to, otherId: from });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => setDragging(Number(active.data.current?.playerId))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <p>{t.knockout.swapHelp}</p>
      {swap.error && (
        <p className="error" role="alert">
          {swap.error instanceof ApiError && swap.error.code === 'match_played'
            ? t.knockout.matchPlayed
            : t.saveFailed}
        </p>
      )}
      <h3>{ROUND_TITLE[stage]()}</h3>
      <div className="pool-grid">
        {firstRound.map((match: Match) => (
          <section key={match.id} className="pool-zone">
            <h2>{match.slot}</h2>
            {[match.playerAId!, match.playerBId!].map((id) => (
              <SwapChip
                key={id}
                id={id}
                label={`${seedOf(id) || '–'}. ${names.get(id) ?? '?'}`}
                disabled={swap.isPending || locked.has(id)}
              />
            ))}
          </section>
        ))}
      </div>
      {outside.length > 0 && (
        <>
          <h3>{t.knockout.notQualified}</h3>
          <div className="pool-zone">
            {outside.map((player) => (
              <SwapChip
                key={player.id}
                id={player.id}
                label={player.name}
                disabled={swap.isPending}
                dropTarget={false}
              />
            ))}
          </div>
        </>
      )}
      <DragOverlay>
        {dragging !== null && <div className="chip dragging">{names.get(dragging)}</div>}
      </DragOverlay>
    </DndContext>
  );
}

function SwapChip({
  id,
  label,
  disabled,
  dropTarget = true,
}: {
  id: number;
  label: string;
  disabled: boolean;
  /** Players outside the knockout can be dragged in, but nothing is dropped on them. */
  dropTarget?: boolean;
}) {
  const key = `player:${id}`;
  const drag = useDraggable({ id: key, data: { playerId: id }, disabled });
  const drop = useDroppable({ id: key, data: { playerId: id }, disabled: disabled || !dropTarget });
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      className={`chip${drag.isDragging ? ' placeholder' : ''}${drop.isOver && !drag.isDragging ? ' over' : ''}${disabled ? ' locked' : ''}`}
      {...drag.listeners}
      {...drag.attributes}
    >
      {label}
    </div>
  );
}
