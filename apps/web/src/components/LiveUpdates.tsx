import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/**
 * Listens to the server's live update stream:
 * - refetches what's on screen whenever a tournament changes, so every open page (the admin's
 *   phone, /live on the flatscreen) stays current without reloading;
 * - reloads the page when the server reports a new version of the app, so a page left open
 *   (like the flatscreen) picks up updates by itself.
 */
export function LiveUpdates() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const source = new EventSource('/api/events');
    let version: string | null = null;

    // Refetch whatever is on screen: a concluded tournament also changes players and seasons.
    const refresh = () => queryClient.invalidateQueries();
    source.addEventListener('tournament', refresh);
    // Sent on every (re)connect. The browser reconnects by itself after the server restarts,
    // for example after an update.
    source.addEventListener('hello', (event) => {
      const announced = (JSON.parse(event.data) as { version: string }).version;
      if (version !== null && announced !== version) {
        window.location.reload();
        return;
      }
      version = announced;
      // Catch up on anything that changed while disconnected.
      void refresh();
    });
    return () => source.close();
  }, [queryClient]);
  return null;
}
