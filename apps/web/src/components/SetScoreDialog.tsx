import { todayInDenmark } from '@franks/core';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api';
import { useSetRegulationScore } from '../handicaps';
import { t } from '../strings';
import { Modal } from './Modal';

const SCORES = [-1, 0, 1] as const;

/**
 * "Sæt reguleringsscore": the admin sets a player's regulation score by hand, as it stood at the
 * end of a date (today by default), for instance after old tournaments whose pool results aren't
 * known. Tournaments after the date count on top of it.
 */
export function SetScoreDialog({
  player,
  onClose,
}: {
  player: { id: number; name: string; score: number };
  onClose: () => void;
}) {
  const setScore = useSetRegulationScore(player.id);
  const today = todayInDenmark();
  const [score, setValue] = useState<-1 | 0 | 1>(
    SCORES.includes(player.score as -1 | 0 | 1) ? (player.score as -1 | 0 | 1) : 0,
  );
  const [date, setDate] = useState(today);

  const save = (event: FormEvent) => {
    event.preventDefault();
    setScore.mutate({ score, date }, { onSuccess: onClose });
  };

  return (
    <Modal open onClose={onClose} className="set-score">
      <form onSubmit={save}>
        <h2>{t.handicaps.setScoreTitle(player.name)}</h2>
        <p className="muted">{t.handicaps.setScoreHelp}</p>
        <div className="player-form">
          <label>
            {t.handicaps.score}
            <select
              value={score}
              onChange={(e) => setValue(Number(e.target.value) as -1 | 0 | 1)}
              autoFocus
            >
              {SCORES.map((s) => (
                <option key={s} value={s}>
                  {s > 0 ? `+${s}` : s}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.handicaps.asOf}
            <input
              type="date"
              required
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
        {setScore.error && (
          <p className="error" role="alert">
            {setScore.error instanceof ApiError && setScore.error.code === 'date_in_future'
              ? t.handicaps.asOfFuture
              : t.saveFailed}
          </p>
        )}
        <div className="confirm-buttons">
          <button type="submit" className="primary" disabled={setScore.isPending}>
            {t.save}
          </button>
          <button type="button" className="link" onClick={onClose}>
            {t.cancel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
