import { todayInDenmark } from '@franks/core';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api';
import { formatDate } from '../format';
import { PlayerSearch } from '../pages/CreateTournamentPage';
import {
  MAX_PHOTO_BYTES,
  NotAnImageError,
  thumbUrl,
  usePhotos,
  useUpdatePhoto,
  useUploadPhoto,
  type Photo,
} from '../photos';
import { t } from '../strings';
import { useConcludedTournaments } from '../tournaments';
import { Modal } from './Modal';

/** The message for a failed upload or save. */
function errorMessage(error: Error): string {
  if (error instanceof NotAnImageError) return t.gallery.notAnImage;
  if (error instanceof ApiError && error.code === 'not_an_image') return t.gallery.notAnImage;
  if (error instanceof ApiError && error.status === 413) return t.gallery.tooBig;
  return t.saveFailed;
}

/**
 * Uploads a photo, or edits `photo`: its date, the concluded tournament it's the winner picture
 * of, and the players tagged in it. `tournament` preselects a tournament for a new photo (from
 * the tournament's page), and its date.
 */
export function PhotoDialog({
  photo,
  tournament,
  onClose,
}: {
  photo?: Photo;
  tournament?: { id: number; date: string };
  onClose: () => void;
}) {
  const upload = useUploadPhoto();
  const update = useUpdatePhoto();
  const tournaments = useConcludedTournaments();
  const photos = usePhotos();
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(photo?.date ?? tournament?.date ?? todayInDenmark());
  const [tournamentId, setTournamentId] = useState(
    photo ? (photo.tournament?.id ?? null) : (tournament?.id ?? null),
  );
  const [tagged, setTagged] = useState(photo?.tagged ?? []);
  const preview = usePreview(file);

  const saving = upload.isPending || update.isPending;
  const error = upload.error ?? update.error;
  const tooBig = file !== null && file.size > MAX_PHOTO_BYTES;
  // A tournament has one winner picture; choosing this one replaces the other there.
  const replacesWinner =
    tournamentId !== null &&
    (photos.data ?? []).some((p) => p.tournament?.id === tournamentId && p.id !== photo?.id);

  const chooseTournament = (value: string) => {
    const id = value === '' ? null : Number(value);
    setTournamentId(id);
    // A winner picture is taken on the night.
    const chosen = tournaments.data?.find((x) => x.id === id);
    if (chosen) setDate(chosen.date);
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const details = { date, tournamentId, playerIds: tagged.map((p) => p.id) };
    if (photo) update.mutate({ id: photo.id, ...details }, { onSuccess: onClose });
    else if (file) upload.mutate({ file, ...details }, { onSuccess: onClose });
  };

  return (
    <Modal open onClose={onClose} className="photo-dialog">
      <form onSubmit={save}>
        <h2>{photo ? t.gallery.editTitle : t.gallery.upload}</h2>
        {photo ? (
          <img className="photo-dialog-preview" src={thumbUrl(photo)} alt="" />
        ) : (
          <>
            <label>
              {t.gallery.file}
              <input
                type="file"
                required
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {preview && <img className="photo-dialog-preview" src={preview} alt="" />}
          </>
        )}
        <label>
          {t.gallery.date}
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {t.gallery.tournament}
          <select value={tournamentId ?? ''} onChange={(e) => chooseTournament(e.target.value)}>
            <option value="">{t.gallery.noTournament}</option>
            {(tournaments.data ?? []).map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {formatDate(tournament.date)} · {tournament.format}
                {tournament.winner ? ` · ${tournament.winner}` : ''}
              </option>
            ))}
          </select>
        </label>
        {replacesWinner && <p className="muted small">{t.gallery.replacesWinner}</p>}
        <div>
          <span className="label">{t.gallery.tagged}</span>
          {tagged.length > 0 && (
            <ul className="tags">
              {tagged.map((player) => (
                <li key={player.id}>
                  {player.name}
                  <button
                    type="button"
                    aria-label={t.gallery.untag(player.name)}
                    onClick={() => setTagged(tagged.filter((p) => p.id !== player.id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <PlayerSearch
            excluded={tagged}
            allowNew={false}
            placeholder={t.gallery.tagPlayer}
            onAdd={(player) => setTagged([...tagged, { id: player.id, name: player.name }])}
          />
        </div>
        {(tooBig || error) && (
          <p className="error" role="alert">
            {tooBig ? t.gallery.tooBig : errorMessage(error!)}
          </p>
        )}
        <div className="confirm-buttons">
          <button
            type="submit"
            className="primary"
            disabled={saving || tooBig || (!photo && !file)}
          >
            {upload.isPending ? t.gallery.uploading : photo ? t.save : t.gallery.upload}
          </button>
          <button type="button" className="link" onClick={onClose}>
            {t.cancel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** A URL to show the chosen file before it's uploaded. */
function usePreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}
