import { useState } from 'react';
import { useJoinCode, useNewJoinCode } from '../play';
import { t } from '../strings';
import { ConfirmDialog } from './ConfirmDialog';

/** "482 913": easier to read out loud. */
const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/**
 * The code players enter on /play to score matches, with "Ny kode" in case it has spread beyond
 * the players. Admin page only; never on /live.
 */
export function JoinCode({ tournamentId }: { tournamentId: number }) {
  const code = useJoinCode(tournamentId);
  const newCode = useNewJoinCode(tournamentId);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="notice join-code">
      <p>
        {t.joinCode.label}:{' '}
        {code.data ? (
          <strong className="join-code-value">{spaced(code.data)}</strong>
        ) : (
          code.isSuccess && t.joinCode.none
        )}
      </p>
      <p className="muted">{t.joinCode.help}</p>
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
