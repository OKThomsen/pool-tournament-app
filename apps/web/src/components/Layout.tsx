import { useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useLogout, useSession } from '../auth';
import { t } from '../strings';
import { useOngoingTournament } from '../tournaments';
import { AdminMenu } from './AdminMenu';
import { ConfirmDialog } from './ConfirmDialog';
import { LanguageSwitch } from './Language';

/** Header and navigation from the wireframes, with the admin's menu when logged in. */
export function Layout() {
  const admin = useSession();
  // "Live" glows while a tournament is in progress.
  const ongoing = useOngoingTournament();
  const logout = useLogout();
  const navigate = useNavigate();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const header = useStickyTop();

  const logOut = () => {
    setConfirmingLogout(false);
    logout.mutate(undefined, { onSuccess: () => navigate('/') });
  };

  return (
    <>
      <header ref={header} className="header">
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
          {/* Always there: /play says so when no tournament is in progress. */}
          <NavLink to="/play" className="nav-link">
            {t.nav.play}
          </NavLink>
          {/* Glows like the badge on /live while a tournament is in progress. */}
          <NavLink to="/live" className={`nav-link nav-live${ongoing.data ? ' on-air' : ''}`}>
            {ongoing.data && <span className="live-dot" aria-hidden="true" />}
            {t.nav.live}
          </NavLink>
        </nav>
        <div className="header-actions">
          {admin && <AdminMenu />}
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

/**
 * Keeps `--sticky-top` on the page at the header's height while the header sticks to the top
 * (0 on phones, where it scrolls away), so the tables' sticky headers stop right under it.
 */
function useStickyTop() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header) return;
    const root = document.documentElement;
    const measure = () => {
      const sticks = getComputedStyle(header).position === 'sticky';
      root.style.setProperty('--sticky-top', `${sticks ? header.offsetHeight : 0}px`);
    };
    measure();
    // The header wraps to two rows, or stops sticking, as the screen changes.
    const resized = new ResizeObserver(measure);
    resized.observe(header);
    window.addEventListener('resize', measure);
    return () => {
      resized.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--sticky-top');
    };
  }, []);
  return ref;
}
