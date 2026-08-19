/**
 * The word put through a captcha.
 *
 * Three things happen to those images and they are usually done in the wrong
 * order by anyone imitating them. The letters are *warped* — pushed about by a
 * smooth field, so the strokes bend and the baseline wanders. They are *bled* —
 * printed too heavy, so counters close up and neighbours run into each other.
 * And the edges are *rough* — the threshold that decided ink from paper was
 * noisy, so the boundary is bitten rather than cut.
 *
 * Doing that to the outline directly does not work. Warping a path bends its
 * curves but cannot let two letters merge into one shape, and merging is half
 * the effect: the reason those images defeat a reader is that the `oo` has
 * become a single blob with no way to tell where one letter stopped.
 *
 * The blobs are the fourth thing, and they are the reason this holds together.
 * A captcha is not a clean letter with damage added; it is a letter that was
 * never clean. Holes drawn over the word have their own rims and read as
 * stickers — they have to be *subtracted from the same field*, so that a hole
 * meeting an edge makes one boundary rather than two.
 *
 * So all four happen to the *field* instead. The signed distance is sampled
 * at a displaced position, offset by how much the ink should swell, and
 * compared against a threshold that itself carries noise. Then the whole thing
 * is traced back into outlines with marching squares. Topology is free —
 * letters merge, counters close, an `e` fills in — and what comes out is real
 * vector geometry rather than a picture of a bitmap.
 */

import { traceField } from '../sources/trace.js';
import { distanceField } from './distance.js';
import { hashRandom, num } from './helpers.js';

/** Grid the distortion is computed on. Finer than the tracer needs is wasted. */
const MAX_CELLS = 260_000;

let cached = null;

/**
 * Smooth value noise at a point.
 *
 * Sines rather than a gradient lattice, because what is wanted here is a field
 * with no preferred direction and no visible grid, and three octaves of sine
 * gives that in a dozen lines. A lattice noise would also be tileable, which is
 * of no use to anything that happens once.
 */
function wobble(x, y, seed) {
  const a = hashRandom(1, 0, seed) * Math.PI * 2;
  const b = hashRandom(2, 0, seed) * Math.PI * 2;
  const c = hashRandom(3, 0, seed) * Math.PI * 2;
  return (
    Math.sin(x + a) * 0.55 +
    Math.sin(y * 1.31 + b) * 0.55 +
    Math.sin((x * 0.61 + y * 0.83) * 1.7 + c) * 0.35 +
    Math.sin((x * 1.9 - y * 1.3) * 0.9 + a + b) * 0.2
  );
}

function distort({ geo, warp, scale, swell, grain, blobs, blobSize, seed }) {
  const key = [
    geo.key ?? geo.d.length, geo.box.x, geo.box.width,
    warp, scale, swell, grain, blobs, blobSize, seed,
  ].join('|');
  if (cached && cached.key === key) return cached.value;

  const field = distanceField(geo);
  const { box } = geo;
  let cols = field.cols;
  let rows = field.rows;
  if (cols * rows > MAX_CELLS) {
    const shrink = Math.sqrt(MAX_CELLS / (cols * rows));
    cols = Math.max(8, Math.floor(cols * shrink));
    rows = Math.max(8, Math.floor(rows * shrink));
  }

  // Reads the source field at any position, in world units.
  const at = (x, y) => {
    const c = Math.max(
      0,
      Math.min(field.cols - 1, Math.round(((x - box.x) / box.width) * field.cols - 0.5)),
    );
    const r = Math.max(
      0,
      Math.min(field.rows - 1, Math.round(((y - box.y) / box.height) * field.rows - 0.5)),
    );
    return field.values[r * field.cols + c];
  };

  // Wavelength in world units, so the wobble is the same size relative to the
  // letters whatever the word is.
  const wave = (Math.PI * 2) / Math.max(4, box.height * scale);
  const push = warp * box.height * 0.18;
  // The threshold sits at zero — the outline itself — and the noise moves it,
  // which is what bites the edge. Scaled against the letter's own size so it
  // stays a nibble rather than eating a stroke.
  const bite = grain * box.height * 0.02;
  const swelling = swell * box.height * 0.05;

  /**
   * The blobs, placed before anything is drawn.
   *
   * They are holes, and they are holes in the *field* rather than shapes on
   * top of the letters. That is the whole difference between this and a
   * scattering of background-coloured circles: a circle drawn over the word
   * has its own hard rim and reads as a sticker, while a blob that raises the
   * distance field locally is simply somewhere the ink stopped. Where one
   * meets an edge the two boundaries become one boundary — the letter comes
   * out bitten rather than punched — and where one sits inside a stroke it
   * opens a counter with the same soft, uneven lip as everything else here.
   *
   * Seeded on the ink by rejection, because a hole in the paper is not a hole
   * in anything. Roughly a third of the attempts land, so the loop is bounded
   * rather than trusting.
   */
  /**
   * How big a hole is, measured against the stroke and not against the frame.
   *
   * A fraction of the frame's height was the obvious scale and the wrong one:
   * on a short word the letters are large and the holes were bites, on a long
   * one they are small and a single hole swallowed a letter whole. The first
   * run came out as a row of black islands with no word left in it.
   *
   * The letterform's own weight is the honest unit. Distance is signed here,
   * so the mean depth inside the ink is a quarter of the typical stroke, and
   * four times it is the stroke. A hole of six tenths of that is a bite out of
   * a stem; one stroke wide would cut the stem in half, which is where this
   * stops being a captcha and starts being confetti.
   */
  let depth = 0;
  let inked = 0;
  for (let i = 0; i < field.values.length; i++) {
    if (field.values[i] < 0) {
      depth -= field.values[i];
      inked++;
    }
  }
  const stroke = inked > 0 ? 4 * (depth / inked) : box.height * 0.1;
  const spotR = blobSize * stroke * 0.6;
  const spots = [];
  const wanted = Math.round(blobs * 26);
  for (let n = 0; spots.length < wanted && n < wanted * 40; n++) {
    const bx = box.x + hashRandom(n, 1, seed + 5) * box.width;
    const by = box.y + hashRandom(n, 2, seed + 5) * box.height;
    // Inside the ink, and far enough in that the blob has something to bite.
    if (at(bx, by) > -spotR * 0.25) continue;
    spots.push({
      x: bx,
      y: by,
      r: spotR * (0.5 + hashRandom(n, 3, seed + 5) * 1.1),
      turn: hashRandom(n, 4, seed + 5) * Math.PI * 2,
      // Each blob gets its own lobing, so a dozen of them do not read as a
      // dozen copies of one shape.
      lobes: 2 + Math.floor(hashRandom(n, 5, seed + 5) * 3),
    });
  }
  // Squared reach, so the per-cell test below is a compare and not a root.
  for (const spot of spots) spot.reach2 = (spot.r * 1.45) ** 2;

  const values = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = box.x + ((c + 0.5) / cols) * box.width;
      const y = box.y + ((r + 0.5) / rows) * box.height;

      // Two independent fields, so the displacement is a real vector and not a
      // single wave pushing everything along one diagonal.
      const dx = wobble(x * wave, y * wave, seed) * push;
      const dy = wobble(y * wave, x * wave, seed + 41) * push;

      let distance = at(x + dx, y + dy) - swelling;

      // And the blobs push the field back outward. A cone rather than a step,
      // so the hole has a real boundary for the tracer to find rather than a
      // cliff it has to guess at; the radius wobbles with the angle, which is
      // what makes the hole an organic shape instead of a drilled circle.
      for (const spot of spots) {
        const ddx = x - spot.x;
        const ddy = y - spot.y;
        const away2 = ddx * ddx + ddy * ddy;
        if (away2 > spot.reach2) continue;
        const away = Math.sqrt(away2);
        const angle = Math.atan2(ddy, ddx) + spot.turn;
        const edge =
          spot.r * (1 + Math.sin(angle * spot.lobes) * 0.26 + Math.sin(angle * 5 + spot.turn) * 0.12);
        if (away < edge) {
          const lift = edge - away;
          if (lift > distance) distance = lift;
        }
      }
      const edge = wobble(x * wave * 6.3, y * wave * 6.3, seed + 77) * bite;
      // Byte form for the tracer: 255 well inside, 0 well outside, and the
      // interesting half-way point exactly where distance meets the threshold.
      const t = 128 - ((distance - edge) / Math.max(1e-6, box.height * 0.03)) * 127;
      values[r * cols + c] = t < 0 ? 0 : t > 255 ? 255 : t;
    }
  }

  const value = { cols, rows, box, values };
  cached = { key, value };
  return value;
}

export function captchaMarks({
  geo,
  warp,
  scale,
  swell,
  grain,
  blobs,
  blobSize,
  smoothing,
  style,
  thickness,
  seed,
  color,
  fx,
}) {
  const field = distort({ geo, warp, scale, swell, grain, blobs, blobSize, seed });
  const d = traceField(field, 0.5, smoothing);
  if (!d) return '';

  // One shape, so the reveal effects act on it as one — there are no marks
  // here to hide or displace individually.
  const alpha = fx.build < 1 ? Math.max(0.05, fx.build) : 1;
  return style === 'outline'
    ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${num(thickness)}" ` +
        `stroke-linejoin="round" opacity="${num(alpha)}"/>`
    : `<path d="${d}" fill="${color}" fill-rule="nonzero" opacity="${num(alpha)}"/>`;
}
