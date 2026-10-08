import { isPlayed } from '../poolView';
import { t } from '../strings';
import type { Match, Tournament } from '../tournaments';

// Titles are looked up when rendering, so they follow the current language.
const ROUNDS = [
  { stage: 'QF', title: () => t.stages.quarterfinals },
  { stage: 'SF', title: () => t.stages.semifinals },
  { stage: 'THIRD', title: () => t.stages.thirdPlace },
  { stage: 'FINAL', title: () => t.stages.final },
] as const;

interface BracketProps {
  tournament: Tournament;
  names: Map<number, string>;
  /** Set for admins: clicking a player in a match enters its result from their side. */
  onPlayerClick?: (match: Match, player: number) => void;
}

/**
 * The knockout, one column per round. In each match the winner is green and the loser red.
 * Seed numbers are shown in the first round.
 */
export function Bracket({ tournament, names, onPlayerClick }: BracketProps) {
  const knockout = tournament.matches.filter((m) => m.stage !== 'pool');
  const firstStage = knockout.some((m) => m.stage === 'QF') ? 'QF' : 'SF';
  const seedOf = (player: number) => tournament.seeds.indexOf(player) + 1;

  return (
    <div className="bracket">
      {ROUNDS.filter((round) => knockout.some((m) => m.stage === round.stage)).map((round) => (
        <section key={round.stage} className="round">
          <h3>{round.title()}</h3>
          <div className="round-matches">
            {knockout
              .filter((m) => m.stage === round.stage)
              .map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  names={names}
                  seedOf={round.stage === firstStage ? seedOf : undefined}
                  onPlayerClick={onPlayerClick}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MatchCard({
  match,
  names,
  seedOf,
  onPlayerClick,
}: {
  match: Match;
  names: Map<number, string>;
  seedOf?: (player: number) => number;
  onPlayerClick?: (match: Match, player: number) => void;
}) {
  const played = isPlayed(match);
  const sides = [
    { player: match.playerAId, frames: match.framesA, other: match.framesB },
    { player: match.playerBId, frames: match.framesB, other: match.framesA },
  ];
  return (
    <div className="match-card">
      <div className="match-label">
        {/* QF1, SF2 …; the bronze match and the final are named by their round's title. */}
        {(match.stage === 'QF' || match.stage === 'SF') && `${match.slot} · `}
        {t.score.raceTo(match.raceTo)}
      </div>
      {sides.map(({ player, frames, other }, i) => {
        const result = played ? (frames! > other! ? 'win' : 'loss') : '';
        const name = (
          <>
            {player !== null && seedOf && <span className="seed">{seedOf(player)}</span>}
            <span className="name">{player === null ? t.knockout.waiting : names.get(player)}</span>
            <span className="frames">{played ? frames : ''}</span>
          </>
        );
        return onPlayerClick &&
          player !== null &&
          match.playerAId !== null &&
          match.playerBId !== null ? (
          <button
            key={i}
            type="button"
            className={`match-side ${result}`}
            onClick={() => onPlayerClick(match, player)}
          >
            {name}
          </button>
        ) : (
          <div key={i} className={`match-side ${result}`}>
            {name}
          </div>
        );
      })}
    </div>
  );
}
