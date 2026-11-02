import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatDate } from '../format';
import { imageUrl, photoAlt, useDeletePhoto, type Photo } from '../photos';
import { t } from '../strings';
import type { Placement } from '../tournaments';
import { ConfirmDialog } from './ConfirmDialog';
import { Modal } from './Modal';

/**
 * The photo `photoId` large, with its date, tournament and players: fitted to the screen, and at
 * its full size (scrolling) after a click on it. The arrows (and the arrow keys) go through
 * `photos`. With `onEdit` (admins) it can be edited and deleted.
 */
export function PhotoViewer({
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
  /** Shown at its full size instead of fitted to the screen. */
  const [fullSize, setFullSize] = useState(false);
  const index = photos.findIndex((photo) => photo.id === photoId);
  const photo = photos[index];
  const previous = photos[index - 1];
  const next = photos[index + 1];

  // Every photo opens fitted to the screen.
  useEffect(() => setFullSize(false), [photoId]);

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
            <div className={fullSize ? 'photo-viewer-image full-size' : 'photo-viewer-image'}>
              <img
                src={imageUrl(photo)}
                alt={photoAlt(photo)}
                title={fullSize ? t.gallery.fitToScreen : t.gallery.fullSize}
                width={photo.width}
                height={photo.height}
                onClick={() => setFullSize(!fullSize)}
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
