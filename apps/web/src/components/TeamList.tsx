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
import type { Player } from '../players';
import { t } from '../strings';
import { FitTable } from './TableView';

/**
 * A "Par turnering"'s teams on Ny Turnering and "Rediger spillere": a row per team, "Spiller 1 |
 * Spiller 2". The admin drags a player onto another to swap them, between teams or within one,
 * or onto an empty place to move them there. × takes a player out and leaves their place empty.
 * `slots` are the players two by two, with null for an empty place.
 */
export function TeamList({
  slots,
  onMove,
  onRemove,
}: {
  slots: (Player | null)[];
  /** Swaps the places `from` and `to` (one of them may be empty). */
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // A short press before dragging on touch screens, so the page can still be scrolled.
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );
  const teams = Math.ceil(slots.length / 2);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over) return;
    const from = Number(active.data.current?.index);
    const to = Number(over.data.current?.index);
    if (from !== to) onMove(from, to);
  };

  const dragged = dragging === null ? null : slots[dragging];
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => setDragging(Number(active.data.current?.index))}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      {slots.length > 1 && <p className="muted">{t.duo.dragHelp}</p>}
      <FitTable className="entrants">
        <table className="teams">
          <thead>
            <tr>
              <th>{t.duo.player1}</th>
              <th>{t.duo.player2}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: teams }, (_, team) => (
              <tr key={team}>
                {[team * 2, team * 2 + 1].map((index) => (
                  <td key={index}>
                    <Place index={index} player={slots[index] ?? null} onRemove={onRemove} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </FitTable>
      <DragOverlay>{dragged && <div className="chip dragging">{label(dragged)}</div>}</DragOverlay>
    </DndContext>
  );
}

const label = (player: Player) => `${player.name} (${player.baseHandicap})`;

/** One place in a team: a player to drag (and drop another onto), or an empty place. */
function Place({
  index,
  player,
  onRemove,
}: {
  index: number;
  player: Player | null;
  onRemove: (index: number) => void;
}) {
  const key = `place:${index}`;
  const drag = useDraggable({ id: key, data: { index }, disabled: player === null });
  const drop = useDroppable({ id: key, data: { index } });
  const over = drop.isOver && !drag.isDragging ? ' over' : '';
  if (!player) {
    return (
      <div ref={drop.setNodeRef} className={`chip empty${over}`}>
        –
      </div>
    );
  }
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      className={`chip${drag.isDragging ? ' placeholder' : ''}${over}`}
      {...drag.listeners}
      {...drag.attributes}
    >
      <span className="chip-label">{label(player)}</span>
      <button
        type="button"
        className="link"
        aria-label={`${t.create.remove} ${player.name}`}
        title={t.create.remove}
        // Not the start of a drag.
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={() => onRemove(index)}
      >
        ×
      </button>
    </div>
  );
}
