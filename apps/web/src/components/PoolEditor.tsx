import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { movePlayer, swapPlayers } from '@franks/core';
import { useState } from 'react';
import { t } from '../strings';

interface PoolEditorProps {
  /** Player ids per pool, in order. */
  pools: number[][];
  names: Map<number, string>;
  disabled?: boolean;
  onChange: (pools: number[][]) => void;
}

const playerKey = (id: number) => `player:${id}`;
const poolKey = (index: number) => `pool:${index}`;

// When the pointer is over a player, that player is the target (swap), even though the pool
// around them is under the pointer too. Otherwise the pool is the target (move).
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const player = hits.find((hit) => String(hit.id).startsWith('player:'));
  if (player) return [player];
  return hits.length > 0 ? hits : rectIntersection(args);
};

/**
 * The drawn pools before "finalize brackets". Drag a player onto another player to swap them,
 * or into another pool to move them there.
 */
export function PoolEditor({ pools, names, disabled = false, onChange }: PoolEditorProps) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // A short press before dragging on touch screens, so the page can still be scrolled.
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over || disabled) return;
    const player = String(active.data.current?.playerId);
    const [kind, value] = String(over.id).split(':');
    const asStrings = pools.map((pool) => pool.map(String));
    try {
      const next =
        kind === 'player'
          ? value === player
            ? null
            : swapPlayers(asStrings, player, value!)
          : movePlayer(asStrings, player, Number(value));
      setError(null);
      if (next) onChange(next.map((pool) => pool.map(Number)));
    } catch {
      setError(t.pools.tooSmall);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={({ active }) => setDragging(Number(active.data.current?.playerId))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <p>{t.pools.dragHelp}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="pool-grid">
        {pools.map((pool, index) => (
          <PoolDropZone key={index} index={index}>
            {pool.map((id) => (
              <PlayerChip key={id} id={id} name={names.get(id) ?? '?'} disabled={disabled} />
            ))}
          </PoolDropZone>
        ))}
      </div>
      <DragOverlay>
        {dragging !== null && <div className="chip dragging">{names.get(dragging)}</div>}
      </DragOverlay>
    </DndContext>
  );
}

function PoolDropZone({ index, children }: { index: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: poolKey(index) });
  return (
    <section ref={setNodeRef} className={`pool-zone${isOver ? ' over' : ''}`}>
      <h2>
        {t.pools.pool} {String.fromCharCode(65 + index)}
      </h2>
      {children}
    </section>
  );
}

function PlayerChip({ id, name, disabled }: { id: number; name: string; disabled: boolean }) {
  const drag = useDraggable({ id: playerKey(id), data: { playerId: id }, disabled });
  const drop = useDroppable({ id: playerKey(id) });
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      className={`chip${drag.isDragging ? ' placeholder' : ''}${drop.isOver && !drag.isDragging ? ' over' : ''}`}
      {...drag.listeners}
      {...drag.attributes}
    >
      {name}
    </div>
  );
}
