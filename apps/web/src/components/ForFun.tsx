import { t } from '../strings';
import { useSetForFun, type Tournament } from '../tournaments';

/** The "For sjov kamp" mark, as on Turneringer and /live. */
export function ForFunTag() {
  return <span className="tag">{t.forFun.label}</span>;
}

/**
 * Under a tournament's title: for admins a "For sjov kamp" checkbox they can switch at any time
 * (not for an old tournament); for everyone else the mark and what it means, when it's on.
 */
export function ForFunSetting({ tournament, admin }: { tournament: Tournament; admin: boolean }) {
  const setForFun = useSetForFun(tournament.id);

  if (!admin || tournament.historical) {
    if (!tournament.forFun) return null;
    return (
      <p className="for-fun">
        <ForFunTag /> <span className="muted">{t.forFun.help}</span>
      </p>
    );
  }
  return (
    <div className="for-fun">
      <label className="checkbox">
        <input
          type="checkbox"
          checked={tournament.forFun}
          disabled={setForFun.isPending}
          onChange={(e) => setForFun.mutate(e.target.checked)}
        />
        {t.forFun.label}
      </label>
      {tournament.forFun && <p className="muted">{t.forFun.help}</p>}
      {setForFun.error && (
        <p className="error" role="alert">
          {t.saveFailed}
        </p>
      )}
    </div>
  );
}
