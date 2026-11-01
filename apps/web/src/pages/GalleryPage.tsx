import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '../auth';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { PhotoDialog } from '../components/PhotoDialog';
import { PhotoGrid } from '../components/PhotoGrid';
import { TableSearch } from '../components/TableView';
import { formatDate } from '../format';
import {
  byYearAndMonth,
  imageUrl,
  photoAlt,
  photoMatches,
  useDeletePhoto,
  usePhotos,
  type Photo,
} from '../photos';
import { t } from '../strings';
import type { Placement } from '../tournaments';

/**
 * Galleri: every photo, newest first, under a heading for each year and each month in it. The
 * search finds photos by player, date, format, season, year or month; a photo opens large, with
 * the tournament it's the winner picture of and who is in it. Admins upload, edit and delete
 * photos here.
 */
export function GalleryPage() {
  const admin = useSession();
  const photos = usePhotos();
  const [query, setQuery] = useState('');
  /** The photo open in the viewer. */
  const [viewing, setViewing] = useState<number | null>(null);
  /** The photo being edited, or 'new' while uploading one. */
  const [editing, setEditing] = useState<Photo | 'new' | null>(null);

  const found = (photos.data ?? []).filter((photo) => photoMatches(photo, query));

  return (
    <section className="panel">
      <div className="page-heading">
        <h1>{t.gallery.title}</h1>
        {admin && (
          <button type="button" className="button secondary" onClick={() => setEditing('new')}>
            {t.gallery.upload}
          </button>
        )}
      </div>
      {photos.isPending ? (
        <p>{t.loading}</p>
      ) : photos.isError ? (
        <p className="error">{t.loadFailed}</p>
      ) : photos.data.length === 0 ? (
        <p>{t.gallery.none}</p>
      ) : (
        <>
          <TableSearch value={query} onChange={setQuery} placeholder={t.gallery.search} />
          {found.length === 0 && <p className="muted">{t.noMatches}</p>}
          {byYearAndMonth(found).map(({ year, months }) => (
            <section key={year} className="gallery-year">
              <h2>{year}</h2>
              {months.map(({ month, photos }) => (
                <section key={month} className="gallery-month">
                  <h3>{t.months[month - 1]}</h3>
                  <PhotoGrid photos={photos} onPick={(photo) => setViewing(photo.id)} />
                </section>
              ))}
            </section>
          ))}
        </>
      )}
      <PhotoViewer
        photos={found}
        photoId={viewing}
        onShow={setViewing}
        onEdit={admin ? setEditing : undefined}
      />
      {editing && (
        <PhotoDialog
          photo={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

/**
 * The photo `photoId` large, with its date, tournament and players. The arrows (and the arrow
 * keys) go through `photos`. Admins can edit and delete it.
 */
function PhotoViewer({
  photos,
  photoId,
  onShow,
  onEdit,
}: {
  photos: Photo[];
  photoId: number | null;
  onShow: (id: number | null) => void;
  onEdit?: (photo: Photo) => void;
}) {
  const remove = useDeletePhoto();
  const [deleting, setDeleting] = useState(false);
  const index = photos.findIndex((photo) => photo.id === photoId);
  const photo = photos[index];
  const previous = photos[index - 1];
  const next = photos[index + 1];

  useEffect(() => {
    if (!photo) return;
    const key = (event: KeyboardEvent) => {
      // Not while typing in a dialog on top.
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === 'ArrowLeft' && previous) onShow(previous.id);
      if (event.key === 'ArrowRight' && next) onShow(next.id);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [photo, previous, next, onShow]);

  return (
    <>
      <Modal open={photo !== undefined} onClose={() => onShow(null)} className="photo-viewer">
        {photo && (
          <>
            <div className="photo-viewer-image">
              <img
                src={imageUrl(photo)}
                alt={photoAlt(photo)}
                width={photo.width}
                height={photo.height}
              />
              {previous && (
                <button
                  type="button"
                  className="photo-viewer-arrow previous"
                  aria-label={t.gallery.previous}
                  onClick={() => onShow(previous.id)}
                />
              )}
              {next && (
                <button
                  type="button"
                  className="photo-viewer-arrow next"
                  aria-label={t.gallery.next}
                  onClick={() => onShow(next.id)}
                />
              )}
            </div>
            <PhotoCaption photo={photo} />
            <div className="confirm-buttons">
              <button type="button" className="primary" onClick={() => onShow(null)}>
                {t.gallery.close}
              </button>
              {onEdit && (
                <>
                  <button type="button" className="link" onClick={() => onEdit(photo)}>
                    {t.gallery.edit}
                  </button>
                  <button
                    type="button"
                    className="link danger"
                    disabled={remove.isPending}
                    onClick={() => setDeleting(true)}
                  >
                    {t.gallery.delete}
                  </button>
                </>
              )}
            </div>
            {remove.isError && (
              <p className="error" role="alert">
                {t.saveFailed}
              </p>
            )}
          </>
        )}
      </Modal>
      <ConfirmDialog
        open={deleting}
        message={t.gallery.confirmDelete}
        confirmLabel={t.gallery.delete}
        cancelLabel={t.cancel}
        onConfirm={() => {
          setDeleting(false);
          remove.mutate(photo!.id, { onSuccess: () => onShow(next?.id ?? previous?.id ?? null) });
        }}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}

/** "1. Anna · 2. Bo · 3. Carl"; a team's two players share a place ("1. Anna & Bo"). */
function podium(photo: Photo): string {
  const places = new Map<string, string[]>();
  for (const { placement, name } of photo.placed) {
    places.set(placement, [...(places.get(placement) ?? []), name]);
  }
  return [...places]
    .map(([placement, names]) => `${t.placements[placement as Placement]} ${names.join(' & ')}`)
    .join(' · ');
}

/** The date, the tournament with its top three, and the tagged players. */
function PhotoCaption({ photo }: { photo: Photo }) {
  return (
    <div className="photo-caption">
      <p className="meta">
        {formatDate(photo.date)}
        {photo.season && ` · ${t.season.title} ${photo.season}`}
      </p>
      {photo.tournament && (
        <p>
          {t.gallery.winnerOf}{' '}
          <Link to={`/turneringer/${photo.tournament.id}`}>
            {t.tournaments.one} {formatDate(photo.tournament.date)}
          </Link>{' '}
          · {photo.tournament.format}
        </p>
      )}
      {photo.placed.length > 0 && <p>{podium(photo)}</p>}
      {photo.tagged.length > 0 && (
        <p>
          {t.gallery.onPhoto}: {photo.tagged.map((p) => p.name).join(', ')}
        </p>
      )}
    </div>
  );
}
