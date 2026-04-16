import { useEffect, useMemo, useState } from "react";
import { useStore, currentRoute } from "../store";
import { fetchGenres, fetchTags, fetchTypes, fetchYearRange } from "../api";
import type { Filters, Genre, Tag, Type } from "../types";

export function Sidebar() {
  const filters = useStore((s) => s.filters);
  const setFilter = useStore((s) => s.setFilter);
  const clearFilter = useStore((s) => s.clearFilter);
  const clearAllFilters = useStore((s) => s.clearAllFilters);
  const route = useStore(currentRoute);
  const setRoot = useStore((s) => s.setRoot);
  const revision = useStore((s) => s.revision);
  // Library-level facets apply only when we're on the library route.
  const onLibrary = route.type === "library";

  const [genres, setGenres] = useState<Genre[]>([]);
  const [types, setTypes] = useState<Type[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [years, setYears] = useState<{ min: number | null; max: number | null }>({ min: null, max: null });

  useEffect(() => {
    fetchGenres().then(setGenres).catch(() => setGenres([]));
    fetchYearRange().then(setYears).catch(() => setYears({ min: null, max: null }));
  }, [revision]);

  useEffect(() => {
    fetchTypes().then(setTypes).catch(() => setTypes([]));
    fetchTags().then(setTags).catch(() => setTags([]));
  }, [revision]);

  const genreName = useMemo(
    () => genres.find((g) => g.id === filters.genreId)?.name ?? null,
    [genres, filters.genreId],
  );

  // Bucket genres by group
  const genreGroups = useMemo(() => {
    const map = new Map<string, { name: string; count: number; genres: Genre[] }>();
    for (const g of genres) {
      const key = g.group ?? "Other";
      if (!map.has(key)) map.set(key, { name: key, count: 0, genres: [] });
      const b = map.get(key)!;
      b.count += g.count;
      b.genres.push(g);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [genres]);
  const typeName = useMemo(
    () => types.find((t) => t.id === filters.typeId)?.name ?? null,
    [types, filters.typeId],
  );
  const tagName = useMemo(
    () => tags.find((t) => t.id === filters.tagId)?.name ?? null,
    [tags, filters.tagId],
  );

  const activeChips: { key: keyof Filters; label: string }[] = [];
  if (filters.q) activeChips.push({ key: "q", label: `“${filters.q}”` });
  if (filters.genreGroup) activeChips.push({ key: "genreGroup", label: `Group: ${filters.genreGroup}` });
  if (filters.genreId != null) activeChips.push({ key: "genreId", label: `Genre: ${genreName ?? filters.genreId}` });
  if (filters.typeId != null) activeChips.push({ key: "typeId", label: `Type: ${typeName ?? filters.typeId}` });
  if (filters.tagId != null) activeChips.push({ key: "tagId", label: `Tag: ${tagName ?? filters.tagId}` });
  if (filters.yearMin != null) activeChips.push({ key: "yearMin", label: `Year ≥ ${filters.yearMin}` });
  if (filters.yearMax != null) activeChips.push({ key: "yearMax", label: `Year ≤ ${filters.yearMax}` });
  if (filters.minStars > 0) activeChips.push({ key: "minStars", label: `★ ≥ ${filters.minStars}` });
  if (filters.favoritesOnly) activeChips.push({ key: "favoritesOnly", label: "Favorites" });
  if (filters.chartedOnly) activeChips.push({ key: "chartedOnly", label: "On a chart" });

  return (
    <aside className="w-64 shrink-0 border-r border-neutral-800 bg-neutral-950 p-3 overflow-auto text-sm">
      <div className="mb-4 flex gap-1 text-xs">
        <button
          onClick={() => setRoot({ type: "library" })}
          className={`flex-1 py-1 rounded ${onLibrary ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:bg-neutral-900"}`}
        >
          Library
        </button>
        <button
          onClick={() => setRoot({ type: "recent" })}
          className={`flex-1 py-1 rounded ${route.type === "recent" ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:bg-neutral-900"}`}
        >
          Recent
        </button>
      </div>

      {onLibrary && (
        <>
          {activeChips.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs uppercase tracking-wide text-neutral-500">Active filters</span>
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-neutral-400 hover:text-neutral-200 underline decoration-dotted"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {activeChips.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => clearFilter(c.key)}
                    className="inline-flex items-center gap-1 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded px-2 py-0.5"
                    title={`Remove ${c.label}`}
                  >
                    <span>{c.label}</span>
                    <span className="text-neutral-500">×</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">Search</label>
            <div className="relative">
              <input
                type="search"
                value={filters.q}
                onChange={(e) => setFilter("q", e.target.value)}
                placeholder="title / artist / album / year"
                className="w-full rounded bg-neutral-900 border border-neutral-800 px-2 py-1 pr-6 text-neutral-200 placeholder-neutral-600"
              />
              {filters.q && (
                <button
                  onClick={() => clearFilter("q")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-200 text-xs"
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs uppercase tracking-wide text-neutral-500">Year</label>
              {(filters.yearMin != null || filters.yearMax != null) && (
                <button
                  onClick={() => {
                    clearFilter("yearMin");
                    clearFilter("yearMax");
                  }}
                  className="text-xs text-neutral-500 hover:text-neutral-200"
                  title="Clear year"
                >
                  ×
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder={years.min?.toString() ?? "min"}
                value={filters.yearMin ?? ""}
                onChange={(e) => setFilter("yearMin", e.target.value ? parseInt(e.target.value, 10) : null)}
                className="w-1/2 rounded bg-neutral-900 border border-neutral-800 px-2 py-1 text-neutral-200"
              />
              <input
                type="number"
                placeholder={years.max?.toString() ?? "max"}
                value={filters.yearMax ?? ""}
                onChange={(e) => setFilter("yearMax", e.target.value ? parseInt(e.target.value, 10) : null)}
                className="w-1/2 rounded bg-neutral-900 border border-neutral-800 px-2 py-1 text-neutral-200"
              />
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs uppercase tracking-wide text-neutral-500">
                Min stars: {filters.minStars || "any"}
              </label>
              {filters.minStars > 0 && (
                <button
                  onClick={() => clearFilter("minStars")}
                  className="text-xs text-neutral-500 hover:text-neutral-200"
                  title="Clear stars"
                >
                  ×
                </button>
              )}
            </div>
            <input
              type="range"
              min={0}
              max={5}
              step={1}
              value={filters.minStars}
              onChange={(e) => setFilter("minStars", parseInt(e.target.value, 10))}
              className="w-full"
            />
          </div>

          <div className="mb-4 space-y-1">
            <label className="flex items-center gap-2 text-neutral-300">
              <input
                type="checkbox"
                checked={filters.favoritesOnly}
                onChange={(e) => setFilter("favoritesOnly", e.target.checked)}
              />
              Favorites only
            </label>
            <label className="flex items-center gap-2 text-neutral-300">
              <input
                type="checkbox"
                checked={filters.chartedOnly}
                onChange={(e) => setFilter("chartedOnly", e.target.checked)}
              />
              On a world chart
            </label>
            <label className="flex items-center gap-2 text-neutral-300">
              <input
                type="checkbox"
                checked={filters.groupVariants}
                onChange={(e) => setFilter("groupVariants", e.target.checked)}
              />
              Group variants
            </label>
          </div>

          <GenreFacet
            groups={genreGroups}
            selectedGroup={filters.genreGroup}
            selectedGenreId={filters.genreId}
            onSelectGroup={(g) => {
              setFilter("genreGroup", g);
              setFilter("genreId", null);
            }}
            onSelectGenre={(id) => {
              setFilter("genreId", id);
              setFilter("genreGroup", null);
            }}
            onClear={() => {
              clearFilter("genreId");
              clearFilter("genreGroup");
            }}
          />
          <FacetList
            label="Type"
            items={types}
            selected={filters.typeId}
            onSelect={(id) => setFilter("typeId", id)}
            onClear={() => clearFilter("typeId")}
            emptyHint="Add types from the track menu"
          />
          <FacetList
            label="Tag"
            items={tags}
            selected={filters.tagId}
            onSelect={(id) => setFilter("tagId", id)}
            onClear={() => clearFilter("tagId")}
            emptyHint="Add tags from the track menu"
          />
        </>
      )}
    </aside>
  );
}

function GenreFacet({
  groups,
  selectedGroup,
  selectedGenreId,
  onSelectGroup,
  onSelectGenre,
  onClear,
}: {
  groups: { name: string; count: number; genres: Genre[] }[];
  selectedGroup: string | null;
  selectedGenreId: number | null;
  onSelectGroup: (g: string | null) => void;
  onSelectGenre: (id: number | null) => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());
  const toggle = (name: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs uppercase tracking-wide text-neutral-500">Genre</label>
        {(selectedGroup != null || selectedGenreId != null) && (
          <button
            onClick={onClear}
            className="text-xs text-neutral-500 hover:text-neutral-200"
            title="Clear genre"
          >
            ×
          </button>
        )}
      </div>
      <ul className="space-y-0.5">
        <li>
          <button
            onClick={() => {
              onSelectGroup(null);
              onSelectGenre(null);
            }}
            className={`w-full text-left px-2 py-1 rounded ${
              selectedGroup == null && selectedGenreId == null
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-400 hover:bg-neutral-900"
            }`}
          >
            All genres
          </button>
        </li>
        {groups.map((g) => {
          const isExpanded = expanded.has(g.name);
          const groupSelected = selectedGroup === g.name;
          return (
            <li key={g.name}>
              <div
                className={`flex items-center w-full rounded ${
                  groupSelected ? "bg-neutral-800 text-neutral-100" : "text-neutral-300 hover:bg-neutral-900"
                }`}
              >
                <button
                  onClick={() => toggle(g.name)}
                  className="px-1.5 py-1 text-neutral-600 hover:text-neutral-300 shrink-0"
                  title={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? "▾" : "▸"}
                </button>
                <button
                  onClick={() => onSelectGroup(groupSelected ? null : g.name)}
                  className="flex-1 text-left px-1 py-1 flex justify-between min-w-0"
                >
                  <span className="truncate font-medium">{g.name}</span>
                  <span className="text-xs text-neutral-500 ml-2">{g.count}</span>
                </button>
              </div>
              {isExpanded && (
                <ul className="ml-5 mt-0.5 space-y-0.5 border-l border-neutral-800 pl-2">
                  {g.genres.map((sub) => (
                    <li key={sub.id}>
                      <button
                        onClick={() => onSelectGenre(selectedGenreId === sub.id ? null : sub.id)}
                        className={`w-full text-left px-2 py-0.5 rounded text-xs flex justify-between ${
                          selectedGenreId === sub.id
                            ? "bg-neutral-800 text-neutral-100"
                            : "text-neutral-500 hover:bg-neutral-900"
                        }`}
                      >
                        <span className="truncate">{sub.name}</span>
                        <span className="text-neutral-600 ml-2">{sub.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FacetList({
  label,
  items,
  selected,
  onSelect,
  onClear,
  emptyHint,
}: {
  label: string;
  items: { id: number; name: string; count: number }[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  onClear: () => void;
  emptyHint?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs uppercase tracking-wide text-neutral-500">{label}</label>
        {selected != null && (
          <button
            onClick={onClear}
            className="text-xs text-neutral-500 hover:text-neutral-200"
            title={`Clear ${label.toLowerCase()}`}
          >
            ×
          </button>
        )}
      </div>
      {items.length === 0 && emptyHint && (
        <div className="text-xs text-neutral-600 px-2 py-1">{emptyHint}</div>
      )}
      <ul className="space-y-0.5">
        <li>
          <button
            onClick={() => onSelect(null)}
            className={`w-full text-left px-2 py-1 rounded ${
              selected == null ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:bg-neutral-900"
            }`}
          >
            All {label.toLowerCase()}s
          </button>
        </li>
        {items.map((g) => (
          <li key={g.id}>
            <button
              onClick={() => onSelect(g.id)}
              className={`w-full text-left px-2 py-1 rounded flex justify-between ${
                selected === g.id ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:bg-neutral-900"
              }`}
            >
              <span className="truncate">{g.name}</span>
              <span className="text-xs text-neutral-600 ml-2">{g.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
