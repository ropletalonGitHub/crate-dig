import { useEffect, useState } from "react";
import { useStore } from "../store";
import { fetchTrackDetail, saveRating, saveTrackTags, saveTrackTypes } from "../api";
import type { TrackDetail } from "../types";
import { Stars } from "./Stars";

export function TrackEditModal() {
  const editingTrackId = useStore((s) => s.editingTrackId);
  const setEditingTrackId = useStore((s) => s.setEditingTrackId);
  const bumpRevision = useStore((s) => s.bumpRevision);

  const [detail, setDetail] = useState<TrackDetail | null>(null);
  const [typesInput, setTypesInput] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingTrackId == null) {
      setDetail(null);
      return;
    }
    fetchTrackDetail(editingTrackId).then((d) => {
      setDetail(d);
      setTypesInput(d.types.map((t) => t.name).join(", "));
      setTagsInput(d.tags.map((t) => t.name).join(", "));
    });
  }, [editingTrackId]);

  if (editingTrackId == null || !detail) return null;

  const parse = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveRating(detail.id, detail.stars, detail.favorite),
        saveTrackTypes(detail.id, parse(typesInput)),
        saveTrackTags(detail.id, parse(tagsInput)),
      ]);
      bumpRevision();
      setEditingTrackId(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={() => setEditingTrackId(null)}
    >
      <div
        className="w-[28rem] bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Editing</div>
          <div className="text-neutral-100 font-medium truncate">{detail.title}</div>
        </div>

        <div className="mb-3 flex items-center gap-3">
          <Stars value={detail.stars} onChange={(v) => setDetail({ ...detail, stars: v })} />
          <label className="flex items-center gap-2 text-neutral-300">
            <input
              type="checkbox"
              checked={detail.favorite}
              onChange={(e) => setDetail({ ...detail, favorite: e.target.checked })}
            />
            <span className={detail.favorite ? "text-pink-500" : ""}>♥ Favorite</span>
          </label>
        </div>

        <div className="mb-3">
          <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
            Types <span className="text-neutral-600 normal-case">(comma-separated, e.g. workout, chill)</span>
          </label>
          <input
            value={typesInput}
            onChange={(e) => setTypesInput(e.target.value)}
            className="w-full rounded bg-neutral-950 border border-neutral-800 px-2 py-1 text-neutral-200"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
            Tags <span className="text-neutral-600 normal-case">(comma-separated)</span>
          </label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full rounded bg-neutral-950 border border-neutral-800 px-2 py-1 text-neutral-200"
          />
        </div>

        {detail.charts.length > 0 && (
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Charts</div>
            <ul className="text-neutral-300 space-y-0.5">
              {detail.charts.map((c) => (
                <li key={c.id} className="flex justify-between text-xs">
                  <span className="truncate">{c.name}</span>
                  <span className="tabular-nums text-neutral-500">#{c.rank}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setEditingTrackId(null)}
            className="px-3 py-1 rounded text-neutral-400 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1 rounded bg-neutral-100 text-neutral-900 hover:bg-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
