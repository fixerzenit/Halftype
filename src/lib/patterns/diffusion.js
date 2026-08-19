/**
 * Turing: two chemicals, one letterform, and a long wait.
 *
 * Gray-Scott. Two substances share a dish: U is fed in from everywhere at rate
 * F, V is removed at rate F+k, and the reaction U + 2V -> 3V converts one into
 * the other wherever V already is. Both diffuse, U about twice as fast as V.
 * That is the whole of it — four numbers and a Laplacian — and out of it come
 * spots, stripes, mazes, corals and mitosis, which is why Turing wrote it down
 * as an account of how an animal gets its markings.
 *
 * THE REASON THIS EXISTS TWICE
 *
 * There was a reaction-diffusion style here before and it was taken out; the
 * note at the top of physarum.js is its obituary. The diagnosis there is
 * correct and worth repeating, because it is the whole design problem:
 *
 *   "Turing patterns live in a narrow band of feed and kill rates, and a step
 *    outside it in either direction gives a dead field or a flooded one."
 *
 * That is true, and it is not a reason the effect cannot be had. It is a reason
 * F and k must not be sliders. The band is a thin curve through a
 * two-dimensional space, and a control per axis is a control that spends most
 * of its travel outside it — which is precisely what that attempt shipped.
 *
 * So there is one slider, and it walks *along* the curve rather than across it.
 * Every position on it is a regime somebody has named: solitons, maze, holes,
 * coral, mitosis. There is nowhere on the control that is dead, because the
 * dead parts of the space are not on the control at all.
 *
 * THE LETTERFORM
 *
 * It is the seed and nothing else. V starts at zero everywhere except in the
 * ink, and everything the pattern does afterwards it does on its own — so
 * turning Growth up is watching the word be eaten and replaced by whatever the
 * chemistry wanted to make of it, which is the sequence in the reference and
 * the only honest way to get it.
 */

import { traceField } from '../sources/trace.js';
import { hashRandom, num } from './helpers.js';

/**
 * The grid the reaction runs on.
 *
 * Cells times steps is the whole cost and both matter to the look: cells set
 * how fine the pattern is, steps set how far it has got. Twenty-six thousand
 * and twenty-six hundred is about a second, which is what the other grown
 * styles here cost, and it is cached like they are — only the threshold moves
 * cheaply.
 */
const MAX_ROWS = 150;
const MAX_CELLS = 26_000;

/** Diffusion rates. U spreads twice as fast as V; that ratio is the pattern. */
const DU = 0.16;
const DV = 0.08;

/**
 * How much extra kill a cell off the letterform takes at a full grip.
 *
 * WHAT THIS REPLACED, AND WHY
 *
 * The word used to hold the reaction by raising the *feed* where the ink was —
 * more U inside the letter, on the theory that it would keep the word legible
 * while the pattern took it over. Measured on a five-letter word at the shipped
 * default, it did the opposite of that. The inside of the letter came out a
 * hundred per cent lit with zero flips along a row: a solid slab, with every
 * scrap of pattern on the desk around it. It also silently disabled the seed
 * control below, because a letter re-nucleating from everywhere has forgotten
 * where it started — Outline and Fill differed by 0.1% of the field at the old
 * default and by 24% with the boost off.
 *
 * So the feed is left alone and the word holds the reaction from outside
 * instead, by making the desk somewhere V cannot live. Nine pairs of constants
 * were run across the whole chemistry slider at three grips; this one gives the
 * most contrast *inside* the letter at every regime (0.12 to 0.32 sd, against
 * 0.07 to 0.23 for the nearest boosted rival) while bringing the desk down to
 * a mean of 0.01.
 *
 * The number itself is then scaled so the slider spans its own travel. The
 * measurements above were taken with the useful range sitting in the bottom
 * two fifths of a 0-to-1 control, which is three fifths of a slider that does
 * nothing — the same fault the chemistry control was built to avoid. Real
 * letterforms are the reason: a stroke of Inter at this size is a few cells
 * across, and a maze confined to a channel that narrow is just the channel. So
 * full grip is what four tenths used to be, and the whole slider is live.
 */
const OFF_INK_KILL = 0.0056;

/**
 * The live band, as a path rather than a plane.
 *
 * Five regimes from Pearson's classification of this system, in the order they
 * grow into one another. The slider interpolates between neighbours, and every
 * segment between two of these stays inside the band — which is the property
 * the two-slider version could not have.
 */
const REGIMES = [
  { at: 0.0, f: 0.014, k: 0.047, name: 'solitons' },
  { at: 0.25, f: 0.029, k: 0.057, name: 'maze' },
  { at: 0.5, f: 0.039, k: 0.058, name: 'holes' },
  { at: 0.75, f: 0.0545, k: 0.062, name: 'coral' },
  { at: 1.0, f: 0.0367, k: 0.0649, name: 'mitosis' },
];

/** Feed and kill at a point along the path. */
export function regimeAt(t) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < REGIMES.length - 1; i++) {
    const a = REGIMES[i];
    const b = REGIMES[i + 1];
    if (x <= b.at) {
      const u = (x - a.at) / (b.at - a.at);
      return { f: a.f + (b.f - a.f) * u, k: a.k + (b.k - a.k) * u };
    }
  }
  return { f: REGIMES.at(-1).f, k: REGIMES.at(-1).k };
}

let cached = null;

/**
 * Run the reaction and hand back a field the tracer can read.
 *
 * The buffers carry a one-cell border that is never written, so the inner loop
 * has no bounds tests at all — nine reads and a couple of dozen multiplies per
 * cell per step, and there are seventy million of those in a full run. Every
 * branch taken out of that loop is worth more than any other optimisation here.
 */
export function react({ geo, pattern, growth, scale, grip, seeding, seed }) {
  const key = [
    geo.key ?? geo.d.length, geo.box.x, geo.box.width,
    pattern, growth, scale, grip, seeding, seed,
  ].join('|');
  if (cached && cached.key === key) return cached.value;

  const { box, tone } = geo;
  const aspect = box.width / box.height;
  let rows = Math.max(24, Math.round(MAX_ROWS * scale));
  let cols = Math.max(8, Math.round(rows * aspect));
  if (cols * rows > MAX_CELLS) {
    const shrink = Math.sqrt(MAX_CELLS / (cols * rows));
    cols = Math.max(8, Math.floor(cols * shrink));
    rows = Math.max(8, Math.floor(rows * shrink));
  }

  // A one-cell border that is never written and never read as a value that
  // matters: it keeps U at 1 and V at 0 all round, which is exactly the
  // boundary this reaction wants, and it is what lets the inner loop below have
  // no bounds tests at all.
  const w = cols + 2;
  const h = rows + 2;
  const u = new Float32Array(w * h).fill(1);
  const v = new Float32Array(w * h);
  const nu = new Float32Array(w * h);
  const nv = new Float32Array(w * h);
  // How much of the letterform is at each cell, kept for the feed bias below.
  const ink = new Float32Array(w * h);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = box.x + ((c + 0.5) / cols) * box.width;
      const y = box.y + ((r + 0.5) / rows) * box.height;
      ink[(r + 1) * w + (c + 1)] = tone.at(x, y);
    }
  }

  /**
   * Where V starts, which is not the same question as where the word is.
   *
   * The ink stays whole either way — it is what the feed leans on and what the
   * containment measures against. This is only the seed, and moving it moves
   * where the reaction begins rather than what it is fed by:
   *
   *   Fill    — all of it, and the pattern grows inward from everywhere at once.
   *   Outline — the rim only. The letter fills from its own edge, which is the
   *             thin bulbed skeleton the reference opens with, and it is not
   *             reachable from Fill at any growth.
   *   Scatter — a sixth of the cells, so the letter comes up in islands that
   *             spread and meet. Between the two.
   */
  const rim = seeding === 'edge';
  const sparse = seeding === 'scatter';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r + 1) * w + (c + 1);
      if (ink[i] <= 0.5) continue;
      if (rim) {
        // On the rim if any of the four neighbours is off the letter. The
        // border cells read as ink 0, so a stroke touching the frame still has
        // a rim there, which is what you want.
        const edge = ink[i - 1] <= 0.5 || ink[i + 1] <= 0.5
          || ink[i - w] <= 0.5 || ink[i + w] <= 0.5;
        if (!edge) continue;
      } else if (sparse && hashRandom(c, r, seed ^ 0x5bd1) > 0.17) {
        continue;
      }
      // The classic seed: half the U spent, a quarter of it now V. The noise
      // is what breaks the symmetry — a perfectly even seed in a perfectly
      // even field is a fixed point, and the reaction sits there for ever.
      u[i] = 0.5;
      v[i] = 0.25 + (hashRandom(c, r, seed) - 0.5) * 0.05;
    }
  }

  const { f, k } = regimeAt(pattern);
  const steps = Math.round(200 + growth * 2400);

  /**
   * Kill, solved once per cell instead of once per cell per step.
   *
   * It only ever depended on the ink, which does not move — so the multiply and
   * the add that used to sit in the inner loop are one lookup, and the loop
   * reads the same one array it read before.
   *
   * GRIP is what the second table buys. Left to itself the reaction walks off
   * the letterform and fills the frame, and at high growth that is all it does;
   * raising the kill rate everywhere the ink is not means V cannot survive out
   * there, so the pattern is bounded by the word instead of by the artboard.
   * Ink is a tone, not a mask, so the ramp is as soft as the letter's own edge.
   */
  const killAt = new Float32Array(w * h).fill(f + k + grip * OFF_INK_KILL);
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const i = r * w + c;
      killAt[i] = f + k + grip * OFF_INK_KILL * (1 - ink[i]);
    }
  }

  let a = { u, v };
  let b = { u: nu, v: nv };

  /**
   * The step, and the two things that make it cheap enough to run.
   *
   * A nine-point Laplacian reads nine cells per cell, and six of those nine
   * were read one column ago — so the row is walked with a sliding window of
   * three triples per field instead. Three reads a cell rather than nine, on
   * two fields, over twenty-six million cell-steps.
   *
   * And it stops when it has stopped. Most settings on this control reach a
   * standing pattern well before the step count runs out, and every step after
   * that is arithmetic that changes nothing. The largest change in V across the
   * grid is checked every thirty-two steps and the run ends when it falls under
   * a ten-thousandth — which is a hundred times smaller than the quantisation
   * of the byte field it is about to be written into, so nothing that is
   * checked can see the difference.
   */
  const SETTLED = 1e-4;

  for (let step = 0; step < steps; step++) {
    const au = a.u;
    const av = a.v;
    const bu = b.u;
    const bv = b.v;
    for (let r = 1; r <= rows; r++) {
      const p0 = (r - 1) * w;
      const p1 = r * w;
      const p2 = (r + 1) * w;
      // The window, one column behind where the loop is about to look. Named
      // by where they sit: a b g across the row above, c d h across this one,
      // e f i across the one below — so d is the cell being solved, b/f/c/h are
      // its edge neighbours and a/g/e/i its corners. Worth writing down: the
      // first version of this had g and f in each other's group, which put a
      // corner on the edge weight and made the Laplacian directional. The
      // pattern still looked like a Turing pattern. It was a different one, in
      // every cell of the field, and only a comparison against the old loop
      // said so.
      let ua = au[p0], ub = au[p0 + 1];
      let uc = au[p1], ud = au[p1 + 1];
      let ue = au[p2], uf = au[p2 + 1];
      let va = av[p0], vb = av[p0 + 1];
      let vc = av[p1], vd = av[p1 + 1];
      let ve = av[p2], vf = av[p2 + 1];

      for (let c = 1; c <= cols; c++) {
        const ug = au[p0 + c + 1];
        const uh = au[p1 + c + 1];
        const ui = au[p2 + c + 1];
        const vg = av[p0 + c + 1];
        const vh = av[p1 + c + 1];
        const vi = av[p2 + c + 1];

        const cu = ud;
        const cv = vd;
        const lu = (ub + uf + uc + uh) * 0.2 + (ua + ug + ue + ui) * 0.05 - cu;
        const lv = (vb + vf + vc + vh) * 0.2 + (va + vg + ve + vi) * 0.05 - cv;
        const uvv = cu * cv * cv;
        const i = p1 + c;
        bu[i] = cu + DU * lu - uvv + f * (1 - cu);
        bv[i] = cv + DV * lv + uvv - killAt[i] * cv;

        ua = ub; ub = ug;
        uc = ud; ud = uh;
        ue = uf; uf = ui;
        va = vb; vb = vg;
        vc = vd; vd = vh;
        ve = vf; vf = vi;
      }
    }

    const swap = a;
    a = b;
    b = swap;

    // The settle check is its own sweep rather than a test inside the cell
    // loop: asking "is this a checking step" once every twenty-six thousand
    // cells costs about five per cent, and asking it once per step costs
    // nothing. a.v is the field just written, b.v the one before it.
    if ((step & 31) === 31) {
      const fresh = a.v;
      const stale = b.v;
      let moved = 0;
      for (let i = 0; i < fresh.length; i++) {
        const d = fresh[i] - stale[i];
        const abs = d < 0 ? -d : d;
        if (abs > moved) moved = abs;
      }
      if (moved < SETTLED) break;
    }
  }

  // V, as the byte field the tracer wants. Normalised against its own peak so
  // the threshold means the same thing at every regime — V tops out anywhere
  // between 0.2 and 0.5 depending where on the path you are.
  const out = a.v;
  let peak = 0;
  for (let i = 0; i < out.length; i++) if (out[i] > peak) peak = out[i];
  const values = new Uint8Array(cols * rows);
  if (peak > 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = (out[(r + 1) * w + (c + 1)] / peak) * 255;
        values[r * cols + c] = t > 255 ? 255 : t;
      }
    }
  }

  const value = { cols, rows, box, values };
  cached = { key, value };
  return value;
}

export function diffusionMarks({
  geo,
  pattern,
  growth,
  scale,
  grip,
  seeding,
  level,
  smoothing,
  style,
  thickness,
  seed,
  color,
  fx,
}) {
  const field = react({ geo, pattern, growth, scale, grip, seeding, seed });
  const d = traceField(field, Math.max(0.02, level), smoothing);
  if (!d) return '';

  // One shape, so the reveal effects act on it as one — there are no marks
  // here to hide or displace individually.
  const alpha = fx.build < 1 ? Math.max(0.05, fx.build) : 1;
  return style === 'outline'
    ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${num(thickness)}" ` +
        `stroke-linejoin="round" opacity="${num(alpha)}"/>`
    : `<path d="${d}" fill="${color}" fill-rule="nonzero" opacity="${num(alpha)}"/>`;
}
