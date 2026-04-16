import { useEffect, useState } from "react";
import { fetchAlbum, fetchTracksByAlbum, saveRating } from "../api";
import { useStore, currentTrack } from "../store";
import type { AlbumDetail, Track } from "../types";
import { Stars } from "./Stars";

function fmtDuration(s: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function fmtHms(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

// Sort by filename (path) so tracks show in disc order "01 ..., 02 ..., ..."
function byPath(a: Track, b: Track) {
  return a.path.localeCompare(b.path);
}

export function AlbumPage({ albumId }: { albumId: number }) {
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [rows, setRows] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const push = useStore((s) => s.push);
  const playList = useStore((s) => s.playList);
  const enqueue = useStore((s) => s.enqueue);
  const current = useStore(currentTrack);
  const bumpRevision = useStore((s) => s.bumpRevision);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchAlbum(albumId), fetchTracksByAlbum(albumId)])
      .then(([a, ts]) => {
        if (cancelled) return;
        setAlbum(a);
        setRows(ts.slice().sort(byPath));
      })
      .catch(() => {
        if (!cancelled) {
          setAlbum(null);
          setRows([]);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [albumId]);

  const setStars = async (t: Track, stars: number) => {
    setRows((prev) => prev.map((r) => (r.id === t.id ? { ...r, stars } : r)));
    await saveRating(t.id, stars, t.favorite);
    bumpRevision();
  };
  const toggleFavorite = async (t: Track) => {
    const next = !t.favorite;
    setRows((prev) => prev.map((r) => (r.id === t.id ? { ...r, favorite: next } : r)));
    await saveRating(t.id, t.stars, next);
    bumpRevision();
  };

  if (loading) return <div className="p-6 text-neutral-500 text-sm">Loading…</div>;
  if (!album) return <div className="p-6 text-neutral-500 text-sm">Album not found.</div>;

  return (
    <div className="text-sm">
      <div className="p-6 pb-4 border-b border-neutral-900">
        <div className="text-xs uppercase tracking-wide text-neutral-500">Album</div>
        <h2 className="text-2xl font-semibold text-neutral-100">{album.title}</h2>
        <div className="text-xs text-neutral-400 mt-1">
          {album.artist && (
            <button
              onClick={() => album.artistId != null && push({ type: "artist", id: album.artistId })}
              className="hover:underline"
            >
              {album.artist}
            </button>
          )}
          {album.year != null && <span> · {album.year}</span>}
          <span> · {album.totalTracks} tracks · {fmtHms(album.totalDurationS)}</span>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => rows.length && playList(rows, 0)}
            disabled={rows.length === 0}
            className="px-3 py-1 rounded bg-neutral-100 text-neutral-900 hover:bg-white text-xs font-medium disabled:opacity-50"
          >
            ▶ Play album
          </button>
          <button
            onClick={() => {
              if (!rows.length) return;
              const shuffled = rows.slice();
              for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
              }
              playList(shuffled, 0);
            }}
            disabled={rows.length === 0}
            className="px-3 py-1 rounded bg-neutral-800 text-neutral-100 hover:bg-neutral-700 text-xs font-medium disabled:opacity-50"
          >
            🔀 Shuffle
          </button>
        </div>
      </div>
      <table className="w-full table-fixed">
        <thead className="bg-neutral-950 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="w-[5%]"></th>
            <th className="w-[5%] text-right px-3 py-2 font-normal">#</th>
            <th className="w-[40%] text-left px-3 py-2 font-normal">Title</th>
            <th className="w-[8%] text-left px-3 py-2 font-normal">Time</th>
            <th className="w-[8%] text-left px-3 py-2 font-normal">Chart</th>
            <th className="w-[34%] text-left px-3 py-2 font-normal">Rating</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, idx) => (
            <tr
              key={t.id}
              onDoubleClick={() => playList(rows, idx)}
              className={`border-t border-neutral-900 hover:bg-neutral-900 cursor-pointer ${
                current?.id === t.id ? "bg-neutral-800/60" : ""
              }`}
            >
              <td className="px-2 py-1.5 text-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(t);
                  }}
                  className={t.favorite ? "text-pink-500" : "text-neutral-700 hover:text-neutral-500"}
                >
                  ♥
                </button>
              </td>
              <td className="px-3 py-1.5 text-right text-neutral-500 tabular-nums">{idx + 1}</td>
              <td className="px-3 py-1.5 truncate">{t.title}</td>
              <td className="px-3 py-1.5 text-neutral-500">{fmtDuration(t.durationS)}</td>
              <td className="px-3 py-1.5 text-neutral-400 tabular-nums">
                {t.chartRank != null ? `#${t.chartRank}` : ""}
              </td>
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <Stars value={t.stars} onChange={(v) => setStars(t, v)} size="text-sm" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      enqueue(t);
                    }}
                    className="text-xs text-neutral-500 hover:text-neutral-300"
                    title="Add to queue"
                  >
                    +Q
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
