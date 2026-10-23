import { t } from '../strings';
import { namesOf, type Placement, type Tournament } from '../tournaments';
import { Ball } from './Ball';

/** Left to right as on a real podium: 2nd, 1st, 3rd. */
const STEPS: { placement: Placement; place: number }[] = [
  { placement: '2nd', place: 2 },
  { placement: '1st', place: 1 },
  { placement: '3rd', place: 3 },
];

/** A concluded tournament's top three on a podium, for /live. */
export function Podium({ tournament }: { tournament: Tournament }) {
  const names = namesOf(tournament.players);
  const name = (id: number) => names.get(id) ?? '?';
  return (
    <div className="podium">
      <h2>{t.live.podium}</h2>
      <div className="podium-steps">
        {STEPS.map(({ placement, place }) => {
          const result = tournament.results.find((r) => r.placement === placement);
          return (
            <div key={placement} className={`podium-step place-${place}`}>
              <span className="podium-name">{result ? name(result.playerId) : ''}</span>
              <div className="podium-block">
                <Ball n={place} label={t.frontpage.place(place)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
