import { useState } from 'react';
import { useSession } from '../auth';
import { PhotoDialog } from '../components/PhotoDialog';
import { PhotoGrid } from '../components/PhotoGrid';
import { PhotoViewer } from '../components/PhotoViewer';
import { TableSearch } from '../components/TableView';
import { byYearAndMonth, photoMatches, usePhotos, type Photo } from '../photos';
import { t } from '../strings';

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
  /** The photo being edited, or 'new' while uploading. */
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
