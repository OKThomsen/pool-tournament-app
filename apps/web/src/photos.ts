import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { matchesWordStart } from './components/TableView';
import { formatDate } from './format';
import { t } from './strings';
import type { GameFormat, Placement } from './tournaments';

/** A photo in the gallery. */
export interface Photo {
  id: number;
  /** YYYY-MM-DD, the day it was taken. */
  date: string;
  width: number;
  height: number;
  /** "2/2026": the tournament's season for a winner picture, else the photo's; null off-season. */
  season: string | null;
  /** The tournament this is the winner picture of. */
  tournament: {
    id: number;
    date: string;
    format: GameFormat;
    duo: boolean;
    forFun: boolean;
  } | null;
  /** The tournament's 1st to 3rd (both players of a team), best first. */
  placed: { playerId: number; name: string; placement: Placement }[];
  /** Players an admin tagged in the photo, by name. */
  tagged: { id: number; name: string }[];
}

export interface PhotoDetails {
  date: string;
  tournamentId: number | null;
  playerIds: number[];
}

/** The largest original the server takes. */
export const MAX_PHOTO_BYTES = 40 * 1024 * 1024;
/** Thumbnails are this many pixels on their short side (the grid crops them square). */
const THUMB_SIZE = 480;

export const imageUrl = (photo: { id: number }) => `/api/photos/${photo.id}/image`;
export const thumbUrl = (photo: { id: number }) => `/api/photos/${photo.id}/thumb`;

const photosKey = ['photos'];

/** Every photo, newest first. */
export function usePhotos() {
  return useQuery({ queryKey: photosKey, queryFn: () => api<Photo[]>('/photos') });
}

/**
 * Reads the image's size and makes a JPEG thumbnail of it, turned the right way up (the browser
 * applies the photo's orientation). Rejects when the browser can't read the file as an image.
 */
async function thumbnail(file: File): Promise<{ thumb: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, THUMB_SIZE / Math.min(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const thumb = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82),
  );
  if (!thumb) throw new Error('Could not make a thumbnail');
  return { thumb, width, height };
}

/** Thrown before uploading a file the browser can't read as an image. */
export class NotAnImageError extends Error {}

export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, ...details }: PhotoDetails & { file: File }) => {
      const { thumb, width, height } = await thumbnail(file).catch(() => {
        throw new NotAnImageError();
      });
      const form = new FormData();
      form.append('image', file);
      form.append('thumb', thumb, 'thumb.jpg');
      form.append('data', JSON.stringify({ ...details, width, height }));
      return api<Photo>('/photos', { method: 'POST', body: form });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photosKey }),
  });
}

export function useUpdatePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...details }: PhotoDetails & { id: number }) =>
      api<Photo>(`/photos/${id}`, { method: 'PUT', body: details }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photosKey }),
  });
}

export function useDeletePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/photos/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photosKey }),
  });
}

/** A photo's details as they are, to change one of them. */
export function detailsOf(photo: Photo): PhotoDetails {
  return {
    date: photo.date,
    tournamentId: photo.tournament?.id ?? null,
    playerIds: photo.tagged.map((player) => player.id),
  };
}

/**
 * Whether the gallery's search finds the photo: every word must match the start of a word in the
 * names (the top three of a winner picture and the tagged players), the format, the season
 * ("2/2026"), the year or the month's name, or be part of the date as shown ("10-2026").
 */
export function photoMatches(photo: Photo, query: string): boolean {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const dates = [photo.date, photo.tournament?.date].flatMap((d) => (d ? [formatDate(d)] : []));
  const text = [
    ...photo.placed.map((p) => p.name),
    ...photo.tagged.map((p) => p.name),
    photo.tournament?.format,
    photo.season && `${t.season.title} ${photo.season}`,
    photo.date.slice(0, 4),
    t.months[Number(photo.date.slice(5, 7)) - 1],
  ]
    .filter(Boolean)
    .join(' ');
  return words.every((word) => matchesWordStart(text, word) || dates.some((d) => d.includes(word)));
}

export interface MonthOfPhotos {
  /** 1 to 12. */
  month: number;
  photos: Photo[];
}

/** Photos (newest first) by year and month, newest first. */
export function byYearAndMonth(photos: Photo[]): { year: number; months: MonthOfPhotos[] }[] {
  const years: { year: number; months: MonthOfPhotos[] }[] = [];
  for (const photo of photos) {
    const year = Number(photo.date.slice(0, 4));
    const month = Number(photo.date.slice(5, 7));
    if (years.at(-1)?.year !== year) years.push({ year, months: [] });
    const months = years.at(-1)!.months;
    if (months.at(-1)?.month !== month) months.push({ month, photos: [] });
    months.at(-1)!.photos.push(photo);
  }
  return years;
}

/** Who is in the photo, for its alt text: the top three, else the tagged players. */
export function photoAlt(photo: Photo): string {
  const names = (photo.placed.length > 0 ? photo.placed : photo.tagged).map((p) => p.name);
  return names.length > 0 ? names.join(', ') : formatDate(photo.date);
}
