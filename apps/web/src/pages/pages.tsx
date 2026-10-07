import { useParams } from 'react-router';
import { t } from '../strings';

// Placeholder pages, one per view in CLAUDE.md. Each is replaced as its feature is built.

function Placeholder({ title }: { title: string }) {
  return (
    <section className="panel">
      <h1>{title}</h1>
      <p>{t.placeholder}</p>
    </section>
  );
}

export function TournamentsPage() {
  return <Placeholder title={t.tournaments.title} />;
}

export function TournamentDetailPage() {
  const { id } = useParams();
  return <Placeholder title={`${t.tournaments.title} #${id}`} />;
}

export function NotFoundPage() {
  return <Placeholder title={t.notFound} />;
}
