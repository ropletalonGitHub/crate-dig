import type {
  AlbumDetail,
  ArtistDetail,
  Chart,
  Filters,
  Genre,
  RecentTrack,
  Tag,
  Track,
  TrackDetail,
  Type,
} from "./types";

const base = "";

export async function fetchTracks(f: Filters): Promise<Track[]> {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.genreId != null) p.set("genre_id", String(f.genreId));
  if (f.genreGroup) p.set("genre_group", f.genreGroup);
  if (f.typeId != null) p.set("type_id", String(f.typeId));
  if (f.tagId != null) p.set("tag_id", String(f.tagId));
  if (f.yearMin != null) p.set("year_min", String(f.yearMin));
  if (f.yearMax != null) p.set("year_max", String(f.yearMax));
  if (f.minStars > 0) p.set("min_stars", String(f.minStars));
  if (f.favoritesOnly) p.set("favorites", "1");
  if (f.chartedOnly) p.set("charted", "1");
  p.set("sort", f.sort);
  p.set("dir", f.dir);
  const res = await fetch(`${base}/api/tracks?${p}`);
  return (await res.json()).tracks;
}

export async function fetchGenres(): Promise<Genre[]> {
  return (await (await fetch(`${base}/api/genres`)).json()).genres;
}

export async function fetchTypes(): Promise<Type[]> {
  return (await (await fetch(`${base}/api/types`)).json()).types;
}

export async function fetchTags(): Promise<Tag[]> {
  return (await (await fetch(`${base}/api/tags`)).json()).tags;
}

export async function fetchCharts(): Promise<Chart[]> {
  return (await (await fetch(`${base}/api/charts`)).json()).charts;
}

export async function fetchArtist(id: number): Promise<ArtistDetail> {
  return await (await fetch(`${base}/api/artists/${id}`)).json();
}

export async function fetchAlbum(id: number): Promise<AlbumDetail> {
  return await (await fetch(`${base}/api/albums/${id}`)).json();
}

export async function fetchTracksByArtist(artistId: number): Promise<Track[]> {
  const res = await fetch(`${base}/api/tracks?artist_id=${artistId}&sort=album&limit=5000`);
  return (await res.json()).tracks;
}

export async function fetchTracksByAlbum(albumId: number): Promise<Track[]> {
  const res = await fetch(`${base}/api/tracks?album_id=${albumId}&sort=title&limit=5000`);
  return (await res.json()).tracks;
}

export async function fetchYearRange(): Promise<{ min: number | null; max: number | null }> {
  return await (await fetch(`${base}/api/years`)).json();
}

export async function fetchStats(): Promise<{ total: number; missing: number }> {
  return await (await fetch(`${base}/api/stats`)).json();
}

export async function fetchTrackDetail(id: number): Promise<TrackDetail> {
  return await (await fetch(`${base}/api/tracks/${id}`)).json();
}

export async function saveRating(id: number, stars: number, favorite: boolean): Promise<void> {
  await fetch(`${base}/api/tracks/${id}/rating`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stars, favorite }),
  });
}

export async function saveTrackTypes(id: number, names: string[]): Promise<void> {
  await fetch(`${base}/api/tracks/${id}/types`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ names }),
  });
}

export async function saveTrackTags(id: number, names: string[]): Promise<void> {
  await fetch(`${base}/api/tracks/${id}/tags`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ names }),
  });
}

export async function logPlay(trackId: number): Promise<void> {
  await fetch(`${base}/api/plays`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trackId }),
  });
}

export async function fetchRecent(): Promise<RecentTrack[]> {
  return (await (await fetch(`${base}/api/recent`)).json()).tracks;
}

export function trackFileUrl(id: number): string {
  return `${base}/api/file?id=${id}`;
}
