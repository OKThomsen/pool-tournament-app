import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import {
  CreateTournamentPage,
  FrontPage,
  LivePage,
  LoginPage,
  NotFoundPage,
  OngoingTournamentPage,
  PlayersPage,
  TournamentDetailPage,
  TournamentsPage,
} from './pages/pages';
import './styles.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/live" element={<LivePage />} />
          <Route element={<Layout />}>
            <Route index element={<FrontPage />} />
            <Route path="turneringer" element={<TournamentsPage />} />
            <Route path="turneringer/:id" element={<TournamentDetailPage />} />
            <Route path="spillere" element={<PlayersPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="admin/turnering/ny" element={<CreateTournamentPage />} />
            <Route path="admin/turnering/:id" element={<OngoingTournamentPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
