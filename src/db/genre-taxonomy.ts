/**
 * Genre normalization, aliases, and hierarchical grouping.
 * Shared between the scanner (on-insert lookup) and the one-shot fix-genres script.
 *
 * How it works:
 *  1. Raw tag text → `normKey()` (lowercase, diacritics stripped, punctuation collapsed).
 *  2. `canonicalFor()` consults ALIAS_MAP for a display name. If no match, the
 *     first-seen raw text is kept as the display name.
 *  3. `groupFor()` returns the broad group label for a canonical name.
 *
 * Adding a new alias or group mapping here automatically affects both the
 * scanner and the grouped sidebar.
 */

export function normKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Map normKey → canonical display name.
// Unlisted normKeys stay as-is (their first-seen raw form becomes the display).
// Keys MUST already be in normKey form (lowercase, no diacritics, spaces only).
const ALIAS_ENTRIES: [string, string][] = [
  // --- Rock family ---
  ["rock", "Rock"],
  ["hard rock", "Hard Rock"],
  ["indie rock", "Indie Rock"],
  ["metal", "Metal"],
  ["westcoast", "Rock"],
  ["alternative", "Alternative"],
  ["alternatief", "Alternative"],
  ["alternative and punk", "Alternative"],
  ["alternativna hudba", "Alternative"],
  ["alternativni hudba", "Alternative"],

  // --- Pop family ---
  ["pop", "Pop"],
  ["french pop", "Pop"],
  ["vocal", "Vocal"],
  ["singer songwriter", "Pop"],
  ["easy listening", "Easy Listening"],

  // --- Electronic & Dance ---
  ["dance", "Dance"],
  ["dance and house", "Dance"],
  ["fitness and workout", "Dance"],
  ["electronic", "Electronic"],
  ["electronica", "Electronic"],
  ["electronica dance", "Electronic"],
  ["elektronica and dance", "Electronic"],
  ["elektronicka", "Electronic"],
  ["elektronicka a tanecni hudba", "Electronic"],
  ["elektronicka a taneeni hudba", "Electronic"], // mojibake: 'č' served as 'è'
  ["tanecni", "Electronic"],
  ["tanecni hudba", "Electronic"],
  ["disco", "Disco"],
  ["80s megamix", "Megamix"],
  ["90s megamix", "Megamix"],
  ["megamix", "Megamix"],

  // --- Hip-Hop & R&B ---
  ["hip hop rap", "Hip-Hop"],
  ["rap", "Hip-Hop"],
  ["rap and hip hop", "Hip-Hop"],
  ["r and b", "R&B"],
  ["r and b soul", "Soul and R&B"],
  ["soul and r and b", "Soul and R&B"],

  // --- Jazz & Blues ---
  ["jazz", "Jazz"],
  ["contemporary jazz", "Jazz"],
  ["swing", "Jazz"],
  ["blues", "Blues"],
  ["bossa nova", "Bossa Nova"],

  // --- Classical ---
  ["classical", "Classical"],
  ["classique", "Classical"],
  ["klassiek", "Classical"],
  ["klassisk", "Classical"],
  ["klassische musik", "Classical"],
  ["hymna", "Classical"],

  // --- Country & Folk ---
  ["country", "Country"],
  ["country and folk", "Country"],
  ["folk", "Folk"],
  ["national folk", "Folk"],
  ["bluegrass", "Bluegrass"],
  ["traditional", "Traditional"],

  // --- World & Latin ---
  ["world", "World"],
  ["worldwide", "World"],
  ["international", "World"],
  ["ceske", "World"],
  ["latin", "Latin"],
  ["latino", "Latin"],
  ["brasil", "Latin"],
  ["reggae", "Reggae"],
  ["salsa", "Salsa"],

  // --- Soundtrack ---
  ["soundtrack", "Soundtrack"],
  ["filmova hudba", "Soundtrack"],

  // --- New Age / Holiday / Religious ---
  ["new age", "New Age"],
  ["holiday", "Holiday"],
  ["religious", "Religious"],

  // --- Children ---
  ["children", "Children"],
  ["children s music", "Children"],
  ["pro deti", "Children"],
  ["pohadka", "Children"],

  // --- Spoken word & Comedy ---
  ["speech", "Spoken Word"],
  ["spoken word", "Spoken Word"],
  ["spoken and audio", "Spoken Word"],
  ["hovorene slovo", "Spoken Word"],
  ["govorene slovo", "Spoken Word"],
  ["language courses", "Spoken Word"],
  ["pro dospele", "Spoken Word"],
  ["podcast", "Podcast"],
  ["audiokniha", "Audiobook"],
  ["detektivky thrillery", "Audiobook"],
  ["humor", "Comedy"],
  ["comedy", "Comedy"],
  ["sranda", "Comedy"],
  ["kecy", "Comedy"],

  // --- Catch-all / placeholder buckets ---
  ["other", "Other"],
  ["unclassifiable", "Other"],
  ["genre", "Other"],
  ["lime", "Other"],
  ["ruzne", "Other"],
  ["instrumental", "Other"],
  ["oldies", "Other"],
];

export const ALIAS_MAP = new Map<string, string>(ALIAS_ENTRIES);

// Canonical display name → broad group label for the sidebar hierarchy.
const GROUP_ENTRIES: [string, string][] = [
  ["Rock", "Rock & Metal"],
  ["Hard Rock", "Rock & Metal"],
  ["Indie Rock", "Rock & Metal"],
  ["Metal", "Rock & Metal"],
  ["Alternative", "Rock & Metal"],

  ["Pop", "Pop"],
  ["Vocal", "Pop"],
  ["Easy Listening", "Pop"],

  ["Dance", "Electronic & Dance"],
  ["Electronic", "Electronic & Dance"],
  ["Disco", "Electronic & Dance"],
  ["Megamix", "Electronic & Dance"],

  ["Hip-Hop", "Hip-Hop & R&B"],
  ["R&B", "Hip-Hop & R&B"],
  ["Soul and R&B", "Hip-Hop & R&B"],

  ["Jazz", "Jazz & Blues"],
  ["Blues", "Jazz & Blues"],
  ["Bossa Nova", "Jazz & Blues"],

  ["Classical", "Classical"],

  ["Country", "Country & Folk"],
  ["Folk", "Country & Folk"],
  ["Bluegrass", "Country & Folk"],
  ["Traditional", "Country & Folk"],

  ["World", "World & Latin"],
  ["Latin", "World & Latin"],
  ["Reggae", "World & Latin"],
  ["Salsa", "World & Latin"],

  ["Soundtrack", "Soundtrack"],
  ["New Age", "New Age"],

  ["Holiday", "Holiday & Religious"],
  ["Religious", "Holiday & Religious"],

  ["Children", "Children"],

  ["Spoken Word", "Spoken & Comedy"],
  ["Podcast", "Spoken & Comedy"],
  ["Audiobook", "Spoken & Comedy"],
  ["Comedy", "Spoken & Comedy"],

  ["Other", "Other"],
];

export const GROUP_MAP = new Map<string, string>(GROUP_ENTRIES);

/** Canonical display name for a raw tag (may be the same raw text). */
export function canonicalFor(raw: string): { name: string; normKey: string; group: string | null } {
  const key = normKey(raw);
  const canonical = ALIAS_MAP.get(key);
  const name = canonical ?? raw.trim();
  // For an unaliased name, recompute its normKey so it still collides with
  // variants of itself (different capitalization etc).
  const finalKey = canonical ? normKey(canonical) : key;
  const group = GROUP_MAP.get(name) ?? "Other";
  return { name, normKey: finalKey, group };
}
