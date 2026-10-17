import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ApiError } from './api';
import { Layout } from './components/Layout';
import { LanguageProvider } from './components/Language';
import { LiveUpdates } from './components/LiveUpdates';
import { RequireAdmin } from './components/RequireAdmin';
import { CreateTournamentPage } from './pages/CreateTournamentPage';
import { EditTournamentPage } from './pages/EditTournamentPage';
import { FrontPage } from './pages/FrontPage';
import { LivePage } from './pages/LivePage';
import { LoginPage } from './pages/LoginPage';
import { OngoingTournamentPage } from './pages/OngoingTournamentPage';
import { PlayPage } from './pages/PlayPage';
import { PlayersPage } from './pages/PlayersPage';
import { SeasonPage } from './pages/SeasonPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OldTournamentPage } from './pages/OldTournamentPage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { TournamentsPage } from './pages/TournamentsPage';
// Self-hosted fonts (no requests to Google): Barlow for text, Barlow Condensed for headings
// and scores.
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A request the server refused (404 and the like) won't succeed by asking again, so the
      // page says so at once; network and server errors are still retried.
      retry: (failures, error) =>
        !(error instanceof ApiError && error.status < 500) && failures < 3,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LiveUpdates />
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/live" element={<LivePage />} />
            <Route element={<Layout />}>
              <Route index element={<FrontPage />} />
              <Route path="turneringer" element={<TournamentsPage />} />
              <Route path="turneringer/:id" element={<TournamentDetailPage />} />
              <Route path="spillere" element={<PlayersPage />} />
              <Route path="saeson" element={<SeasonPage />} />
              <Route path="saeson/:id" element={<SeasonPage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="play" element={<PlayPage />} />
              <Route path="admin" element={<RequireAdmin />}>
                <Route path="turnering/ny" element={<CreateTournamentPage />} />
                <Route path="turnering/gammel" element={<OldTournamentPage />} />
                <Route path="turnering/:id" element={<OngoingTournamentPage />} />
                <Route path="turnering/:id/rediger" element={<EditTournamentPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </QueryClientProvider>
  </StrictMode>,
);
