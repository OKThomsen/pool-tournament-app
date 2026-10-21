import { t } from '../strings';
import { useSetForFun, type Tournament } from '../tournaments';

/** The "For sjov kamp" mark, as on Turneringer and /live. */
export function ForFunTag() {
  return <span className="tag">{t.forFun.label}</span>;
}

/** Under a tournament's title, for everyone: the mark and what it means, when it's on. */
export function ForFunNote({ tournament }: { tournament: Tournament }) {
  if (!tournament.forFun) return null;
  return (
    <p className="for-fun">
      <ForFunTag /> <span className="muted">{t.forFun.help}</span>
    </p>
  );
}

/** In the admin panel: the "For sjov kamp" checkbox, which can be switched at any time. */
export function ForFunSetting({ tournament }: { tournament: Tournament }) {
  const setForFun = useSetForFun(tournament.id);
  return (
    <div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={tournament.forFun}
          disabled={setForFun.isPending}
          onChange={(e) => setForFun.mutate(e.target.checked)}
        />
        {t.forFun.label}
      </label>
      {setForFun.error && (
        <p className="error" role="alert">
          {t.saveFailed}
        </p>
      )}
    </div>
  );
}
