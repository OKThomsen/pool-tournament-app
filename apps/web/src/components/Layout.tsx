import { Link, NavLink, Outlet } from 'react-router';
import { t } from '../strings';

/** Header and navigation from the wireframes. The admin-only links arrive with login. */
export function Layout() {
  return (
    <>
      <header className="header">
        <Link to="/" className="brand">
          {t.brand}
        </Link>
        <NavLink to="/turneringer" className="pill">
          {t.nav.tournaments}
        </NavLink>
        <NavLink to="/spillere" className="pill">
          {t.nav.players}
        </NavLink>
        <NavLink to="/login" className="pill">
          {t.nav.login}
        </NavLink>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </>
  );
}
