import { isPlayed } from '../poolView';
import { t } from '../strings';
import type { Match } from '../tournaments';
import { Modal } from './Modal';

/** A match to score, seen from one of its players (the row that was clicked). */
export interface Scoring {
  match: Match;
  player: number;
}

interface ScoreDialogProps {
  scoring: Scoring | null;
  names: Map<number, string>;
  busy: boolean;
  /** Offer "Ryd resultat". Off for concluded tournaments, whose results can only be corrected. */
  allowClear?: boolean;
  /** Frames in the match's own order: player A, then player B. */
  onScore: (framesA: number, framesB: number) => void;
  onClear: () => void;
  onClose: () => void;
}

/** Every finished score for a race to `raceTo`, wins first: 2-0, 2-1, 1-2, 0-2. */
function possibleScores(raceTo: number): [number, number][] {
  const scores: [number, number][] = [];
  for (let loser = 0; loser < raceTo; loser++) scores.push([raceTo, loser]);
  for (let loser = raceTo - 1; loser >= 0; loser--) scores.push([loser, raceTo]);
  return scores;
}

/**
 * Enter a result with one tap. The question is asked from the clicked player's side: clicking
 * August's cell against Oskar shows "August – Oskar", and 2-0 means August won 2-0.
 */
export function ScoreDialog(props: ScoreDialogProps) {
  return (
    <Modal open={props.scoring !== null} onClose={props.onClose} className="score-dialog">
      {props.scoring && <ScoreChoices {...props} scoring={props.scoring} />}
    </Modal>
  );
}

function ScoreChoices({
  scoring,
  names,
  busy,
  allowClear = true,
  onScore,
  onClear,
  onClose,
}: ScoreDialogProps & { scoring: Scoring }) {
  const { match, player } = scoring;
  const isA = match.playerAId === player;
  const opponent = isA ? match.playerBId! : match.playerAId!;
  // The current result from the clicked player's side, if there is one.
  const own = isA ? match.framesA : match.framesB;
  const other = isA ? match.framesB : match.framesA;

  return (
    <>
      <h2>
        {names.get(player)} – {names.get(opponent)}
      </h2>
      <p className="muted">{t.score.raceTo(match.raceTo)}</p>
      <div className="score-buttons">
        {possibleScores(match.raceTo).map(([mine, theirs]) => (
          <button
            key={`${mine}-${theirs}`}
            type="button"
            className={`score-button ${mine > theirs ? 'win' : 'loss'}${
              own === mine && other === theirs ? ' current' : ''
            }`}
            disabled={busy}
            onClick={() => (isA ? onScore(mine, theirs) : onScore(theirs, mine))}
          >
            {mine}-{theirs}
          </button>
        ))}
      </div>
      <div className="confirm-buttons">
        {allowClear && isPlayed(match) && (
          <button type="button" className="link" disabled={busy} onClick={onClear}>
            {t.score.clear}
          </button>
        )}
        <button type="button" className="link" onClick={onClose}>
          {t.cancel}
        </button>
      </div>
    </>
  );
}
