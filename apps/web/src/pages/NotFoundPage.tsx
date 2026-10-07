import { Link } from 'react-router';
import { t } from '../strings';

export function NotFoundPage() {
  return (
    <section className="panel">
      <h1>{t.notFound}</h1>
      <Link to="/">{t.brand}</Link>
    </section>
  );
}
