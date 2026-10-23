import { ENTERED_PLACEMENTS, todayInDenmark } from '@franks/core';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../api';
import type { Player } from '../players';
import { t } from '../strings';
import { useEnterOldTournament, type GameFormat } from '../tournaments';
import { FORMATS, PlayerSearch } from './CreateTournamentPage';
import { FitTable, ColumnLabel } from '../components/TableView';

type KnockoutSize = 2 | 4 | 8;
const KNOCKOUTS: KnockoutSize[] = [8, 4, 2];

const knockoutLabel = (size: KnockoutSize) =>
  size === 8 ? t.qualify.quarterfinals : size === 4 ? t.qualify.semifinals : t.qualify.finalOnly;

/**
 * "Indtast gammel turnering": a tournament from before the app, entered with its placings only.
 * One field per place (1st, 2nd, 3rd, 4th and, with quarterfinals, the four 5–8), then the other
 * participants. "Færdiggør" saves it as concluded and opens its page under Turneringer.
 */
export function OldTournamentPage() {
  const navigate = useNavigate();
  const enter = useEnterOldTournament();
  const [date, setDate] = useState(todayInDenmark());
  const [format, setFormat] = useState<GameFormat>('8-ball');
  const [knockoutSize, setKnockoutSize] = useState<KnockoutSize>(8);
  const [places, setPlaces] = useState<(Player | null)[]>(placesFor(8, []));
  const [others, setOthers] = useState<Player[]>([]);

  const placed = places.filter((p): p is Player => p !== null);
  const everyone = [...placed, ...others];
  const complete = placed.length === places.length;

  const changeKnockout = (size: KnockoutSize) => {
    setKnockoutSize(size);
    // Players in places the new knockout doesn't have (5–8) become participants.
    const dropped = places.slice(ENTERED_PLACEMENTS[size].length).filter((p) => p !== null);
    setOthers((current) => [...dropped, ...current]);
    setPlaces(placesFor(size, places));
  };
  const setPlace = (index: number, player: Player | null) =>
    setPlaces((current) => current.map((p, i) => (i === index ? player : p)));

  const finish = (event: FormEvent) => {
    event.preventDefault();
    enter.mutate(
      { date, format, knockoutSize, playerIds: everyone.map((p) => p.id) },
      { onSuccess: (tournament) => navigate(`/turneringer/${tournament.id}`) },
    );
  };

  const error = enter.error;
  return (
    <form className="panel create-tournament" onSubmit={finish}>
      <h1>{t.old.title}</h1>
      <p className="muted">{t.old.help}</p>
      <div className="player-form">
        <label>
          {t.tournaments.date}
          <input
            type="date"
            required
            max={todayInDenmark()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          {t.tournaments.format}
          <select value={format} onChange={(e) => setFormat(e.target.value as GameFormat)}>
            {FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label>
          {t.qualify.knockout}
          <select
            value={knockoutSize}
            onChange={(e) => changeKnockout(Number(e.target.value) as KnockoutSize)}
          >
            {KNOCKOUTS.map((size) => (
              <option key={size} value={size}>
                {knockoutLabel(size)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h2>{t.detail.placings}</h2>
      <ol className="old-places">
        {places.map((player, index) => (
          <li key={index}>
            <span className="old-place">
              {t.placements[ENTERED_PLACEMENTS[knockoutSize][index]!]}
            </span>
            {player ? (
              <span className="old-player">
                {player.name}
                <button type="button" className="link" onClick={() => setPlace(index, null)}>
                  {t.create.remove}
                </button>
              </span>
            ) : (
              <PlayerSearch excluded={everyone} onAdd={(p) => setPlace(index, p)} />
            )}
          </li>
        ))}
      </ol>

      <h2>{t.old.others}</h2>
      <PlayerSearch
        excluded={everyone}
        onAdd={(player) => setOthers((current) => [...current, player])}
      />
      {others.length > 0 && (
        <FitTable className="entrants">
          <table>
            <thead>
              <tr>
                <th>{t.players.name}</th>
                <th>
                  <ColumnLabel full={t.players.baseHandicap} short={t.short.baseHandicap} />
                </th>
                <th>
                  <ColumnLabel full={t.players.frameHandicap} short={t.short.frameHandicap} />
                </th>
                <th>
                  <ColumnLabel full={t.players.member} short={t.short.member} />
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {others.map((player) => (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{player.baseHandicap}</td>
                  <td>{player.frameHandicap}</td>
                  <td>{player.member ? t.yes : t.no}</td>
                  <td>
                    <button
                      type="button"
                      className="link"
                      onClick={() => setOthers((all) => all.filter((p) => p.id !== player.id))}
                    >
                      {t.create.remove}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FitTable>
      )}

      <p>
        {t.create.count(everyone.length)}
        {!complete && ` · ${t.old.fillAll}`}
      </p>
      {error && (
        <p className="error" role="alert">
          {error instanceof ApiError && error.code === 'date_in_future'
            ? t.old.dateInFuture
            : t.saveFailed}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={!complete || enter.isPending}>
          {t.create.finish}
        </button>
        <button type="button" className="link" onClick={() => navigate('/turneringer')}>
          {t.create.cancel}
        </button>
      </div>
    </form>
  );
}

/** One field per place in this knockout, keeping the players already in the places it has. */
function placesFor(size: KnockoutSize, current: (Player | null)[]): (Player | null)[] {
  return ENTERED_PLACEMENTS[size].map((_, i) => current[i] ?? null);
}
