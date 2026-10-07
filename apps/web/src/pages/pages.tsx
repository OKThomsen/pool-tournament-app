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

export function FrontPage() {
  return (
    <div className="columns">
      <Placeholder title={t.frontpage.title} />
      <Placeholder title={t.frontpage.leaderboard} />
    </div>
  );
}

export function TournamentsPage() {
  return <Placeholder title={t.tournaments.title} />;
}

export function TournamentDetailPage() {
  const { id } = useParams();
  return <Placeholder title={`${t.tournaments.title} #${id}`} />;
}

export function CreateTournamentPage() {
  return <Placeholder title={t.nav.newTournament} />;
}

export function OngoingTournamentPage() {
  const { id } = useParams();
  return <Placeholder title={`${t.stages.pools} #${id}`} />;
}

/** Full-screen view for the flatscreen in the club. Rendered without the site header. */
export function LivePage() {
  return (
    <div className="live">
      <h1>{t.brand}</h1>
      <p>{t.placeholder}</p>
    </div>
  );
}

export function NotFoundPage() {
  return <Placeholder title={t.notFound} />;
}
