/**
 * String normalization for grouping, matching, and dedup.
 * Same algorithm used by the chart matcher — keep the two in sync if you change it.
 */
export function normText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s*-\s*(remaster(ed)?|mono|stereo|single version|album version|edit|live|mix|version)\b.*$/i, "")
    .replace(/^the\s+/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function variantKey(artist: string | null | undefined, title: string): string {
  return `${normText(artist ?? "")}|${normText(title)}`;
}
