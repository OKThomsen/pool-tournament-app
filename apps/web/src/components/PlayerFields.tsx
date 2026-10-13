import { todayInDenmark } from '@franks/core';
import { ApiError } from '../api';
import type { PlayerInput } from '../players';
import { t } from '../strings';

export const emptyPlayerInput: PlayerInput = {
  name: '',
  baseHandicap: 0,
  frameHandicap: 0,
  member: false,
};

/** The start date only goes with `member: true`; left empty, the server uses today. */
export function toPlayerRequest({ memberSince, ...input }: PlayerInput): PlayerInput {
  return input.member && memberSince ? { ...input, memberSince } : input;
}

/** The message for a failed player create, update or delete. */
export function playerErrorMessage(error: Error): string {
  if (error instanceof ApiError && error.code === 'name_taken') return t.players.nameTaken;
  if (error instanceof ApiError && error.code === 'member_since_in_future') {
    return t.players.memberSinceFuture;
  }
  if (error instanceof ApiError && error.code === 'player_has_tournaments') {
    return t.players.hasTournaments;
  }
  return t.saveFailed;
}

/** Name, handicaps, Medlem and (for members) Medlem siden, for adding or editing a player. */
export function PlayerFields({
  input,
  onChange,
  autoFocus,
}: {
  input: PlayerInput;
  onChange: (input: PlayerInput) => void;
  autoFocus?: boolean;
}) {
  const today = todayInDenmark();
  return (
    <>
      <label>
        {t.players.name}
        <input
          required
          maxLength={60}
          autoFocus={autoFocus}
          value={input.name}
          onChange={(event) => onChange({ ...input, name: event.target.value })}
        />
      </label>
      <label>
        {t.players.baseHandicap}
        <input
          type="number"
          required
          min={-20}
          max={20}
          value={input.baseHandicap}
          onChange={(event) => onChange({ ...input, baseHandicap: Number(event.target.value) })}
        />
      </label>
      <label>
        {t.players.frameHandicap}
        <input
          type="number"
          required
          min={-20}
          max={20}
          value={input.frameHandicap}
          onChange={(event) => onChange({ ...input, frameHandicap: Number(event.target.value) })}
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={input.member}
          onChange={(event) => onChange({ ...input, member: event.target.checked })}
        />
        {t.players.member}
      </label>
      {input.member && (
        <label>
          {t.players.memberSince}
          <input
            type="date"
            max={today}
            value={input.memberSince ?? today}
            onChange={(event) => onChange({ ...input, memberSince: event.target.value })}
          />
        </label>
      )}
    </>
  );
}
