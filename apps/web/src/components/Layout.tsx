import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useLogout, useSession } from '../auth';
import { t } from '../strings';
import { ConfirmDialog } from './ConfirmDialog';
import { LanguageSwitch } from './Language';

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
          <img src="/brand/roundel.png" alt="" />
          <span>{t.brand}</span>
        </Link>
        <nav className="nav">
          <NavLink to="/turneringer" className="nav-link">
            {t.nav.tournaments}
          </NavLink>
          <NavLink to="/spillere" className="nav-link">
            {t.nav.players}
          </NavLink>
          <NavLink to="/saeson" className="nav-link">
            {t.nav.season}
          </NavLink>
        </nav>
        <div className="header-actions">
          {admin && (
            <NavLink to="/admin/turnering/ny" className="button primary">
              {t.nav.newTournament}
            </NavLink>
          )}
          {admin ? (
            <button
              type="button"
              className="nav-link"
              disabled={logout.isPending}
              onClick={() => setConfirmingLogout(true)}
            >
              {t.nav.logout}
            </button>
          ) : (
            admin === null && (
              <NavLink to="/login" className="nav-link">
                {t.nav.login}
              </NavLink>
            )
          )}
          <LanguageSwitch />
        </div>
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
