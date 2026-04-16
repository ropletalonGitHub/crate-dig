import { useEffect, useRef, useState } from "react";
import { useStore, currentTrack } from "../store";
import { logPlay, trackFileUrl } from "../api";

function fmt(s: number): string {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function NowPlaying({ onToggleQueue }: { onToggleQueue: () => void }) {
  const current = useStore(currentTrack);
  const playing = useStore((s) => s.playing);
  const setPlaying = useStore((s) => s.setPlaying);
  const next = useStore((s) => s.next);
  const prev = useStore((s) => s.prev);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!current) {
      a.pause();
      a.removeAttribute("src");
      setProgress(0);
      setDuration(0);
      return;
    }
    a.src = trackFileUrl(current.id);
    a.play().catch((err) => console.warn("play failed", err));
    logPlay(current.id).catch(() => void 0);
  }, [current?.id]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    if (playing) a.play().catch(() => void 0);
    else a.pause();
  }, [playing]);

  return (
    <footer className="border-t border-neutral-800 bg-neutral-950 px-4 py-2">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setProgress((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => next()}
      />
      <div className="flex items-center gap-3 text-sm">
        <button
          onClick={prev}
          disabled={!current}
          className="w-8 h-8 rounded-full hover:bg-neutral-800 disabled:opacity-40 text-neutral-200"
          aria-label="Previous"
        >
          ⏮
        </button>
        <button
          onClick={() => setPlaying(!playing)}
          disabled={!current}
          className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-100"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          onClick={next}
          disabled={!current}
          className="w-8 h-8 rounded-full hover:bg-neutral-800 disabled:opacity-40 text-neutral-200"
          aria-label="Next"
        >
          ⏭
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-neutral-100">{current?.title ?? "Nothing playing"}</div>
          <div className="truncate text-xs text-neutral-500">
            {current ? [current.artist, current.album].filter(Boolean).join(" — ") : "Double-click a track"}
          </div>
        </div>
        <div className="text-xs text-neutral-500 tabular-nums">
          {fmt(progress)} / {fmt(duration || current?.durationS || 0)}
        </div>
        <input
          type="range"
          min={0}
          max={duration || current?.durationS || 0}
          step={1}
          value={progress}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (audioRef.current) audioRef.current.currentTime = v;
            setProgress(v);
          }}
          className="w-64"
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-24"
          aria-label="Volume"
        />
        <button
          onClick={onToggleQueue}
          className="text-xs text-neutral-400 hover:text-neutral-200 px-2 py-1 rounded hover:bg-neutral-800"
          title="Queue"
        >
          ☰
        </button>
      </div>
    </footer>
  );
}
