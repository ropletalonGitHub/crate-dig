import { useEffect, useMemo, useState } from "react";
import { fetchArtist, fetchTracksByArtist, saveRating } from "../api";
import { useStore, currentTrack } from "../store";
import type { ArtistDetail, Track } from "../types";
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

type AlbumGroup = {
  id: number | null;
  title: string;
  year: number | null;
  tracks: Track[];
};

function groupByAlbum(tracks: Track[], albumOrder: { id: number; title: string; year: number | null }[]): AlbumGroup[] {
  const map = new Map<string, AlbumGroup>();
  for (const t of tracks) {
    const key = t.albumId != null ? `id:${t.albumId}` : `name:${t.album ?? ""}`;
    let g = map.get(key);
    if (!g) {
      g = {
        id: t.albumId,
        title: t.album ?? "Unknown Album",
        year: t.year,
        tracks: [],
      };
      map.set(key, g);
    }
    g.tracks.push(t);
  }
  for (const g of map.values()) g.tracks.sort(byPath);

  const orderIndex = new Map<number, number>();
  albumOrder.forEach((a, i) => orderIndex.set(a.id, i));
  return Array.from(map.values()).sort((a, b) => {
    const ai = a.id != null ? orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    const bi = b.id != null ? orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    const ay = a.year ?? Number.MAX_SAFE_INTEGER;
    const by = b.year ?? Number.MAX_SAFE_INTEGER;
    if (ay !== by) return ay - by;
    return a.title.localeCompare(b.title);
  });
}

export function ArtistPage({ artistId }: { artistId: number }) {
  const [data, setData] = useState<ArtistDetail | null>(null);
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
    Promise.all([fetchArtist(artistId), fetchTracksByArtist(artistId)])
      .then(([a, ts]) => {
        if (cancelled) return;
        setData(a);
        setRows(ts);
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setRows([]);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [artistId]);

  const groups = useMemo(() => (data ? groupByAlbum(rows, data.albums) : []), [rows, data]);
  const flatTracks = useMemo(() => groups.flatMap((g) => g.tracks), [groups]);

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
  if (!data) return <div className="p-6 text-neutral-500 text-sm">Artist not found.</div>;

  return (
    <div className="text-sm">
      <div className="p-6 pb-4 border-b border-neutral-900">
        <div className="text-xs uppercase tracking-wide text-neutral-500">Artist</div>
        <h2 className="text-2xl font-semibold text-neutral-100">{data.name}</h2>
        <div className="text-xs text-neutral-500 mt-1">
          {data.albums.length} albums · {data.totalTracks} tracks · {fmtHms(data.totalDurationS)}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => flatTracks.length && playList(flatTracks, 0)}
            disabled={flatTracks.length === 0}
            className="px-3 py-1 rounded bg-neutral-100 text-neutral-900 hover:bg-white text-xs font-medium disabled:opacity-50"
          >
            ▶ Play all
          </button>
          <button
            onClick={() => {
              if (!flatTracks.length) return;
              const shuffled = flatTracks.slice();
              for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
              }
              playList(shuffled, 0);
            }}
            disabled={flatTracks.length === 0}
            className="px-3 py-1 rounded bg-neutral-800 text-neutral-100 hover:bg-neutral-700 text-xs font-medium disabled:opacity-50"
          >
            🔀 Shuffle
          </button>
        </div>
      </div>
      {groups.length === 0 ? (
        <div className="p-6 text-neutral-500">No tracks in library.</div>
      ) : (
        groups.map((g) => {
          const offset = groups
            .slice(0, groups.indexOf(g))
            .reduce((n, x) => n + x.tracks.length, 0);
          const groupDuration = g.tracks.reduce((n, t) => n + (t.durationS ?? 0), 0);
          return (
            <div key={`${g.id ?? "x"}-${g.title}`} className="border-b border-neutral-900">
              <div className="px-6 pt-5 pb-2 flex items-baseline justify-between">
                <div>
                  {g.id != null ? (
                    <button
                      onClick={() => push({ type: "album", id: g.id! })}
                      className="text-lg font-semibold text-neutral-100 hover:underline text-left"
                    >
                      {g.title}
                    </button>
                  ) : (
                    <div className="text-lg font-semibold text-neutral-100">{g.title}</div>
                  )}
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {g.year ?? "—"} · {g.tracks.length} tracks · {fmtHms(groupDuration)}
                  </div>
                </div>
                <button
                  onClick={() => playList(flatTracks, offset)}
                  className="px-2 py-1 rounded bg-neutral-800 text-neutral-100 hover:bg-neutral-700 text-xs font-medium"
                >
                  ▶ Play
                </button>
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
                  {g.tracks.map((t, idx) => (
                    <tr
                      key={t.id}
                      onDoubleClick={() => playList(flatTracks, offset + idx)}
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
        })
      )}
    </div>
  );
}
