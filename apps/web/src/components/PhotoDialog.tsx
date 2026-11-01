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
 * Uploads photos, or edits `photo`: the date, the concluded tournament it's the winner picture
 * of, and the players tagged in it. Several photos can be uploaded at once with the same date and
 * players, one after the other; a tournament can only be chosen for a single photo. `tournament`
 * preselects a tournament for a new photo (from the tournament's page), and its date; then only
 * one photo can be chosen.
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
  const [files, setFiles] = useState<File[]>([]);
  /** While uploading: how many are done, of how many. */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** The photos the last upload failed for, with why. */
  const [failures, setFailures] = useState<{ file: File; message: string }[]>([]);
  /** Changed to empty the file field after an upload with failures. */
  const [fileField, setFileField] = useState(0);
  /** The last upload had several photos, so the failures name theirs. */
  const [failedInBatch, setFailedInBatch] = useState(false);
  const [date, setDate] = useState(photo?.date ?? tournament?.date ?? todayInDenmark());
  const [tournamentId, setTournamentId] = useState(
    photo ? (photo.tournament?.id ?? null) : (tournament?.id ?? null),
  );
  const [tagged, setTagged] = useState(photo?.tagged ?? []);
  const previews = usePreviews(files);

  const many = files.length > 1;
  const saving = progress !== null || update.isPending;
  const error = update.error;
  const tooBig = files.filter((file) => file.size > MAX_PHOTO_BYTES);
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

  const chooseFiles = (list: FileList | null) => {
    const chosen = [...(list ?? [])];
    setFiles(chosen);
    setFailures([]);
    if (chosen.length > 1) setTournamentId(null);
  };

  /** Uploads the photos one by one; the dialog closes when all went well. */
  const uploadAll = async () => {
    const details = {
      date,
      tournamentId: many ? null : tournamentId,
      playerIds: tagged.map((p) => p.id),
    };
    const failed: { file: File; message: string }[] = [];
    setFailures([]);
    for (const [i, file] of files.entries()) {
      setProgress({ done: i, total: files.length });
      try {
        await upload.mutateAsync({ file, ...details });
      } catch (e) {
        failed.push({ file, message: errorMessage(e as Error) });
      }
    }
    setProgress(null);
    if (failed.length === 0) return onClose();
    // The photos that went well are in the gallery; the failed ones are named, to choose again.
    setFailures(failed);
    setFailedInBatch(files.length > 1);
    setFiles([]);
    setFileField(fileField + 1);
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const details = { date, tournamentId, playerIds: tagged.map((p) => p.id) };
    if (photo) update.mutate({ id: photo.id, ...details }, { onSuccess: onClose });
    else if (files.length > 0) void uploadAll();
  };

  return (
    <Modal open onClose={saving ? () => {} : onClose} className="photo-dialog">
      <form onSubmit={save}>
        <h2>{photo ? t.gallery.editTitle : t.gallery.upload}</h2>
        {photo ? (
          <img className="photo-dialog-preview" src={thumbUrl(photo)} alt="" />
        ) : (
          <>
            <label>
              {tournament ? t.gallery.file : t.gallery.files}
              <input
                key={fileField}
                type="file"
                required={files.length === 0}
                multiple={!tournament}
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => chooseFiles(e.target.files)}
              />
            </label>
            {previews.length === 1 && (
              <img className="photo-dialog-preview" src={previews[0]} alt="" />
            )}
            {many && (
              <>
                <ul className="photo-dialog-previews">
                  {previews.map((url) => (
                    <li key={url}>
                      <img src={url} alt="" />
                    </li>
                  ))}
                </ul>
                <p className="muted small">{t.gallery.manyHelp}</p>
              </>
            )}
          </>
        )}
        <label>
          {t.gallery.date}
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {t.gallery.tournament}
          <select
            value={tournamentId ?? ''}
            disabled={many}
            onChange={(e) => chooseTournament(e.target.value)}
          >
            <option value="">{t.gallery.noTournament}</option>
            {(tournaments.data ?? []).map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {formatDate(tournament.date)} · {tournament.format}
                {tournament.winner ? ` · ${tournament.winner}` : ''}
              </option>
            ))}
          </select>
        </label>
        {many ? (
          <p className="muted small">{t.gallery.oneWinner}</p>
        ) : (
          replacesWinner && <p className="muted small">{t.gallery.replacesWinner}</p>
        )}
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
        {tooBig.length > 0 && (
          <p className="error" role="alert">
            {t.gallery.tooBig} {tooBig.map((file) => file.name).join(', ')}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {errorMessage(error)}
          </p>
        )}
        {failures.length > 0 && (
          <div className="error" role="alert">
            {!failedInBatch ? (
              <p>{failures[0]!.message}</p>
            ) : (
              <>
                <p>{t.gallery.failed}</p>
                <ul>
                  {failures.map(({ file, message }) => (
                    <li key={file.name}>
                      {file.name}: {message}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <div className="confirm-buttons">
          <button
            type="submit"
            className="primary"
            disabled={saving || tooBig.length > 0 || (!photo && files.length === 0)}
          >
            {progress
              ? progress.total > 1
                ? t.gallery.uploadingCount(progress.done + 1, progress.total)
                : t.gallery.uploading
              : photo
                ? t.save
                : many
                  ? t.gallery.uploadMany(files.length)
                  : t.gallery.upload}
          </button>
          <button type="button" className="link" disabled={saving} onClick={onClose}>
            {t.cancel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** URLs to show the chosen files before they're uploaded. */
function usePreviews(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const objectUrls = files.map((file) => URL.createObjectURL(file));
    setUrls(objectUrls);
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  return urls;
}
