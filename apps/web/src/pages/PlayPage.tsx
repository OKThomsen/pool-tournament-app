import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../api';
import { TournamentPlay } from '../components/TournamentPlay';
import { formatDate } from '../format';
import { useJoin, useLeave, usePlaySession, useRecheckPlaySession } from '../play';
import { t } from '../strings';
import { useTournament } from '../tournaments';

/**
 * /play: players enter the tournament's join code, then see the pools and bracket like the
 * admin does and can enter results. Nothing else: no draw, no qualifying, no concluding.
 */
export function PlayPage() {
  const joined = usePlaySession();
  const leave = useLeave();
  // Set once this browser has been in; if the session then ends (new code, tournament over),
  // the form says why instead of just appearing.
  const wasJoined = useRef(false);
  useEffect(() => {
    if (joined) wasJoined.current = true;
  }, [joined]);

  if (joined === undefined) return <p>{t.loading}</p>;
  if (joined === null) return <JoinForm ended={wasJoined.current} />;
  return (
    <PlayTournament
      id={joined}
      leaving={leave.isPending}
      onLeave={() => {
        wasJoined.current = false;
        leave.mutate();
      }}
    />
  );
}

function JoinForm({ ended }: { ended: boolean }) {
  const join = useJoin();
  const [code, setCode] = useState('');
  // Admins read the code out as "482 913"; accept it with or without the space.
  const digits = code.replace(/\s/g, '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    join.mutate(digits);
  };

  const error = join.error;
  const message =
    error instanceof ApiError && error.status === 404
      ? t.play.unknownCode
      : error instanceof ApiError && error.status === 429
        ? t.play.tooManyAttempts
        : error
          ? t.saveFailed
          : null;

  return (
    <form className="panel login" onSubmit={submit}>
      <h1>{t.play.title}</h1>
      <p>{ended && !error ? t.play.ended : t.play.intro}</p>
      <label>
        {t.play.code}
        <input
          name="code"
          className="join-code-input"
          inputMode="numeric"
          autoComplete="off"
          maxLength={7}
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </label>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <button type="submit" disabled={join.isPending || !/^[0-9]{6}$/.test(digits)}>
        {t.play.join}
      </button>
    </form>
  );
}

function PlayTournament({
  id,
  leaving,
  onLeave,
}: {
  id: number;
  leaving: boolean;
  onLeave: () => void;
}) {
  const tournament = useTournament(id);
  const recheck = useRecheckPlaySession();
  const cancelled = tournament.error instanceof ApiError && tournament.error.status === 404;

  // A cancelled tournament takes the player's session with it.
  useEffect(() => {
    if (cancelled) void recheck();
  }, [cancelled, recheck]);

  if (tournament.isPending || cancelled) return <p>{t.loading}</p>;
  if (tournament.isError) return <p className="error">{t.loadFailed}</p>;

  const data = tournament.data;
  return (
    <section className="panel">
      <div className="play-header">
        <h1>
          {t.tournaments.one} {formatDate(data.date)}
        </h1>
        <button type="button" className="link" disabled={leaving} onClick={onLeave}>
          {t.play.leave}
        </button>
      </div>
      <p className="meta">
        {data.format} · {t.create.count(data.players.length)}
      </p>
      {data.status === 'draft' && <p className="notice">{t.live.drawing}</p>}
      {data.status === 'concluded' && (
        <p className="notice">
          {t.play.concluded} <Link to={`/turneringer/${data.id}`}>{t.play.seeResult}</Link>
        </p>
      )}
      {(data.status === 'pools' || data.status === 'knockout') && (
        <>
          <p className="muted">{t.play.help}</p>
          <TournamentPlay tournament={data} manage={false} onUnauthorized={recheck} />
        </>
      )}
    </section>
  );
}
