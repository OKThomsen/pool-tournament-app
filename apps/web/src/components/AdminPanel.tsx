import type { ReactNode } from 'react';
import { t } from '../strings';

/**
 * A tournament page with the admin's tools gathered in a panel on the right (above the page on
 * narrow screens). Without a panel, the page is shown as it is.
 */
export function AdminLayout({ panel, children }: { panel?: ReactNode; children: ReactNode }) {
  if (!panel) return <>{children}</>;
  return (
    <div className="admin-layout">
      <div className="admin-main">{children}</div>
      <aside className="admin-panel" aria-label={t.adminPanel.title}>
        <h2>{t.adminPanel.title}</h2>
        {panel}
      </aside>
    </div>
  );
}
