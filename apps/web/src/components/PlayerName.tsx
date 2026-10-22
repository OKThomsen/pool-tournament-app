/**
 * A name from namesWithHandicap ("Martin Johansen (-1)") in a cell that may be too narrow: the
 * name is cut off with "…", never the handicap.
 */
export function PlayerName({ label }: { label: string | undefined }) {
  const parts = /^(.*?) ?(\(-?\d+\))$/.exec(label ?? '');
  if (!parts) return <>{label}</>;
  return (
    <span className="player-name">
      <span className="player-name-text">{parts[1]}</span>
      <span className="player-handicap">{parts[2]}</span>
    </span>
  );
}
