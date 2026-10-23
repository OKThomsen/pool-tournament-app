/**
 * A name from namesWithHandicap ("Martin Johansen (-1)", a team "Anna & Bo (-1/0)") in a cell
 * that may be too narrow: the name is cut off with "…", never the handicap. With `stack`, a
 * team's two names go on a line each (the pool tables, where rows are tall and columns narrow).
 */
export function PlayerName({
  label,
  stack = false,
}: {
  label: string | undefined;
  stack?: boolean;
}) {
  const parts = /^(.*?) ?(\(-?\d+(?:\/-?\d+)?\))$/.exec(label ?? '');
  const name = parts ? parts[1]! : (label ?? '');
  const team = stack ? name.split(' & ') : [name];
  if (!parts && team.length < 2) return <>{label}</>;
  return (
    <span className={team.length > 1 ? 'player-name team' : 'player-name'}>
      <span className="player-name-text">
        {team.length > 1
          ? team.map((player, i) => (
              <span key={i}>{i < team.length - 1 ? `${player} &` : player}</span>
            ))
          : name}
      </span>
      {parts && <span className="player-handicap">{parts[2]}</span>}
    </span>
  );
}
