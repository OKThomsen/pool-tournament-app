import { todayInDenmark } from '@franks/core';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api';
import { useSession } from '../auth';
import {
  useCalendar,
  useDeleteCalendarEvent,
  useSaveCalendarEvent,
  type CalendarEvent,
} from '../calendar';
import { t } from '../strings';
import { ConfirmDialog } from './ConfirmDialog';
import { Modal } from './Modal';

/** YYYY-MM-DD → "28/10", with the year added when it isn't this year's ("4/1/2027"). */
function shortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const thisYear = Number(todayInDenmark().slice(0, 4));
  return year === thisYear ? `${day}/${month}` : `${day}/${month}/${year}`;
}

/**
 * "Kalender" on the frontpage: coming events, each a date and a message. Admins post, edit and
 * delete them here.
 */
export function Calendar() {
  const admin = useSession();
  const calendar = useCalendar();
  const deleteEvent = useDeleteCalendarEvent();
  /** The event being edited, or 'new' while posting one. */
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CalendarEvent | null>(null);

  return (
    <section className="panel calendar">
      <h2>{t.calendar.title}</h2>
      {calendar.isPending ? (
        <p>{t.loading}</p>
      ) : calendar.isError ? (
        <p className="error">{t.loadFailed}</p>
      ) : calendar.data.length === 0 ? (
        <p className="muted">{t.calendar.empty}</p>
      ) : (
        <ul className="calendar-events">
          {calendar.data.map((event) => (
            <li key={event.id}>
              <span className="calendar-date">{shortDate(event.date)}</span>
              <span className="calendar-message">{event.message}</span>
              {admin && (
                <span className="actions">
                  <button type="button" className="link" onClick={() => setEditing(event)}>
                    {t.calendar.edit}
                  </button>
                  <button type="button" className="link" onClick={() => setDeleting(event)}>
                    {t.calendar.delete}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {deleteEvent.isError && (
        <p className="error" role="alert">
          {t.saveFailed}
        </p>
      )}
      {admin && (
        <button type="button" className="secondary" onClick={() => setEditing('new')}>
          {t.calendar.add}
        </button>
      )}
      {editing && (
        <EventDialog
          event={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        message={deleting ? t.calendar.confirmDelete(shortDate(deleting.date)) : ''}
        confirmLabel={t.calendar.delete}
        cancelLabel={t.cancel}
        onConfirm={() => {
          deleteEvent.mutate(deleting!.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}

/** Choose a date and type a message: posts a new event, or edits `event`. */
function EventDialog({ event, onClose }: { event?: CalendarEvent; onClose: () => void }) {
  const saveEvent = useSaveCalendarEvent();
  const today = todayInDenmark();
  const [date, setDate] = useState(event?.date ?? today);
  const [message, setMessage] = useState(event?.message ?? '');

  const save = (e: FormEvent) => {
    e.preventDefault();
    saveEvent.mutate({ id: event?.id, date, message }, { onSuccess: onClose });
  };

  return (
    <Modal open onClose={onClose} className="calendar-dialog">
      <form onSubmit={save}>
        <h2>{event ? t.calendar.editTitle : t.calendar.add}</h2>
        <label>
          {t.calendar.date}
          <input
            type="date"
            required
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          {t.calendar.message}
          <textarea
            required
            maxLength={200}
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            autoFocus
          />
        </label>
        {saveEvent.error && (
          <p className="error" role="alert">
            {saveEvent.error instanceof ApiError && saveEvent.error.code === 'date_in_past'
              ? t.calendar.dateInPast
              : t.saveFailed}
          </p>
        )}
        <div className="confirm-buttons">
          <button
            type="submit"
            className="primary"
            disabled={saveEvent.isPending || message.trim() === ''}
          >
            {event ? t.save : t.calendar.post}
          </button>
          <button type="button" className="link" onClick={onClose}>
            {t.cancel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
