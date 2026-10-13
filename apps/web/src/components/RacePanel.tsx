import { DEFAULT_RACE_TO } from '@franks/core';
import { useState } from 'react';
import { isPlayed } from '../poolView';
import { t } from '../strings';
import { useSetRace, type Match, type Tournament } from '../tournaments';
import { RaceToInput } from './RaceToInput';

type Stage = Exclude<Match['stage'], 'pool'>;

// In play order; titles are looked up when rendering, so they follow the current language.
const ROUNDS: { stage: Stage; title: () => string }[] = [
  { stage: 'QF', title: () => t.stages.quarterfinals },
  { stage: 'SF', title: () => t.stages.semifinals },
  { stage: 'THIRD', title: () => t.stages.thirdPlace },
  { stage: 'FINAL', title: () => t.stages.final },
];

/**
 * The admin chooses each knockout round's race length as the knockout goes on: the first round
 * as soon as the knockout starts, the semifinals once their players are known, then the
 * third-place final and the final separately. A round is
 * listed from when one of its matches has both players until its first result.
 */
export function RacePanel({ tournament }: { tournament: Tournament }) {
  const rounds = ROUNDS.map((round) => ({
    ...round,
    matches: tournament.matches.filter((m) => m.stage === round.stage),
  })).filter(
    ({ matches }) =>
      matches.some((m) => m.playerAId !== null && m.playerBId !== null) && !matches.some(isPlayed),
  );
  if (rounds.length === 0) return null;

  // A round without a race length starts from the one before it; the first round from the pools.
  const previousRace = (stage: Stage) => {
    const earlier = ROUNDS.slice(
      0,
      ROUNDS.findIndex((r) => r.stage === stage),
    ).reverse();
    for (const round of earlier) {
      const match = tournament.matches.find((m) => m.stage === round.stage && m.raceTo !== null);
      if (match) return match.raceTo!;
    }
    return tournament.matches.find((m) => m.stage === 'pool')?.raceTo ?? DEFAULT_RACE_TO;
  };

  return (
    <section className="race-panel">
      <h3>{t.knockout.raceTitle}</h3>
      <p className="muted">{t.knockout.raceHelp}</p>
      {rounds.map(({ stage, title, matches }) => (
        <RaceRow
          key={stage}
          tournamentId={tournament.id}
          stage={stage}
          title={title()}
          current={matches[0]!.raceTo}
          suggested={previousRace(stage)}
        />
      ))}
    </section>
  );
}

function RaceRow({
  tournamentId,
  stage,
  title,
  current,
  suggested,
}: {
  tournamentId: number;
  stage: Stage;
  title: string;
  current: number | null;
  suggested: number;
}) {
  const setRace = useSetRace(tournamentId);
  const [value, setValue] = useState(current ?? suggested);
  const missing = current === null;

  return (
    <form
      className={`race-row${missing ? ' missing' : ''}`}
      onSubmit={(event) => {
        event.preventDefault();
        setRace.mutate({ stage, raceTo: value });
      }}
    >
      <span className="race-round">{title}</span>
      <RaceToInput value={value} onChange={setValue} />
      <button
        type="submit"
        className={missing ? 'primary' : ''}
        disabled={setRace.isPending || value === current}
      >
        {t.save}
      </button>
      {missing && <span className="race-missing">{t.knockout.raceMissing}</span>}
      {setRace.error && (
        <span className="error" role="alert">
          {t.saveFailed}
        </span>
      )}
    </form>
  );
}
