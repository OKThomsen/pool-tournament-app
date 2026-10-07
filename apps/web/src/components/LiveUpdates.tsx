import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/**
 * Listens to the server's live update stream and refetches tournament data when it changes, so
 * every open page (the admin's phone, /live on the flatscreen) stays current without reloading.
 */
export function LiveUpdates() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const source = new EventSource('/api/events');
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    source.addEventListener('tournament', refresh);
    // The browser reconnects by itself after a dropped connection; catch up on what was missed.
    source.addEventListener('open', refresh);
    return () => source.close();
  }, [queryClient]);
  return null;
}
