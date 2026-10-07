/** What changed. Clients refetch what they show; the event itself carries no data. */
export interface ChangeEvent {
  tournamentId: number;
}

type Listener = (event: ChangeEvent) => void;

/**
 * Tells open pages that a tournament changed, so the admin's phone, the flatscreen on /live and
 * any visitors update without reloading. In-memory, which is fine for a single server process.
 */
export class Events {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  tournamentChanged(tournamentId: number): void {
    for (const listener of this.listeners) listener({ tournamentId });
  }
}
