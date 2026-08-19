/**
 * Parallel threads that never break, only swell.
 *
 * Hatching answers the shape by *presence*: a rule is drawn where there is ink
 * and absent where there is not, so the picture is made of what is missing.
 * This answers by weight instead — the word appears purely as the places where
 * the threads thicken. Nothing is cut and nothing is dropped, which is why it
 * plots in one pass per thread and why the letters read at a spacing far
 * coarser than hatching would survive.
 *
 * A stroke cannot vary its width along its length, so each thread is a closed
 * ribbon: the centreline sampled, offset both ways by half the local weight,
 * and the two edges joined into one outline. That is real geometry rather than
 * a stroke, so it survives into a cutter or a fill exactly as drawn.
 *
 * ON THE FRAME
 *   The first version gave every thread a floor width, so each one ruled the
 *   full frame edge to edge whether there was anything to say out there or
 *   not, and the word ended up sitting in a drawn rectangle. The frame is not
 *   part of the artwork. At a floor of zero the ribbon closes to nothing away
 *   from the ink and the piece ends where the type does; `falloff` then decides
 *   how it gets there, by widening the box each sample averages over. A wider
 *   box bleeds the ink outward, so the taper lengthens without anything having
 *   to know where the edges are.
 *
 *   Zero-width ribbon is invisible but it is still geometry, and a page of
 *   frame-wide paths carrying nothing is a page an editor has to open. The
 *   runs where a thread has width are emitted separately, so what exports is
 *   what you can see.
 */

import { hashRandom, num } from './helpers.js';
import { markWeight, weighsMarks } from '../motion.js';

/** Ceiling on samples, so the finest thread on a long word still tracks a drag. */
const MAX_SAMPLES = 90_000;

export function threadMarks({
  geo,
  spacing,
  angle,
  thin,
  thick,
  falloff,
  response,
  seed,
  wobble,
  color,
  fx,
}) {
  const { box, tone } = geo;
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const span = Math.hypot(box.width, box.height) / 2;

  const gap = Math.max(1.5, spacing);
  const rows = Math.ceil((span * 2) / gap);
  let step = Math.max(1, gap / 3);
  if ((rows * (span * 2)) / step > MAX_SAMPLES) step = (rows * span * 2) / MAX_SAMPLES;
  const along = Math.max(4, Math.ceil((span * 2) / step));

  const front = fx.wipe !== null ? box.x + fx.wipe * box.width : null;
  const weighted = weighsMarks(fx);
  const low = Math.min(thin, thick);
  const high = Math.max(thin, thick);
  const parts = [];

  // How wide a box each sample averages over. At zero it is the thread's own
  // spacing, which is a hard edge at the outline; opening it up bleeds the ink
  // outward, and the thread tapers away over that distance instead.
  const reach = gap * (1 + Math.max(0, falloff ?? 0) * 7);
  // Below this a ribbon is thinner than a hairline and is a gap, not a thread.
  const VISIBLE = 0.05;

  for (let j = 0; j <= rows; j++) {
    if (fx.build < 1 && hashRandom(j, 0, fx.reveal) > fx.build) continue;
    const v = -span + j * gap;

    // A thread is emitted as the runs where it has width, so a floor of zero
    // ends the piece at the type rather than leaving invisible geometry
    // stretched across the frame.
    let top = [];
    let bottom = [];
    const flush = () => {
      if (top.length > 1) {
        bottom.reverse();
        parts.push(`M${top.join('L')}L${bottom.join('L')}Z`);
      }
      top = [];
      bottom = [];
    };

    for (let i = 0; i <= along; i++) {
      const u = -span + (i / along) * span * 2;
      const x = cx + u * cos - v * sin;
      const y = cy + u * sin + v * cos;

      // Past the wipe front the thread is still there, at nothing.
      let ink = tone.average(x, y, reach);
      if (front !== null && x > front) ink = 0;

      // Response bends the middle of the range without moving its ends: below
      // one the thin parts fatten and the word blooms, above one they starve
      // and only the solid middles of the strokes survive.
      const t = response === 1 ? ink : Math.pow(Math.max(0, Math.min(1, ink)), response);
      let w = low + (high - low) * t;
      if (weighted) {
        w *= Math.max(0, markWeight(fx, (x - box.x) / box.width, (y - box.y) / box.height));
      }
      if (wobble) w *= 1 + (hashRandom(j, i, seed) - 0.5) * 2 * wobble;
      w = Math.max(0, w) / 2;

      if (w < VISIBLE) {
        // Closed at nothing rather than cut, so the run still comes to a point
        // instead of ending on a blunt edge mid-taper.
        if (top.length) {
          top.push(`${num(cx + u * cos - v * sin)} ${num(cy + u * sin + v * cos)}`);
          bottom.push(`${num(cx + u * cos - v * sin)} ${num(cy + u * sin + v * cos)}`);
          flush();
        }
        continue;
      }

      top.push(`${num(cx + u * cos - (v - w) * sin)} ${num(cy + u * sin + (v - w) * cos)}`);
      bottom.push(`${num(cx + u * cos - (v + w) * sin)} ${num(cy + u * sin + (v + w) * cos)}`);
    }
    flush();
  }

  if (!parts.length) return '';
  return `<path d="${parts.join('')}" fill="${color}"/>`;
}
