import { useState, type ReactNode } from 'react';
import { t } from '../strings';

const STORAGE_KEY = 'view:adminPanel';
/** Where the panel sits above the page instead of beside it (see .admin-layout in the CSS). */
const NARROW = '(max-width: 1000px)';

/**
 * Whether the panel starts open: as the admin left it on this device, otherwise open beside the
 * page and closed above it, so on a phone the pools come first.
 */
function initiallyOpen(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'open' || stored === 'closed') return stored === 'open';
  return !window.matchMedia(NARROW).matches;
}

/**
 * A tournament page with the admin's tools gathered in a panel on the right (above the page on
 * narrow screens). The arrow in its header hides and shows the tools: beside the page it folds
 * into a thin strip, above it only the header stays. Without a panel, the page is shown as it is.
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
