import { useEffect, useMemo, useState } from "react";
import { useStore, currentTrack } from "../store";
import { fetchTracks, saveRating } from "../api";
import type { Track } from "../types";
import { Stars } from "./Stars";
import { variantKey } from "../lib/norm";

function fmtDuration(s: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const COLS: { key: "title" | "artist" | "album" | "year" | "duration" | "stars" | "chart"; label: string; w: string }[] = [
  { key: "title", label: "Title", w: "w-[24%]" },
  { key: "artist", label: "Artist", w: "w-[18%]" },
  { key: "album", label: "Album", w: "w-[18%]" },
  { key: "year", label: "Year", w: "w-[6%]" },
  { key: "duration", label: "Time", w: "w-[6%]" },
  { key: "chart", label: "Chart", w: "w-[8%]" },
  { key: "stars", label: "Rating", w: "w-[14%]" },
];

// Rank variants: favorite first, then stars, then chart rank (lower is better),
// then bitrate, then earliest id.
function scoreVariant(t: Track): number[] {
  return [
    t.favorite ? 1 : 0,
    t.stars,
    t.chartRank != null ? -t.chartRank : -9999,
    t.bitrate ?? 0,
    -t.id,
  ];
}

function bestVariant(list: Track[]): Track {
  return list.slice().sort((a, b) => {
    const sa = scoreVariant(a);
    const sb = scoreVariant(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i];
    return 0;
  })[0];
}

// Build variant groups while preserving the incoming row order:
// the "position" of a group is the earliest index at which any of its
// members first appeared in the flat list.
type VariantGroup = { key: string; rep: Track; variants: Track[]; firstIdx: number };

function buildGroups(rows: Track[]): VariantGroup[] {
  const byKey = new Map<string, VariantGroup>();
  rows.forEach((t, idx) => {
    const key = variantKey(t.artist, t.title);
    const g = byKey.get(key);
    if (g) g.variants.push(t);
    else byKey.set(key, { key, rep: t, variants: [t], firstIdx: idx });
  });
  const out = Array.from(byKey.values());
  for (const g of out) g.rep = bestVariant(g.variants);
  return out.sort((a, b) => a.firstIdx - b.firstIdx);
}

export function TrackTable() {
  const filters = useStore((s) => s.filters);
  const setFilter = useStore((s) => s.setFilter);
  const current = useStore(currentTrack);
  const playList = useStore((s) => s.playList);
  const enqueue = useStore((s) => s.enqueue);
  const revision = useStore((s) => s.revision);
  const bumpRevision = useStore((s) => s.bumpRevision);
  const setEditingTrackId = useStore((s) => s.setEditingTrackId);
  const push = useStore((s) => s.push);

  const [rows, setRows] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());

  const debouncedFilters = useDebounced(filters, 200);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTracks(debouncedFilters)
      .then((r) => !cancelled && setRows(r))
      .catch(() => !cancelled && setRows([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debouncedFilters, revision]);

  // Collapse back whenever the result set changes meaningfully.
  useEffect(() => setExpanded(new Set()), [rows]);

  const groups = useMemo(
    () => (filters.groupVariants ? buildGroups(rows) : rows.map((t, idx) => ({ key: `r${t.id}`, rep: t, variants: [t], firstIdx: idx }))),
    [rows, filters.groupVariants],
  );

  const toggleSort = (key: (typeof COLS)[number]["key"]) => {
    if (filters.sort === key) setFilter("dir", filters.dir === "asc" ? "desc" : "asc");
    else {
      setFilter("sort", key);
      setFilter("dir", key === "stars" ? "desc" : "asc");
    }
  };

  const toggleExpanded = (key: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleFavorite = async (t: Track) => {
    const next = !t.favorite;
    setRows((prev) => prev.map((r) => (r.id === t.id ? { ...r, favorite: next } : r)));
    await saveRating(t.id, t.stars, next);
    bumpRevision();
  };

  const setStars = async (t: Track, stars: number) => {
    setRows((prev) => prev.map((r) => (r.id === t.id ? { ...r, stars } : r)));
    await saveRating(t.id, stars, t.favorite);
    bumpRevision();
  };

  // Double-click plays: for a variant group, queue all variants; for a single
  // track, queue the current representative list (so ⏭ walks the visible order).
  const playFromRepresentatives = (repIdx: number) => {
    const reps = groups.map((g) => g.rep);
    playList(reps, repIdx);
  };

  // For "Play all" / "Shuffle" on a filtered list, use one track per variant
  // group when grouping is on, otherwise the full row list.
  const playableList = (): Track[] =>
    filters.groupVariants ? groups.map((g) => g.rep) : rows;

  const playAll = () => {
    const list = playableList();
    if (list.length) playList(list, 0);
  };
  const shufflePlay = () => {
    const list = playableList().slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    if (list.length) playList(list, 0);
  };

  const totalCount = filters.groupVariants
    ? `${rows.length} tracks · ${groups.length} songs`
    : `${rows.length} tracks`;

  return (
    <div className="text-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-900 bg-neutral-950 sticky top-0 z-20">
        <div className="text-xs text-neutral-500">{rows.length > 0 ? totalCount : "No matches"}</div>
        <div className="flex items-center gap-2">
          <button
            onClick={playAll}
            disabled={rows.length === 0}
            className="text-xs px-2.5 py-1 rounded bg-neutral-100 text-neutral-900 hover:bg-white disabled:opacity-40"
            title="Play all matching tracks"
          >
            ▶ Play all
          </button>
          <button
            onClick={shufflePlay}
            disabled={rows.length === 0}
            className="text-xs px-2.5 py-1 rounded bg-neutral-800 text-neutral-100 hover:bg-neutral-700 disabled:opacity-40"
            title="Shuffle all matching tracks"
          >
            🔀 Shuffle
          </button>
        </div>
      </div>
      <table className="w-full table-fixed">
        <thead className="bg-neutral-950 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="w-[4%]"></th>
            {COLS.map((c) => (
              <th
                key={c.key}
                onClick={() => toggleSort(c.key)}
                className={`${c.w} text-left px-3 py-2 font-normal cursor-pointer select-none hover:text-neutral-300`}
              >
                {c.label}
                {filters.sort === c.key && <span className="ml-1">{filters.dir === "asc" ? "▲" : "▼"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 && (
            <tr>
              <td colSpan={COLS.length + 1} className="px-3 py-6 text-neutral-500">
                Loading…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={COLS.length + 1} className="px-3 py-6 text-neutral-500">
                No tracks match. Try clearing filters or run <code className="text-neutral-300">npm run scan</code>.
              </td>
            </tr>
          )}
          {groups.map((g, gIdx) => {
            const t = g.rep;
            const hasVariants = g.variants.length > 1;
            const isExpanded = expanded.has(g.key);
            return (
              <RowFragment key={g.key}>
                <tr
                  onDoubleClick={() => {
                    if (hasVariants) playList(g.variants, 0);
                    else playFromRepresentatives(gIdx);
                  }}
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
                      title={t.favorite ? "Unfavorite" : "Favorite"}
                    >
                      ♥
                    </button>
                  </td>
                  <td className="px-3 py-1.5 truncate">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {hasVariants ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(g.key);
                          }}
                          className="text-neutral-500 hover:text-neutral-200 shrink-0 w-4 text-left"
                          title={isExpanded ? "Collapse variants" : `${g.variants.length} variants`}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                      ) : (
                        <span className="shrink-0 w-4" />
                      )}
                      <span className="truncate">{t.title}</span>
                      {hasVariants && (
                        <span className="ml-1 text-xs text-neutral-500 shrink-0">×{g.variants.length}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 truncate text-neutral-400">
                    {t.artistId != null && t.artist ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          push({ type: "artist", id: t.artistId! });
                        }}
                        className="hover:text-neutral-100 hover:underline truncate text-left w-full"
                      >
                        {t.artist}
                      </button>
                    ) : (
                      t.artist ?? ""
                    )}
                  </td>
                  <td className="px-3 py-1.5 truncate text-neutral-400">
                    {t.albumId != null && t.album ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          push({ type: "album", id: t.albumId! });
                        }}
                        className="hover:text-neutral-100 hover:underline truncate text-left w-full"
                      >
                        {t.album}
                      </button>
                    ) : (
                      t.album ?? ""
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-neutral-500">{t.year ?? ""}</td>
                  <td className="px-3 py-1.5 text-neutral-500">{fmtDuration(t.durationS)}</td>
                  <td className="px-3 py-1.5 text-neutral-400 tabular-nums" title="Best global chart rank">
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTrackId(t.id);
                        }}
                        className="text-xs text-neutral-500 hover:text-neutral-300"
                        title="Edit types & tags"
                      >
                        …
                      </button>
                    </div>
                  </td>
                </tr>
                {hasVariants &&
                  isExpanded &&
                  g.variants.map((v) => (
                    <tr
                      key={v.id}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        playList(g.variants, g.variants.indexOf(v));
                      }}
                      className={`border-t border-neutral-900/50 bg-neutral-950 hover:bg-neutral-900 cursor-pointer ${
                        current?.id === v.id ? "bg-neutral-800/60" : ""
                      }`}
                    >
                      <td className="px-2 py-1 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(v);
                          }}
                          className={v.favorite ? "text-pink-500" : "text-neutral-700 hover:text-neutral-500"}
                        >
                          ♥
                        </button>
                      </td>
                      <td className="px-3 py-1 truncate text-neutral-400">
                        <span className="ml-5">└ {v.title}</span>
                      </td>
                      <td className="px-3 py-1 truncate text-neutral-500">{v.artist ?? ""}</td>
                      <td className="px-3 py-1 truncate text-neutral-500">{v.album ?? ""}</td>
                      <td className="px-3 py-1 text-neutral-600">{v.year ?? ""}</td>
                      <td className="px-3 py-1 text-neutral-600">{fmtDuration(v.durationS)}</td>
                      <td className="px-3 py-1 text-neutral-500 tabular-nums">
                        {v.chartRank != null ? `#${v.chartRank}` : ""}
                      </td>
                      <td className="px-3 py-1">
                        <div className="flex items-center gap-2">
                          <Stars value={v.stars} onChange={(val) => setStars(v, val)} size="text-xs" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              enqueue(v);
                            }}
                            className="text-xs text-neutral-600 hover:text-neutral-300"
                            title="Add to queue"
                          >
                            +Q
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </RowFragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Keys on <> fragments don't round-trip through TS strict JSX in all setups;
// use a tiny wrapper so each group can carry its own key.
function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);
  return v;
}
