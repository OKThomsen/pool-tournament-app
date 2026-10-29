import { useState, type ReactNode } from 'react';
import { t } from '../strings';

const STORAGE_KEY = 'view:adminPanel';
/** Where the panel is a drawer over the page instead of beside it (see .admin-panel in the CSS). */
const NARROW = '(max-width: 1000px)';

/**
 * Whether the panel starts open: as the admin left it on this device, otherwise open beside the
 * page and closed as a drawer, so on a phone the pools come first.
 */
function initiallyOpen(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'open' || stored === 'closed') return stored === 'open';
  return !window.matchMedia(NARROW).matches;
}

/**
 * A tournament page with the admin's tools gathered in a panel on the right: beside the page, or
 * on narrow screens a drawer on the right edge that lies over the page and stays in view while it
 * scrolls. The arrow in its header puts the tools away into a thin strip on the right and brings
 * them back. Without a panel, the page is shown as it is.
 */
export function AdminLayout({ panel, children }: { panel?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  if (!panel) return <>{children}</>;

  const toggle = () => {
    localStorage.setItem(STORAGE_KEY, open ? 'closed' : 'open');
    setOpen(!open);
  };

  return (
    <div className={open ? 'admin-layout' : 'admin-layout panel-closed'}>
      <div className="admin-main">{children}</div>
      <aside className="admin-panel" aria-label={t.adminPanel.title}>
        <h2>
          <button
            type="button"
            className="admin-panel-toggle"
            aria-expanded={open}
            title={open ? t.adminPanel.hide : t.adminPanel.show}
            onClick={toggle}
          >
            <span>{t.adminPanel.title}</span>
            <span className="admin-panel-arrow" aria-hidden="true" />
          </button>
        </h2>
        {panel}
      </aside>
    </div>
  );
}
