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
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { MIN_PLAYERS_PER_POOL, movePlayer, swapPlayers } from '@franks/core';
import { useState } from 'react';
import { t } from '../strings';

interface PoolEditorProps {
  /** Player ids per pool, in order. */
  pools: number[][];
  names: Map<number, string>;
  disabled?: boolean;
  onChange: (pools: number[][]) => void;
  /** Shown at the bottom of each pool's box, under its players (the pool's race length). */
  footer?: (index: number) => React.ReactNode;
}

const playerKey = (id: number) => `player:${id}`;
const poolKey = (index: number) => `pool:${index}`;
/** Everything around the pools: dropping a player there starts a new pool. */
const OUTSIDE = 'outside';

// The most specific target under the pointer wins: a player (swap), then a pool (move there),
// then the area around the pools (a new pool).
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const kind = (prefix: string) => hits.find((hit) => String(hit.id).startsWith(prefix));
  const target = kind('player:') ?? kind('pool:') ?? kind(OUTSIDE);
  return target ? [target] : [];
};

/**
 * The pools until the knockout starts. Drag a player onto another player to swap them, or into
 * another pool to move them to its bottom. Dropping a player next to the pools (or on "Ny pulje")
 * starts a new pool, and a pool left empty is removed.
 */
export function PoolEditor({ pools, names, disabled = false, onChange, footer }: PoolEditorProps) {
  const [dragging, setDragging] = useState<number | null>(null);
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
    const from = asStrings.findIndex((pool) => pool.includes(player));
    let next: string[][] | null = null;
    if (kind === 'player') {
      if (value !== player) next = swapPlayers(asStrings, player, value!);
    } else {
      const to = kind === OUTSIDE ? pools.length : Number(value);
      // A lone player dropped outside is a pool of their own already.
      const alone = to === pools.length && asStrings[from]!.length === 1;
      if (to !== from && !alone) next = movePlayer(asStrings, player, to);
    }
    if (next) onChange(next.map((pool) => pool.map(Number)));
  };
  const draggingFrom = pools.findIndex((pool) => dragging !== null && pool.includes(dragging));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={({ active }) => setDragging(Number(active.data.current?.playerId))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <p>{t.pools.dragHelp}</p>
      {pools.some((pool) => pool.length < MIN_PLAYERS_PER_POOL) && (
        <p className="error" role="alert">
          {t.pools.tooSmall}
        </p>
      )}
      <OutsideDropZone>
        <div className="pool-grid">
          {pools.map((pool, index) => (
            <PoolDropZone key={index} index={index}>
              {pool.map((id) => (
                <PlayerChip key={id} id={id} name={names.get(id) ?? '?'} disabled={disabled} />
              ))}
              {/* Where a player dragged in from another pool will land. */}
              {dragging !== null && draggingFrom !== index && (
                <div className="chip drop-slot">{t.pools.dropHere}</div>
              )}
              {/* Pushes the footer to the bottom, so it lines up across pools of different sizes. */}
              {footer && <div className="pool-spacer" />}
              {footer?.(index)}
            </PoolDropZone>
          ))}
          {dragging !== null && (
            <PoolDropZone index={pools.length} title={t.pools.newPool} isNew>
              <div className="chip drop-slot">{t.pools.dropHere}</div>
            </PoolDropZone>
          )}
        </div>
      </OutsideDropZone>
      <DragOverlay>
        {dragging !== null && <div className="chip dragging">{names.get(dragging)}</div>}
      </DragOverlay>
    </DndContext>
  );
}

function OutsideDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: OUTSIDE });
  return (
    <div ref={setNodeRef} className="pool-outside">
      {children}
    </div>
  );
}

function PoolDropZone({
  index,
  title,
  isNew = false,
  children,
}: {
  index: number;
  title?: string;
  isNew?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: poolKey(index) });
  return (
    <section ref={setNodeRef} className={`pool-zone${isNew ? ' new' : ''}${isOver ? ' over' : ''}`}>
      <h2>{title ?? `${t.pools.pool} ${String.fromCharCode(65 + index)}`}</h2>
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
