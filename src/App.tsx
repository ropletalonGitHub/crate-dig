import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TrackTable } from "./components/TrackTable";
import { NowPlaying } from "./components/NowPlaying";
import { QueueDrawer } from "./components/QueueDrawer";
import { TrackEditModal } from "./components/TrackEditModal";
import { RecentlyPlayed } from "./components/RecentlyPlayed";
import { ArtistPage } from "./components/ArtistPage";
import { AlbumPage } from "./components/AlbumPage";
import { fetchStats } from "./api";
import { useStore, currentRoute } from "./store";
import { useTheme } from "./theme";

export default function App() {
  const [stats, setStats] = useState<{ total: number; missing: number } | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const route = useStore(currentRoute);
  const stackLen = useStore((s) => s.stack.length);
  const back = useStore((s) => s.back);
  const setRoot = useStore((s) => s.setRoot);
  const revision = useStore((s) => s.revision);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    fetchStats().then(setStats).catch(() => setStats(null));
  }, [revision]);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-950">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setRoot({ type: "library" })}
            disabled={route.type === "library" && stackLen === 1}
            className="w-7 h-7 rounded hover:bg-neutral-800 disabled:opacity-30 text-neutral-300"
            title="Library"
            aria-label="Go to library"
          >
            ⌂
          </button>
          <button
            onClick={back}
            disabled={stackLen <= 1}
            className="w-7 h-7 rounded hover:bg-neutral-800 disabled:opacity-30 text-neutral-300"
            title="Back"
          >
            ←
          </button>
          <h1 className="text-sm font-semibold tracking-wide text-neutral-200">music</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-neutral-500">
            {stats ? `${stats.total} tracks${stats.missing ? ` · ${stats.missing} missing` : ""}` : "…"}
          </div>
          <button
            onClick={toggleTheme}
            className="w-7 h-7 rounded hover:bg-neutral-800 text-neutral-300"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-auto">
          {route.type === "library" && <TrackTable />}
          {route.type === "recent" && <RecentlyPlayed />}
          {route.type === "artist" && <ArtistPage artistId={route.id} />}
          {route.type === "album" && <AlbumPage albumId={route.id} />}
        </main>
        <QueueDrawer open={queueOpen} onClose={() => setQueueOpen(false)} />
      </div>
      <NowPlaying onToggleQueue={() => setQueueOpen((o) => !o)} />
      <TrackEditModal />
    </div>
  );
}
