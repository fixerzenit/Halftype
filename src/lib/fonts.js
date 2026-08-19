/**
 * The font parser, fetched when a font is.
 *
 * opentype.js is 170KB of the entry chunk — a little over a third of it — and
 * every byte of it blocks the first paint while doing nothing for it. Nothing
 * can be drawn before a typeface has been read, but the *interface* can be, and
 * the parser has no business being in the way of that.
 *
 * Both callers were already async, so this costs nothing but the import. It
 * gains something too: the parser and the TTF now download at the same time
 * rather than one after the other, because the chain below asks for both at
 * once instead of parsing after fetching.
 */
let parser = null;
function opentypeLib() {
  parser ??= import('opentype.js').then((m) => m.default ?? m);
  return parser;
}


// Promise cache: dedupes concurrent requests from the cards and keeps every
// parsed font around for the session.
const fontCache = new Map();

/**
 * Font catalog. The files themselves live in `public/fonts/` and are checked
 * in, so adding a family here means adding its TTFs there — one per weight
 * listed, named `<id>-<weight>.ttf`.
 *
 * Chosen for contrast within each group as much as popularity: two condensed
 * grotesques or two transitional serifs would take up a slot and give nothing
 * new to look at once a pattern is stamped through them.
 */
export const FONT_CATALOG = [
  // Sans — neutral, geometric-wide, geometric-round, condensed, ultra-heavy.
  { id: 'inter', name: 'Inter', group: 'Sans serif', weights: [300, 400, 500, 700, 900] },
  // Google's brand typeface. The API serves it, but it is licensed for
  // Google's own products — check before shipping this anywhere public.
  { id: 'google-sans', name: 'Google Sans', group: 'Sans serif', weights: [400, 500, 600, 700] },
  { id: 'montserrat', name: 'Montserrat', group: 'Sans serif', weights: [300, 400, 600, 800] },
  { id: 'poppins', name: 'Poppins', group: 'Sans serif', weights: [300, 400, 600, 800] },
  { id: 'oswald', name: 'Oswald', group: 'Sans serif', weights: [300, 400, 600, 700] },
  { id: 'anton', name: 'Anton', group: 'Sans serif', weights: [400] },

  // Serif — didone, sturdy text, contemporary, transitional, delicate old-style.
  { id: 'playfair-display', name: 'Playfair Display', group: 'Serif', weights: [400, 600, 800] },
  { id: 'merriweather', name: 'Merriweather', group: 'Serif', weights: [300, 400, 700, 900] },
  { id: 'lora', name: 'Lora', group: 'Serif', weights: [400, 500, 700] },
  { id: 'libre-baskerville', name: 'Libre Baskerville', group: 'Serif', weights: [400, 700] },
  { id: 'cormorant-garamond', name: 'Cormorant Garamond', group: 'Serif', weights: [300, 400, 600, 700] },

  /* The six script and calligraphic families are gone.
     They were the worst source material this app has: a pattern is stamped
     *through* a silhouette, and a joined, high-contrast, mostly-hairline
     letterform has almost no silhouette to stamp through. Every one of them
     came out as a few disconnected specks at any spacing coarse enough to see.
     Their files are still in public/fonts — nothing fetches them now, and
     deleting someone's assets is not a tidy-up to make on their behalf. */

  // Monospace.
  { id: 'jetbrains-mono', name: 'JetBrains Mono', group: 'Monospace', weights: [300, 400, 700, 800] },
  { id: 'space-mono', name: 'Space Mono', group: 'Monospace', weights: [400, 700] },

  // Slab — a serif with square brackets, so it files under Serif rather than
  // keeping a group of two to itself.
  { id: 'roboto-slab', name: 'Roboto Slab', group: 'Serif', weights: [300, 400, 700, 900] },
  { id: 'alfa-slab-one', name: 'Alfa Slab One', group: 'Serif', weights: [400] },
];

/**
 * Typefaces the user dropped in, which live only for the session.
 *
 * A font is megabytes of binary; keeping one in localStorage to survive a
 * reload would cost more than it is worth and would still be gone on another
 * device. So these are deliberately temporary, and everything that consumes a
 * family id already falls back to the default when the id is unknown — which
 * is exactly what happens after a reload.
 */
const custom = [];

export function fontCatalog() {
  return custom.length ? [...FONT_CATALOG, ...custom] : FONT_CATALOG;
}

/**
 * Parses a dropped file and adds it to the catalog.
 *
 * opentype.js reads TTF and OTF. A static font ships one weight and that is
 * what the family gets — the weight slider then disables itself, the same way
 * it does for Anton or Pacifico, rather than pretending to interpolate
 * something that is not in the file.
 */
export async function registerFont(file) {
  const [buffer, opentype] = await Promise.all([file.arrayBuffer(), opentypeLib()]);
  const font = opentype.parse(buffer); // throws on anything it cannot read
  const id = `custom-${custom.length + 1}-${Date.now().toString(36)}`;
  const name =
    font.names?.fullName?.en ??
    font.names?.fontFamily?.en ??
    file.name.replace(/\.[^.]+$/, '');
  // The weight the file declares, snapped to the usual ladder so the readout
  // says something recognisable.
  const declared = font.tables?.os2?.usWeightClass ?? 400;
  const weight = Math.min(900, Math.max(100, Math.round(declared / 100) * 100));

  custom.push({ id, name, group: 'Yours', weights: [weight], custom: true });
  fontCache.set(`${id}-${weight}`, Promise.resolve(font));
  return { id, name, weight };
}


export const DEFAULT_FAMILY = 'inter';

export function getFamily(familyId) {
  return fontCatalog().find((f) => f.id === familyId) ?? FONT_CATALOG[0];
}

/** Nearest weight the family actually ships. Static fonts have no in-between. */
export function snapWeight(familyId, weight) {
  const { weights } = getFamily(familyId);
  return weights.reduce((best, w) =>
    Math.abs(w - weight) < Math.abs(best - weight) ? w : best,
  );
}

export function weightIndex(familyId, weight) {
  return getFamily(familyId).weights.indexOf(snapWeight(familyId, weight));
}

export function loadFont(familyId, weight) {
  const snapped = snapWeight(familyId, weight);
  const key = `${familyId}-${snapped}`;
  // A dropped font was parsed at registration and put straight in the cache,
  // so there is nothing to fetch — and nothing on disk to fetch it from.
  if (!fontCache.has(key)) {
    // Both at once: the parser is not needed until the bytes arrive, and the
    // bytes are no use until the parser does.
    const promise = Promise.all([
      fetch(`${import.meta.env.BASE_URL}fonts/${key}.ttf`).then((res) => {
        if (!res.ok) throw new Error(`Missing public/fonts/${key}.ttf`);
        return res.arrayBuffer();
      }),
      opentypeLib(),
    ])
      .then(([buf, opentype]) => opentype.parse(buf))
      .catch((err) => {
        fontCache.delete(key); // let a later attempt retry
        throw err;
      });
    fontCache.set(key, promise);
  }
  return fontCache.get(key);
}
