export type Track = {
  id: number;
  title: string;
  path: string;
  year: number | null;
  durationS: number | null;
  bitrate: number | null;
  format: string | null;
  artistId: number | null;
  albumId: number | null;
  genreId: number | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  stars: number;
  favorite: boolean;
  chartRank: number | null;
};

export type RecentTrack = Track & { playedAt: string; playCount: number };

export type Chart = {
  id: number;
  name: string;
  description: string | null;
  source: string | null;
  entries: number;
  matched: number;
};

export type ArtistDetail = {
  id: number;
  name: string;
  albums: { id: number; title: string; year: number | null; trackCount: number; totalDurationS: number }[];
  totalTracks: number;
  totalDurationS: number;
};

export type AlbumDetail = {
  id: number;
  title: string;
  year: number | null;
  artistId: number | null;
  artist: string | null;
  totalTracks: number;
  totalDurationS: number;
};

export type Route =
  | { type: "library" }
  | { type: "recent" }
  | { type: "artist"; id: number }
  | { type: "album"; id: number };

export type Genre = { id: number; name: string; group: string | null; count: number };
export type Type = { id: number; name: string; count: number };
export type Tag = { id: number; name: string; count: number };

export type TrackDetail = {
  id: number;
  title: string;
  stars: number;
  favorite: boolean;
  types: { id: number; name: string }[];
  tags: { id: number; name: string }[];
  charts: { id: number; name: string; rank: number }[];
};

export type Filters = {
  q: string;
  genreId: number | null;
  genreGroup: string | null;
  typeId: number | null;
  tagId: number | null;
  yearMin: number | null;
  yearMax: number | null;
  minStars: number;
  favoritesOnly: boolean;
  chartedOnly: boolean;
  groupVariants: boolean;
  sort: "title" | "artist" | "album" | "year" | "duration" | "stars" | "chart";
  dir: "asc" | "desc";
};
