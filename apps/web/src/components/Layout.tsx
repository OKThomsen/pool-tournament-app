import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useLogout, useSession } from '../auth';
import { t } from '../strings';
import { ConfirmDialog } from './ConfirmDialog';

/** Header and navigation from the wireframes, with admin links when logged in. */
export function Layout() {
  const admin = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const logOut = () => {
    setConfirmingLogout(false);
    logout.mutate(undefined, { onSuccess: () => navigate('/') });
  };

  return (
    <>
      <header className="header">
        <Link to="/" className="brand">
          {t.brand}
        </Link>
        {admin && (
          <NavLink to="/admin/turnering/ny" className="pill">
            {t.nav.newTournament}
          </NavLink>
        )}
        <NavLink to="/turneringer" className="pill">
          {t.nav.tournaments}
        </NavLink>
        <NavLink to="/spillere" className="pill">
          {t.nav.players}
        </NavLink>
        {admin ? (
          <button
            type="button"
            className="pill"
            disabled={logout.isPending}
            onClick={() => setConfirmingLogout(true)}
          >
            {t.nav.logout}
          </button>
        ) : (
          admin === null && (
            <NavLink to="/login" className="pill">
              {t.nav.login}
            </NavLink>
          )
        )}
      </header>
      <ConfirmDialog
        open={confirmingLogout}
        message={t.logout.confirm}
        confirmLabel={t.logout.yes}
        cancelLabel={t.logout.cancel}
        onConfirm={logOut}
        onCancel={() => setConfirmingLogout(false)}
      />
      <main className="main">
        <Outlet />
      </main>
    </>
  );
}
