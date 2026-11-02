import { formatDate } from '../format';
import { photoAlt, thumbUrl, type Photo } from '../photos';

/** Thumbnails in a grid, cropped square; `dated` writes each photo's date under it. */
export function PhotoGrid({
  photos,
  onPick,
  dated = false,
}: {
  photos: Photo[];
  onPick: (photo: Photo) => void;
  dated?: boolean;
}) {
  return (
    <ul className="gallery-grid">
      {photos.map((photo) => (
        <li key={photo.id}>
          <button type="button" onClick={() => onPick(photo)}>
            <img src={thumbUrl(photo)} alt={photoAlt(photo)} loading="lazy" />
            {dated && <span className="gallery-date">{formatDate(photo.date)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
