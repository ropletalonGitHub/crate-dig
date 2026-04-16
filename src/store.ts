import { create } from "zustand";
import type { Filters, Route, Track } from "./types";

export type View = "library" | "recent";

type State = {
  // Navigation stack. stack[stack.length-1] is the current route.
  // "library" and "recent" reset the stack to a single entry.
  // "artist" / "album" push onto it so the back button can pop.
  stack: Route[];
  push: (r: Route) => void;
  back: () => void;
  setRoot: (r: Route) => void;

  filters: Filters;
  setFilter: <K extends keyof Filters>(k: K, v: Filters[K]) => void;
  clearFilter: (k: keyof Filters) => void;
  clearAllFilters: () => void;

  // Queue is the ordered list of tracks to play; currentIndex is the one playing.
  queue: Track[];
  currentIndex: number;
  playing: boolean;

  playTrack: (t: Track) => void;
  playList: (list: Track[], startIdx: number) => void;
  enqueue: (t: Track) => void;
  next: () => void;
  prev: () => void;
  clearQueue: () => void;
  removeFromQueue: (idx: number) => void;
  setPlaying: (b: boolean) => void;

  // Bumped whenever track metadata that the list shows may have changed
  // (rating, favorite). TrackTable refetches on change.
  revision: number;
  bumpRevision: () => void;

  editingTrackId: number | null;
  setEditingTrackId: (id: number | null) => void;
};

const initialFilters: Filters = {
  q: "",
  genreId: null,
  genreGroup: null,
  typeId: null,
  tagId: null,
  yearMin: null,
  yearMax: null,
  minStars: 0,
  favoritesOnly: false,
  chartedOnly: false,
  groupVariants: true,
  sort: "title",
  dir: "asc",
};

export const useStore = create<State>((set, get) => ({
  stack: [{ type: "library" }],
  push: (r) => set((s) => ({ stack: [...s.stack, r] })),
  back: () =>
    set((s) => ({ stack: s.stack.length > 1 ? s.stack.slice(0, -1) : s.stack })),
  setRoot: (r) => set({ stack: [r] }),

  filters: initialFilters,
  setFilter: (k, v) => set((s) => ({ filters: { ...s.filters, [k]: v } })),
  clearFilter: (k) =>
    set((s) => ({ filters: { ...s.filters, [k]: (initialFilters as Filters)[k] } })),
  clearAllFilters: () =>
    set((s) => ({ filters: { ...initialFilters, sort: s.filters.sort, dir: s.filters.dir } })),

  queue: [],
  currentIndex: -1,
  playing: false,

  playTrack: (t) => set({ queue: [t], currentIndex: 0, playing: true }),
  playList: (list, startIdx) =>
    set({ queue: list.slice(), currentIndex: Math.max(0, Math.min(list.length - 1, startIdx)), playing: true }),
  enqueue: (t) =>
    set((s) => {
      const queue = [...s.queue, t];
      if (s.currentIndex < 0) return { queue, currentIndex: 0, playing: true };
      return { queue };
    }),
  next: () => {
    const { queue, currentIndex } = get();
    if (currentIndex + 1 < queue.length) set({ currentIndex: currentIndex + 1, playing: true });
    else set({ playing: false });
  },
  prev: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) set({ currentIndex: currentIndex - 1, playing: true });
  },
  clearQueue: () => set({ queue: [], currentIndex: -1, playing: false }),
  removeFromQueue: (idx) =>
    set((s) => {
      const queue = s.queue.slice();
      queue.splice(idx, 1);
      let currentIndex = s.currentIndex;
      if (idx < currentIndex) currentIndex -= 1;
      else if (idx === currentIndex) {
        if (queue.length === 0) return { queue, currentIndex: -1, playing: false };
        currentIndex = Math.min(currentIndex, queue.length - 1);
      }
      return { queue, currentIndex };
    }),
  setPlaying: (b) => set({ playing: b }),

  revision: 0,
  bumpRevision: () => set((s) => ({ revision: s.revision + 1 })),

  editingTrackId: null,
  setEditingTrackId: (id) => set({ editingTrackId: id }),
}));

export function currentTrack(s: State): Track | null {
  if (s.currentIndex < 0 || s.currentIndex >= s.queue.length) return null;
  return s.queue[s.currentIndex];
}

export function currentRoute(s: State): Route {
  return s.stack[s.stack.length - 1];
}
