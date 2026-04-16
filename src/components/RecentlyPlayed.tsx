import { useEffect, useState } from "react";
import { fetchRecent } from "../api";
import type { RecentTrack } from "../types";
import { useStore, currentTrack } from "../store";
import { Stars } from "./Stars";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export function RecentlyPlayed() {
  const [rows, setRows] = useState<RecentTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const playList = useStore((s) => s.playList);
  const current = useStore(currentTrack);
  const revision = useStore((s) => s.revision);

  useEffect(() => {
    setLoading(true);
    fetchRecent()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [revision]);

  return (
    <div className="text-sm">
      <div className="px-4 py-3 text-xs uppercase tracking-wide text-neutral-500">Recently played</div>
      <table className="w-full table-fixed">
        <thead className="text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="w-[26%] text-left px-3 py-2 font-normal">Title</th>
            <th className="w-[20%] text-left px-3 py-2 font-normal">Artist</th>
            <th className="w-[20%] text-left px-3 py-2 font-normal">Album</th>
            <th className="w-[7%] text-left px-3 py-2 font-normal">Chart</th>
            <th className="w-[9%] text-left px-3 py-2 font-normal">Rating</th>
            <th className="w-[8%] text-left px-3 py-2 font-normal">Plays</th>
            <th className="w-[10%] text-left px-3 py-2 font-normal">When</th>
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-neutral-500">
                Loading…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-neutral-500">
                Nothing here yet. Play some tracks.
              </td>
            </tr>
          )}
          {rows.map((t, idx) => (
            <tr
              key={`${t.id}-${t.playedAt}`}
              onDoubleClick={() => playList(rows, idx)}
              className={`border-t border-neutral-900 hover:bg-neutral-900 cursor-pointer ${
                current?.id === t.id ? "bg-neutral-800/60" : ""
              }`}
            >
              <td className="px-3 py-1.5 truncate">{t.title}</td>
              <td className="px-3 py-1.5 truncate text-neutral-400">{t.artist ?? ""}</td>
              <td className="px-3 py-1.5 truncate text-neutral-400">{t.album ?? ""}</td>
              <td className="px-3 py-1.5 text-neutral-400 tabular-nums">
                {t.chartRank != null ? `#${t.chartRank}` : ""}
              </td>
              <td className="px-3 py-1.5">
                <Stars value={t.stars} size="text-xs" />
              </td>
              <td className="px-3 py-1.5 text-neutral-500 tabular-nums">{t.playCount}</td>
              <td className="px-3 py-1.5 text-neutral-500">{fmtWhen(t.playedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
