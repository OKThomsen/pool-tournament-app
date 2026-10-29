import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/** An event on the frontpage's calendar. */
export interface CalendarEvent {
  id: number;
  /** YYYY-MM-DD. */
  date: string;
  /** Shown on the board. */
  title: string;
  /** Opens when the event is clicked; null for none. */
  description: string | null;
}

export interface CalendarEventInput {
  date: string;
  title: string;
  /** Empty for none. */
  description: string;
}

const calendarKey = ['calendar'];

/** Today's and coming events, soonest first. */
export function useCalendar() {
  return useQuery({ queryKey: calendarKey, queryFn: () => api<CalendarEvent[]>('/calendar') });
}

/** Posts a new event, or edits one when an id is given. */
export function useSaveCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: CalendarEventInput & { id?: number }) =>
      id === undefined
        ? api<CalendarEvent>('/calendar', { method: 'POST', body: input })
        : api<CalendarEvent>(`/calendar/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarKey }),
  });
}

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/calendar/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarKey }),
  });
}
