import { useEffect, useRef, useState } from 'react';
import { registerFont } from '../lib/fonts.js';
import { PALETTES } from '../lib/palettes.js';
import FontPicker from './FontPicker.jsx';
import { EASINGS, MOTION_MODES } from '../lib/motion.js';
import { availableFormats } from '../lib/animate.js';
import { CYCLE_AT_1X } from '../App.jsx';
import Segmented from './ui/Segmented.jsx';
import { Button, Note, Row, Switch } from './ui/Controls.jsx';



/**
 * The masthead: one slim rank, and two things that open out of it.
 *
 * The file below is one card to a screen, so every row spent up here is a row
 * taken off the artwork — permanently, because this bar does not scroll away.
 * What has earned its place is what you reach for *between* cards: the word,
 * the face it is set in, and a link to what you are looking at. The colours
 * open from a swatch, and everything about how the letters are set and how
 * they move is behind Settings.
 *
 * The index used to hang off the bottom of this bar, two rows of style names
 * touching the file they belong to. It is down the side of the desk now — see
 * StyleRail — which gives those two rows back to the page and leaves this a
 * single rank, which is all it ever wanted to be.
 */
export default function TopBar({
  text,
  onText,
  familyId,
  onFamily,
  fg,
  onFg,
  bg,
  onBg,
  transparent,
  onTransparent,
  playing,
  onPlaying,
  speed,
  onSpeed,
  motionMode,
  onMotionMode,
  easing,
  onEasing,
  clipFormat,
  onClipFormat,
}) {
  // A dropped font is added to a module-level catalog, which React has no way
  // of noticing. Bumping this is what tells the picker to read it again.
  const [fontsVersion, setFontsVersion] = useState(0);
  const [fontError, setFontError] = useState(null);
  const [panel, setPanel] = useState(null);
  const fontInput = useRef(null);

  const takeFont = async (file) => {
    if (!file) return;
    try {
      const { id } = await registerFont(file);
      setFontsVersion((v) => v + 1);
      setFontError(null);
      onFamily(id);
    } catch {
      setFontError("Couldn't read that font");
    }
  };

  // The bar is fixed and the file is sized against what is left, so its real
  // height has to be published rather than guessed at.
  const ref = useRef(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty('--header-h', `${entry.contentRect.height}px`);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  /**
   * Escape closes whichever is open, and so does a click anywhere else — a
   * panel you have to find the button for again to dismiss is a panel you
   * leave open.
   *
   * "Anywhere else" is measured against the whole masthead, and that word is
   * the entire bug this used to be. It measured against the top row, and the
   * panels are not in the top row: they are siblings of it, further down the
   * header. So a press on anything inside a panel counted as a press outside,
   * and `pointerdown` — which fires before `click` — tore the panel down while
   * the button was still being pressed. The click then landed on nothing.
   *
   * Every control in both panels was dead: Play, Motion, Cycle, the easing, the
   * export format, both colour wells, every palette swatch. Not dead in a way
   * any test using `element.click()` can see, either, because that dispatches
   * a click with no pointer event in front of it — which is why this survived
   * three rounds of "the animation is broken" and a hit-test sweep of every
   * control in the app.
   */
  useEffect(() => {
    if (!panel) return undefined;
    const onKey = (event) => event.key === 'Escape' && setPanel(null);
    const away = (event) => {
      if (!ref.current?.contains(event.target)) setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', away);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', away);
    };
  }, [panel]);

  const mode = MOTION_MODES.find((m) => m.value === motionMode);
  const toggle = (which) => setPanel((open) => (open === which ? null : which));

  return (
    <header ref={ref} className="relative z-40 bg-page">
      {/* Four punches, and the wires come up through them.

          The bar had padding on the top and none at all on the bottom — the
          index used to hang off the underside and provided the space, and when
          that moved out the bar was left sitting on its own bottom edge with
          its contents pushed up. Equal now, and a little more of it: the
          masthead is the one horizontal band in a page made of stacked
          rectangles, and it needs the height to read as a band rather than as
          a strip.

          The holes are at the same insets and the same four fractions as the
          eyelets in the paper, so a wire runs from a hole in the sheet to a
          hole in the bar without either being told about the other. That is
          the whole trick: the book is not drawn hanging from the masthead, it
          is punched to the same pattern, and the eye does the rest. */}
      <span className="header-punches" aria-hidden>
        {[14, 38, 62, 86].map((at) => (
          <span key={at} className="header-punch" style={{ left: `${at}%` }} />
        ))}
      </span>

      <div className="mx-auto max-w-[110rem] px-5 py-5 lg:px-8 lg:py-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          {/* Live type rather than a mask of the app's own output — see
              .wordmark for why the second was the worse of two nice ideas. */}
          <h1 className="wordmark shrink-0">Untypo</h1>

          <textarea
            value={text}
            onChange={(event) => onText(event.target.value)}
            rows={1}
            placeholder="untypo"
            spellCheck={false}
            autoComplete="off"
            aria-label="Text"
            /* Takes all the slack, and that is the point.

               It was capped, and everything after it pushed to the far end
               with `ml-auto` — which put one wide gap in the middle of the bar
               and the row's own gap everywhere else. Uncapped and with nothing
               pushing, the row has a single gap repeated all the way along:
               the space between the wordmark and the field is the space
               between the field and the typeface, because both are that gap
               and nothing else is. */
            className="min-w-[10rem] flex-1 resize-none rounded-[var(--radius-control)]
                       bg-fill-soft px-4 py-[0.5rem] text-[0.9rem] leading-snug outline-none
                       placeholder:text-ink-soft"
          />
          <FontPicker
            key={fontsVersion}
            familyId={familyId}
            onChange={onFamily}
            className="w-[8.4rem] shrink-0 lg:w-[9.6rem]"
          />
          <Button
            onClick={() => fontInput.current?.click()}
            variant={fontError ? 'yellow' : 'violet'}
            title={fontError ?? 'Use a TTF or OTF from your own machine'}
          >
            {fontError ?? 'Font'}
          </Button>
          <input
            ref={fontInput}
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf"
            className="hidden"
            onChange={(event) => takeFont(event.target.files?.[0])}
          />

          {/* The swatch, Settings and Share travel together. Left to wrap on
              their own a narrow bar put Settings on a line by itself, which is
              a row of chrome spent on one word — and it belongs beside the
              colours anyway, because both are "change how this looks". */}
          <div className="flex shrink-0 items-center gap-3">
          {/* The two colours as one swatch. It is the pair that matters — the
              whole design is two colours — so showing the pair and opening the
              pair from it costs one control where two wells cost three. */}
          <button
            type="button"
            onClick={() => toggle('colour')}
            aria-expanded={panel === 'colour'}
            title="Colours"
            className={`h-[2.1rem] w-[2.1rem] shrink-0 overflow-hidden rounded-full
                        transition duration-250 ease-[var(--ease-snap)]
                        ${panel === 'colour' ? 'ring-2 ring-ink ring-offset-2' : 'hover:scale-110'}`}
            style={{ background: bg }}
          >
            <span
              className="block h-full w-full"
              style={{ background: fg, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
            />
          </button>

          {/* Animate, and it says whether it is running.

              It was "Settings", which held the typography sliders and the
              motion controls together — two unrelated things behind one word
              that named neither. The typography lives on card 01, where the
              silhouette is edited and where it always belonged, so what is
              left behind this button is motion and only motion. Naming it for
              the one job it has is what lets the panel be read at a glance. */}
          <Button
            onClick={() => toggle('animate')}
            aria-expanded={panel === 'animate'}
            variant={panel === 'animate' ? 'solid' : playing ? 'violet' : 'fill'}
          >
            {panel === 'animate' ? 'Close' : playing ? '❙❙  Animate' : 'Animate'}
          </Button>
          </div>
        </div>
      </div>

      {/* Both panels sit over the file rather than pushing it down: a card is
          sized against this bar, and a bar that changes height moves the hinge
          every card is rotating about. */}
      {panel === 'colour' && (
        <Panel>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <Well label="Pattern" value={fg} onChange={onFg} />
            <Well label="Background" value={bg} onChange={onBg} disabled={transparent} />
            <Switch checked={transparent} onChange={onTransparent} label="Transparent" />
            {/* Two colours is the whole design, so a palette is a pair and the
                swatch shows all of it. They stay editable afterwards, so a
                palette is a starting point rather than a mode you are in. */}
            <div className="flex flex-wrap items-center gap-2">
              {PALETTES.map((palette) => {
                const on = fg.toLowerCase() === palette.fg && bg.toLowerCase() === palette.bg;
                return (
                  <button
                    key={palette.id}
                    type="button"
                    title={palette.name}
                    aria-label={palette.name}
                    aria-pressed={on}
                    onClick={() => {
                      onFg(palette.fg);
                      onBg(palette.bg);
                    }}
                    className={`h-[1.8rem] w-[1.8rem] overflow-hidden rounded-full
                                transition duration-250 ease-[var(--ease-snap)]
                                ${on ? 'ring-2 ring-ink ring-offset-2' : 'hover:scale-115'}`}
                    style={{ background: palette.bg }}
                  >
                    <span
                      className="block h-full w-full"
                      style={{ background: palette.fg, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>
      )}

      {panel === 'animate' && (
        <Panel>
          {/* The same gap the masthead uses, so the two ranks read as one bar
              that happens to be two rows tall. */}
          <div className="flex flex-wrap items-center gap-x-[13px] gap-y-3">
            <Button
              variant={playing ? 'solid' : 'violet'}
              onClick={() => onPlaying(!playing)}
              aria-pressed={playing}
              className="h-[2rem] min-w-[7rem]"
            >
              {playing ? '❙❙  Pause' : '▶  Play'}
            </Button>

            {/* `shrink-0` on every group in this rank.

                Without it a flex row shares its slack by squeezing whatever
                will give, and a segmented control gives — it carries
                `min-w-0 truncate` so it can survive a narrow card. Here there
                is no shortage of room, only a row that had not been told to
                stop taking it, and the result was "Ease in-out" reading as
                "Ease in-…" on a bar with two hundred spare pixels. The row
                wraps instead now, which is what the spare room is for. */}
            <label
              /* The whole row on a phone, its own width on a desk. Stacked but
                 still shrink-wrapped, the group could give and did: four
                 easings shared the width of the word "Easing" and every one of
                 them clipped by a few pixels. */
              className="flex w-full flex-col items-start gap-1 text-[0.75rem]
                         sm:w-auto sm:shrink-0 sm:flex-row sm:items-center sm:gap-2.5"
            >
              Motion
              <select
                value={motionMode}
                onChange={(event) => onMotionMode(event.target.value)}
                aria-label="Motion"
                title={mode?.hint}
                className="h-[2rem] w-full rounded-[var(--radius-control)] bg-fill-soft px-4
                           text-[0.78rem] sm:w-auto
                           outline-none transition duration-250 ease-[var(--ease-snap)] hover:bg-fill"
              >
                {MOTION_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            {/* One cycle, in seconds.

                The stored value is still a rate, because that is what the
                clock integrates and what a saved session and an export both
                already speak. What it was *shown* as was a multiplier — 1.4x
                of a duration nothing ever stated — which is a number you can
                only use by experiment. Seconds you can decide in advance. */}
            <div className="w-[16rem] shrink-0">
              <Row label="Cycle" value={`${(CYCLE_AT_1X / speed).toFixed(1)}s`}>
                <input
                  type="range"
                  min={0.5}
                  max={20}
                  step={0.5}
                  // Backwards, so that dragging right lengthens the cycle: the
                  // control reads as duration, and duration should grow to the
                  // right however the rate underneath it behaves.
                  value={CYCLE_AT_1X / speed}
                  onChange={(event) => onSpeed(CYCLE_AT_1X / Number(event.target.value))}
                />
              </Row>
            </div>

            <label
              /* The whole row on a phone, its own width on a desk. Stacked but
                 still shrink-wrapped, the group could give and did: four
                 easings shared the width of the word "Easing" and every one of
                 them clipped by a few pixels. */
              className="flex w-full flex-col items-start gap-1 text-[0.75rem]
                         sm:w-auto sm:shrink-0 sm:flex-row sm:items-center sm:gap-2.5"
            >
              Easing
              <Segmented
                fit
                className="h-[2rem] w-full sm:w-auto"
                options={EASINGS}
                value={easing}
                onChange={onEasing}
              />
            </label>

            <label
              /* The whole row on a phone, its own width on a desk. Stacked but
                 still shrink-wrapped, the group could give and did: four
                 easings shared the width of the word "Easing" and every one of
                 them clipped by a few pixels. */
              className="flex w-full flex-col items-start gap-1 text-[0.75rem]
                         sm:w-auto sm:shrink-0 sm:flex-row sm:items-center sm:gap-2.5"
            >
              Export
              <Segmented
                fit
                className="h-[2rem] w-full sm:w-auto"
                options={availableFormats()}
                value={clipFormat}
                onChange={onClipFormat}
              />
            </label>
          </div>

          <Note className="text-ink-soft">
            {mode?.hint}
            {easing !== 'linear' &&
              ' — only Linear leaves a wrapping loop seamless, so Loop, Ripple and Radial jolt at the seam.'}
          </Note>
        </Panel>
      )}

    </header>
  );
}

function Panel({ children }) {
  return (
    <div className="absolute inset-x-0 top-full z-50 border-t border-rule-soft bg-page shadow-[0_20px_40px_rgb(0_0_0/0.22)]">
      <div className="mx-auto flex max-w-[110rem] flex-col gap-5 px-5 py-5 lg:px-8">{children}</div>
    </div>
  );
}

/**
 * A colour well.
 *
 * Round, because the palette swatches beside it are round and they are the
 * same kind of object. The hex sits under the label rather than beside it, so
 * the row keeps its height as the value changes width.
 */
function Well({ label, value, onChange, disabled }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2.5 ${disabled ? 'opacity-35' : ''}`}>
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-[1.8rem] w-[1.8rem] shrink-0"
      />
      <span className="flex flex-col leading-tight">
        <span className="text-[0.75rem]">{label}</span>
        <span className="font-mono text-[0.6rem] text-ink-soft uppercase">{value}</span>
      </span>
    </label>
  );
}
