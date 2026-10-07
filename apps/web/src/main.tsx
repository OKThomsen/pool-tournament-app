import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { LanguageProvider } from './components/Language';
import { LiveUpdates } from './components/LiveUpdates';
import { RequireAdmin } from './components/RequireAdmin';
import { CreateTournamentPage } from './pages/CreateTournamentPage';
import { FrontPage } from './pages/FrontPage';
import { LivePage } from './pages/LivePage';
import { LoginPage } from './pages/LoginPage';
import { OngoingTournamentPage } from './pages/OngoingTournamentPage';
import { PlayersPage } from './pages/PlayersPage';
import { SeasonPage } from './pages/SeasonPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { TournamentDetailPage } from './pages/TournamentDetailPage';
import { TournamentsPage } from './pages/TournamentsPage';
import './styles.css';

const queryClient = new QueryClient();

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
              <Route path="login" element={<LoginPage />} />
              <Route path="admin" element={<RequireAdmin />}>
                <Route path="turnering/ny" element={<CreateTournamentPage />} />
                <Route path="turnering/:id" element={<OngoingTournamentPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </QueryClientProvider>
  </StrictMode>,
);
