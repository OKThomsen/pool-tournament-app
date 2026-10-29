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
 * "Kalender" on the frontpage: coming events, each a date and a title. An event with a
 * description has an icon before its title and opens the description when clicked. Admins post,
 * edit and delete events here.
 */
export function Calendar() {
  const admin = useSession();
  const calendar = useCalendar();
  const deleteEvent = useDeleteCalendarEvent();
  /** The event whose description is open. */
  const [reading, setReading] = useState<CalendarEvent | null>(null);
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
              {event.description ? (
                <button
                  type="button"
                  className="calendar-title has-description"
                  onClick={() => setReading(event)}
                >
                  <span className="calendar-icon" aria-label={t.calendar.readMore}>
                    i
                  </span>
                  <span>{event.title}</span>
                </button>
              ) : (
                <span className="calendar-title">{event.title}</span>
              )}
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
      <Modal open={reading !== null} onClose={() => setReading(null)} className="calendar-dialog">
        {reading && (
          <div className="calendar-details">
            <h2>{reading.title}</h2>
            <p className="meta">{shortDate(reading.date)}</p>
            <p className="calendar-description">{reading.description}</p>
            <div className="confirm-buttons">
              <button type="button" className="primary" onClick={() => setReading(null)} autoFocus>
                {t.calendar.close}
              </button>
            </div>
          </div>
        )}
      </Modal>
      {editing && (
        <EventDialog
          event={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        message={deleting ? t.calendar.confirmDelete(deleting.title) : ''}
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

/** Choose a date, a title and maybe a description: posts a new event, or edits `event`. */
function EventDialog({ event, onClose }: { event?: CalendarEvent; onClose: () => void }) {
  const saveEvent = useSaveCalendarEvent();
  const today = todayInDenmark();
  const [date, setDate] = useState(event?.date ?? today);
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');

  const save = (e: FormEvent) => {
    e.preventDefault();
    saveEvent.mutate({ id: event?.id, date, title, description }, { onSuccess: onClose });
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
          {t.calendar.eventTitle}
          <input
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </label>
        <label>
          {t.calendar.description}
          <textarea
            maxLength={2000}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
            disabled={saveEvent.isPending || title.trim() === ''}
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
