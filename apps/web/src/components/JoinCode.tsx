import { useState } from 'react';
import { useJoinCode, useNewJoinCode } from '../play';
import { t } from '../strings';
import { ConfirmDialog } from './ConfirmDialog';

/** "482 913": easier to read out loud. */
const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/**
 * The code players enter on /play to score matches, with "Ny kode" in case it has spread beyond
 * the players. In the admin panel only; never on /live.
 */
export function JoinCode({ tournamentId }: { tournamentId: number }) {
  const code = useJoinCode(tournamentId);
  const newCode = useNewJoinCode(tournamentId);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="join-code">
      <p className="admin-panel-label">{t.joinCode.label}</p>
      {code.data ? (
        <p className="join-code-value">{spaced(code.data)}</p>
      ) : (
        code.isSuccess && <p>{t.joinCode.none}</p>
      )}
      <p className="muted small">{t.joinCode.help}</p>
      {newCode.error && (
        <p className="error" role="alert">
          {t.saveFailed}
        </p>
      )}
      <button
        type="button"
        className="link"
        disabled={newCode.isPending}
        onClick={() => (code.data ? setConfirming(true) : newCode.mutate())}
      >
        {t.joinCode.newCode}
      </button>
      <ConfirmDialog
        open={confirming}
        message={t.joinCode.confirmNew}
        confirmLabel={t.joinCode.newCode}
        cancelLabel={t.cancel}
        onConfirm={() => {
          setConfirming(false);
          newCode.mutate();
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
