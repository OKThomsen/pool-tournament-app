import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { usePendingHandicaps } from '../handicaps';
import { t } from '../strings';
import { useOngoingTournament } from '../tournaments';

/**
 * "Admin" in the header: a dropdown with the admin's pages. "Ny Turnering" while no tournament is
 * in progress, otherwise "Live turnering" to the admin's page of the one that is; and
 * "Handicap", with the number of players waiting for a decision (also shown on the button).
 */
export function AdminMenu() {
  const ongoing = useOngoingTournament().data;
  const pending = usePendingHandicaps().length;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Close after following a link.
  useEffect(() => setOpen(false), [location.pathname]);

  // Close on a click outside the menu, or Escape.
  useEffect(() => {
    if (!open) return;
    const click = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div className="admin-menu" ref={ref}>
      <button
        type="button"
        className="button primary admin-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t.nav.admin}
        {pending > 0 && <span className="count-badge">{pending}</span>}
        <span className="admin-menu-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="admin-menu-list" role="menu">
          {ongoing ? (
            <NavLink to={`/admin/turnering/${ongoing.id}`} role="menuitem" end>
              {t.nav.liveTournament}
            </NavLink>
          ) : (
            <NavLink to="/admin/turnering/ny" role="menuitem">
              {t.nav.newTournament}
            </NavLink>
          )}
          <NavLink to="/admin/handicap" role="menuitem">
            {t.nav.handicaps}
            {pending > 0 && <span className="count-badge">{pending}</span>}
          </NavLink>
        </div>
      )}
    </div>
  );
}
