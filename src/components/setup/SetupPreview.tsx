import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { PresetStyle } from "../../model/presets";
import { change, travel, travelLarge } from "../../motion/tokens";
import { FocusZone } from "../prompt/FocusZone";
import { FOCUS_ANCHOR } from "../../smartfollow/positionMap";

interface SetupPreviewProps {
  /**
   * The FULLY resolved preset — fitted to this screen and carrying the presenter's manual size,
   * i.e. the very object PromptScreen renders from. Anything less and the panel below is a
   * faithful miniature of a screen nobody has.
   */
  preset: PresetStyle;
  presetLabel: string;
  mirror: boolean;
  readingMarker: boolean;
  /** The viewport the preset was resolved against — the thing being scaled DOWN from. */
  viewport: { width: number; height: number };
}

/**
 * The horizontal padding PromptText puts beside the column (`px-6`), in px.
 *
 * It is repeated here because it is the term this component used to get wrong, and getting it
 * wrong is invisible: the old code scaled `columnWidth` by 0.3 and then subtracted an UNSCALED
 * `px-8`, so the preview lost ~50px that no factor accounted for and wrapped text 18.5% earlier
 * at Standard than the real screen did. A preview whose entire job is "what will my script look
 * like" was answering wrong. Scaled with everything else, it cannot drift again.
 */
const PROMPT_PADDING_X = 24;

/**
 * A static, non-scrolling preview of how the teleprompter will look with the chosen preset.
 *
 * It is a **scaled replica of the prompter viewport**, not an approximation of one. ONE factor
 * multiplies every length — font size, column width, the padding beside it, and the line pitch
 * the Focus Zone measures its clear band in — so the line length in ems is identical to Prompt
 * Mode's *by construction*. That is the whole design: fidelity is structural here, where before
 * it was a tuned constant (`PREVIEW_SCALE = 0.3`) that had silently stopped being true.
 *
 * The factor takes the SMALLER of the two axis ratios, so the panel is a properly letterboxed
 * window: the presenter sees the same number of lines they will actually get. Scaling on width
 * alone would fill the panel edge to edge but overstate how much script fits on screen, which is
 * the more expensive lie of the two.
 *
 * Every setting animates its own change, which turns the panel from a picture into the answer to
 * "what does this setting actually do?" — the mirror flip in particular explains Mirror better
 * than the label ever could.
 */
export function SetupPreview({
  preset,
  presetLabel,
  mirror,
  readingMarker,
  viewport,
}: SetupPreviewProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState({ width: 0, height: 0 });

  // The panel is sized by the Setup grid, so it has to be measured rather than assumed. Setup has
  // no per-frame work — unlike Prompt Mode, where this would be unthinkable — so a ResizeObserver
  // here costs nothing and keeps the replica true through a rotation or a window drag.
  //
  // useLayoutEffect, NOT useEffect, and measured: on `useEffect` the first paint happens before
  // this runs, so the sample rendered once at scale 0 and Framer then animated it UP to size —
  // ~200ms of half-size text growing into place every time Setup opened. The old code never showed
  // that because PREVIEW_SCALE was a constant and needed no measurement. This is the same reason
  // PromptScreen re-anchors in a layout effect: a measurement the first frame depends on has to
  // land before that frame, not after it.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setPanel({ width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /*
   * 0 until both measurements land — and the sample is NOT RENDERED while it is, which is
   * load-bearing rather than defensive.
   *
   * Measured: rendering it anyway let the first render establish a scale-0 baseline that Framer
   * then animated away from, so the panel showed unstyled 16px text for ~300ms on every entry to
   * Setup before growing to size. A layout effect alone does not fix that — it stops the browser
   * PAINTING the unmeasured frame, but Framer has still seen two different targets and animates
   * between them. Not mounting the subtree until the number is real is what removes the baseline;
   * `initial={false}` below is what stops the first real value being treated as an entrance.
   */
  const scale =
    panel.width > 0 && viewport.width > 0 && viewport.height > 0
      ? Math.min(panel.width / viewport.width, panel.height / viewport.height)
      : 0;

  const fontSize = preset.fontSize * scale;
  const lineHeightPx = fontSize * preset.lineHeight;

  return (
    <div
      ref={panelRef}
      // Seams for scripts/verify-preset-size.mjs, which measures this panel against the real
      // prompter to prove the replica is one. Named like [data-prompter-column], which it mirrors.
      data-preview-panel
      className="relative h-full min-h-72 overflow-hidden rounded-2xl border border-border bg-bg"
    >
      <motion.div
        className="h-full"
        initial={false}
        animate={{ scaleX: mirror ? -1 : 1 }}
        transition={{ scaleX: travelLarge }}
      >
        {/*
          Placed at the reading anchor rather than centred. The `›` marker and the Focus Zone's
          clear band are both built around FOCUS_ANCHOR, and the sample used to be centred at 50%
          — so the marker pointed at the middle paragraph only by luck, and stopped agreeing with
          it the moment a paragraph wrapped to a different number of lines. Centring the block ON
          the anchor puts the emphasised middle paragraph where the presenter will actually read.
        */}
        {scale > 0 && (
          <motion.div
            className="absolute inset-x-0"
            style={{ top: `${FOCUS_ANCHOR * 100}%` }}
            initial={false}
            animate={{ fontSize, lineHeight: preset.lineHeight }}
            // fontSize and lineHeight are layout properties rather than GPU-composited ones.
            // Affordable here — three paragraphs in a fixed-size panel, nothing else reflows.
            transition={{ fontSize: travel, lineHeight: travel }}
          >
            <motion.div
              data-preview-column
              className="mx-auto -translate-y-1/2"
              style={{
                fontWeight: preset.fontWeight,
                letterSpacing: preset.letterSpacing,
              }}
              initial={false}
              animate={{
                maxWidth: preset.columnWidth * scale,
                paddingLeft: PROMPT_PADDING_X * scale,
                paddingRight: PROMPT_PADDING_X * scale,
              }}
              transition={travel}
            >
              <p className="my-[0.45em] text-fg-muted">Dzień dobry.</p>
              <p className="my-[0.45em]">
                <strong>Witam Państwa</strong> w dzisiejszym wydaniu.
              </p>
              <p className="my-[0.45em] text-fg-muted">
                Zaczynamy od najważniejszych wydarzeń.
              </p>
            </motion.div>
          </motion.div>
        )}
      </motion.div>

      {/*
        The marker is rendered here rather than by FocusZone, and FocusZone is asked for
        none. That is the point: the preview gets an animated marker without editing a
        component Prompt Mode shares, so the prompter path stays provably untouched.
        Eight lines of duplication is the right trade for that guarantee.
      */}
      <FocusZone
        readingMarker={false}
        // The preview's OWN line pitch. It comes from the same scale as everything else, so the
        // gradient clears the same number of lines below the anchor that Prompt Mode will —
        // which is the one thing the clear band is measured in pitches to guarantee.
        lineHeightPx={lineHeightPx}
      />

      <AnimatePresence>
        {readingMarker && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-4 z-20 text-fg-muted sm:left-8"
            style={{ top: `${FOCUS_ANCHOR * 100}%`, fontSize: "1.5rem" }}
            initial={{ opacity: 0, x: -4, y: "-50%" }}
            animate={{ opacity: 1, x: 0, y: "-50%" }}
            exit={{ opacity: 0, x: -4, y: "-50%" }}
            transition={change}
          >
            ›
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        A scrim under the caption, and preview-only on purpose.
        FocusZone's gradient does not reach the background colour until 100%, so a line sitting at
        95% is still half-visible — which is right for Prompt Mode, where the panel edge IS the
        screen edge and there is nothing drawn over it. Here the caption sits at `bottom-3`, and at
        Distance the sample is tall enough to run straight through it: the label and the last line
        of script overlapped and both became unreadable.
        The fix cannot go into FocusZone, which Prompt Mode shares. It does not cost fidelity
        either, because the strip it covers is occupied by chrome the real screen does not have.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-bg via-bg to-transparent"
      />

      <span className="type-label absolute bottom-3 left-1/2 z-20 -translate-x-1/2 text-fg-muted">
        {presetLabel} — Preview
      </span>
    </div>
  );
}
