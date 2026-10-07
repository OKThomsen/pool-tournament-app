import { isPlayed } from '../poolView';
import { t } from '../strings';
import type { Match } from '../tournaments';
import { Modal } from './Modal';

interface ScoreDialogProps {
  match: Match | null;
  names: Map<number, string>;
  busy: boolean;
  onScore: (framesA: number, framesB: number) => void;
  onClear: () => void;
  onClose: () => void;
}

/** Every finished score for a race to `raceTo`, player A's wins first: 2-0, 2-1, 1-2, 0-2. */
function possibleScores(raceTo: number): [number, number][] {
  const scores: [number, number][] = [];
  for (let loser = 0; loser < raceTo; loser++) scores.push([raceTo, loser]);
  for (let loser = raceTo - 1; loser >= 0; loser--) scores.push([loser, raceTo]);
  return scores;
}

/** Enter a result with one tap: a button per possible score. */
export function ScoreDialog({ match, names, busy, onScore, onClear, onClose }: ScoreDialogProps) {
  return (
    <Modal open={match !== null} onClose={onClose} className="score-dialog">
      {match && (
        <>
          <h2>
            {names.get(match.playerAId!)} – {names.get(match.playerBId!)}
          </h2>
          <p className="muted">{t.score.raceTo(match.raceTo)}</p>
          <div className="score-buttons">
            {possibleScores(match.raceTo).map(([a, b]) => {
              const current = match.framesA === a && match.framesB === b;
              return (
                <button
                  key={`${a}-${b}`}
                  type="button"
                  className={`score-button ${a > b ? 'win' : 'loss'}${current ? ' current' : ''}`}
                  disabled={busy}
                  onClick={() => onScore(a, b)}
                >
                  {a}-{b}
                </button>
              );
            })}
          </div>
          <div className="confirm-buttons">
            {isPlayed(match) && (
              <button type="button" className="link" disabled={busy} onClick={onClear}>
                {t.score.clear}
              </button>
            )}
            <button type="button" className="link" onClick={onClose}>
              {t.cancel}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
