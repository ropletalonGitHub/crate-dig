import { useStore } from "../store";

export function QueueDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queue = useStore((s) => s.queue);
  const currentIndex = useStore((s) => s.currentIndex);
  const removeFromQueue = useStore((s) => s.removeFromQueue);
  const clearQueue = useStore((s) => s.clearQueue);
  const playList = useStore((s) => s.playList);

  if (!open) return null;
  return (
    <aside className="w-80 shrink-0 border-l border-neutral-800 bg-neutral-950 flex flex-col text-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
        <div className="font-semibold text-neutral-200">Queue ({queue.length})</div>
        <div className="flex gap-2 text-xs">
          <button
            onClick={clearQueue}
            className="text-neutral-500 hover:text-neutral-200"
            disabled={queue.length === 0}
          >
            Clear
          </button>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200">
            Close
          </button>
        </div>
      </div>
      <ul className="flex-1 overflow-auto">
        {queue.length === 0 && (
          <li className="px-3 py-4 text-neutral-600">Nothing queued. Use +Q on a track.</li>
        )}
        {queue.map((t, idx) => (
          <li
            key={`${t.id}-${idx}`}
            onDoubleClick={() => playList(queue, idx)}
            className={`px-3 py-2 border-b border-neutral-900 cursor-pointer hover:bg-neutral-900 ${
              idx === currentIndex ? "bg-neutral-800/60" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-neutral-100">{t.title}</div>
                <div className="truncate text-xs text-neutral-500">
                  {[t.artist, t.album].filter(Boolean).join(" — ")}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromQueue(idx);
                }}
                className="text-neutral-600 hover:text-neutral-300 text-xs"
                title="Remove"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
