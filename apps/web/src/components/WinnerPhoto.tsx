import { useState } from 'react';
import { formatDate } from '../format';
import { detailsOf, imageUrl, usePhotos, useUpdatePhoto, type Photo } from '../photos';
import { t } from '../strings';
import { ConfirmDialog } from './ConfirmDialog';
import { Modal } from './Modal';
import { PhotoDialog } from './PhotoDialog';
import { PhotoGrid } from './PhotoGrid';

/** The tournament's winner picture, if it has one. */
function useWinnerPhoto(tournamentId: number): Photo | undefined {
  return usePhotos().data?.find((photo) => photo.tournament?.id === tournamentId);
}

/** The winner picture on a concluded tournament's page; nothing until one is added. */
export function WinnerPhoto({ tournament }: { tournament: { id: number; date: string } }) {
  const photo = useWinnerPhoto(tournament.id);
  if (!photo) return null;
  return (
    <figure className="winner-photo">
      <a href={imageUrl(photo)} target="_blank" rel="noreferrer">
        <img
          src={imageUrl(photo)}
          alt={t.winnerPhoto.alt(formatDate(tournament.date))}
          width={photo.width}
          height={photo.height}
        />
      </a>
    </figure>
  );
}

/**
 * The winner picture in a concluded tournament's admin panel: upload one, choose one from the
 * gallery, or remove it from the tournament (it stays in the gallery).
 */
export function WinnerPhotoAdmin({ tournament }: { tournament: { id: number; date: string } }) {
  const photo = useWinnerPhoto(tournament.id);
  const update = useUpdatePhoto();
  const [open, setOpen] = useState<'upload' | 'choose' | 'remove' | null>(null);
  const close = () => setOpen(null);

  return (
    <div>
      <h3>{t.winnerPhoto.title}</h3>
      <div className="admin-panel-actions">
        <button type="button" className="secondary" onClick={() => setOpen('upload')}>
          {t.winnerPhoto.upload}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen('choose')}>
          {t.winnerPhoto.choose}
        </button>
        {photo && (
          <button
            type="button"
            className="link"
            disabled={update.isPending}
            onClick={() => setOpen('remove')}
          >
            {t.winnerPhoto.remove}
          </button>
        )}
      </div>
      {update.isError && (
        <p className="error" role="alert">
          {t.saveFailed}
        </p>
      )}
      {open === 'upload' && <PhotoDialog tournament={tournament} onClose={close} />}
      {open === 'choose' && (
        <ChoosePhotoDialog
          tournament={tournament}
          onChoose={(chosen) =>
            update.mutate(
              { id: chosen.id, ...detailsOf(chosen), tournamentId: tournament.id },
              { onSuccess: close },
            )
          }
          onClose={close}
        />
      )}
      <ConfirmDialog
        open={open === 'remove'}
        message={t.winnerPhoto.confirmRemove}
        confirmLabel={t.winnerPhoto.remove}
        cancelLabel={t.cancel}
        onConfirm={() => {
          close();
          update.mutate({ id: photo!.id, ...detailsOf(photo!), tournamentId: null });
        }}
        onCancel={close}
      />
    </div>
  );
}

/** Days between two YYYY-MM-DD dates. */
const daysApart = (a: string, b: string) =>
  Math.abs(Date.parse(a) - Date.parse(b)) / (24 * 60 * 60 * 1000);

/**
 * The gallery's photos that aren't a winner picture yet, those taken nearest the tournament's
 * date first. Picking one makes it the tournament's winner picture.
 */
function ChoosePhotoDialog({
  tournament,
  onChoose,
  onClose,
}: {
  tournament: { id: number; date: string };
  onChoose: (photo: Photo) => void;
  onClose: () => void;
}) {
  const photos = usePhotos();
  const free = (photos.data ?? [])
    .filter((photo) => photo.tournament === null)
    .sort((a, b) => daysApart(a.date, tournament.date) - daysApart(b.date, tournament.date));

  return (
    <Modal open onClose={onClose} className="photo-dialog">
      <h2>{t.winnerPhoto.chooseTitle}</h2>
      {photos.isPending ? (
        <p>{t.loading}</p>
      ) : free.length === 0 ? (
        <p className="muted">{t.winnerPhoto.noneToChoose}</p>
      ) : (
        <PhotoGrid photos={free} onPick={onChoose} dated />
      )}
      <div className="confirm-buttons">
        <button type="button" className="link" onClick={onClose}>
          {t.cancel}
        </button>
      </div>
    </Modal>
  );
}
