import { type ReactNode, type RefObject } from 'react'
import { type ScriptDoc, PAUSE_GLYPH } from '../../model/document'
import type { PresetStyle } from '../../model/presets'
import { normalizeWord } from '../../smartfollow/tokenizeScript'
import { cn } from '../ui/cn'
import { toRenderBlocks } from './promptBlocks'

interface PromptTextProps {
  doc: ScriptDoc
  preset: PresetStyle
  mirror: boolean
  contentRef: RefObject<HTMLDivElement>
  /**
   * When true, wrap each word in a `<span data-w={index}>` whose index matches
   * tokenizeScript's global word index — so Smart Follow can target the matched word's
   * exact visual line (works inside multi-sentence paragraphs). Off for Phase 1.
   */
  wordIndices?: boolean
}

/**
 * The vertical margin on a line, either side. Shared with {@link gapHeightEm} below, which sizes
 * the gap box so that `margin + box + margin` comes to exactly one line pitch.
 */
const BLOCK_MARGIN_EM = 0.45

/**
 * How tall a gap box has to be for the whole gap to measure one line pitch.
 *
 * A gap between two lines is dead space the presenter must read across, and there is very little
 * room for it: the Focus Zone holds the current line at 40% of the viewport and its gradient has
 * faded the text to near the background by 82%, leaving ~2.4 line pitches of legible runway. That
 * number is the same on every screen, because resolvePreset scales the text by whichever viewport
 * axis is tighter. Measured against the real app, a paragraph marker with a blank line beside it
 * cost 2.23 pitches and put the next line 3.23 down — past the fade, at the bottom edge.
 *
 * One pitch is also what `nudgeLines` assumes: it moves by whole multiples of lineHeightPx, so a
 * gap at any other size makes a nudge across a marker land off-line.
 */
const gapHeightEm = (lineHeight: number) => Math.max(lineHeight - 2 * BLOCK_MARGIN_EM, 0)

/** Split a run's text into word spans (indexed) + whitespace, aligned to tokenizeScript. */
function renderWords(text: string, counter: { i: number }): ReactNode[] {
  return text.split(/(\s+)/).map((part, k) => {
    if (part === '') return null
    if (/^\s+$/.test(part)) return part
    if (normalizeWord(part).length > 0) {
      return (
        <span key={k} data-w={counter.i++}>
          {part}
        </span>
      )
    }
    return part // punctuation-only token — no index (tokenizeScript drops it too)
  })
}

/**
 * The scrolling text. This is the element the engine transforms each frame, so it is
 * kept free of per-frame React state. Top/bottom padding lets the first line start at
 * the Focus Zone and the last line reach it.
 */
export function PromptText({ doc, preset, mirror, contentRef, wordIndices }: PromptTextProps) {
  const counter = { i: 0 }
  // Markers, pauses and blank lines are collapsed into one-pitch gaps before anything is drawn.
  // Numbering comes with them, so this component no longer counts sections itself.
  const items = toRenderBlocks(doc)
  const gapStyle = { height: `${gapHeightEm(preset.lineHeight)}em`, margin: 0 }
  return (
    <div
      ref={contentRef}
      data-prompter-text
      className={cn('will-change-transform', mirror && '-scale-x-100')}
      style={{
        paddingTop: '40vh',
        paddingBottom: '60vh',
        fontSize: `${preset.fontSize}px`,
        lineHeight: preset.lineHeight,
      }}
    >
      <div data-prompter-column className="mx-auto px-6" style={{ maxWidth: `${preset.columnWidth}px` }}>
        {items.map((item, i) => {
          if (item.kind === 'gap') {
            // A gap is deliberately not a [data-prompter-line] — it holds no words, so tap-to-jump
            // and wordIndexAtAnchor must fall through it. `data-block` still names what the gap
            // carries, because the editor, the CSS and the verify drivers all key off that.
            // The glyph keeps its authored size and simply OVERFLOWS the one-pitch box, which is
            // shorter than a line. Shrinking it to fit made the dots almost invisible at Distance.
            // The overflow is symmetric and smaller than the 0.45em margin on the lines either
            // side, so it cannot reach into the text — `verify-line-gap` asserts exactly that.
            // Beside a section's numeral it does step down, to sit at that annotation's scale.
            const glyph = item.pause ? (
              <span data-pause className={cn('leading-none', item.section != null && 'text-[0.5em]')}>
                {PAUSE_GLYPH}
              </span>
            ) : null
            if (item.section == null) {
              return (
                <div
                  key={i}
                  data-block={item.pause ? 'pause' : undefined}
                  style={gapStyle}
                  className="flex items-center justify-center"
                >
                  {glyph}
                </div>
              )
            }
            // A paragraph marker: a hairline rule with the number of the section it OPENS. When a
            // pause shares the gap its glyph rides alongside the number rather than being dropped —
            // a pause is a reading instruction and a marker is a bookmark, not the same signal.
            return (
              <div
                key={i}
                data-block="section"
                style={gapStyle}
                className="flex items-center gap-[0.6em]"
              >
                <span className="h-px flex-1 bg-border" />
                {/*
                  Mirror flips the whole content div, which would render the numeral backwards.
                  Flipping it again cancels that out; the rules either side are symmetric and
                  need nothing.
                */}
                <span
                  className={cn(
                    'flex items-center gap-[0.5em] text-fg-muted',
                    mirror && '-scale-x-100',
                  )}
                >
                  {glyph}
                  <span className="text-[0.4em] leading-none font-semibold tabular-nums">
                    {item.section}
                  </span>
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
            )
          }
          const block = item.block
          return (
            <p
              key={i}
              data-prompter-line
              className="font-medium"
              style={{ marginTop: `${BLOCK_MARGIN_EM}em`, marginBottom: `${BLOCK_MARGIN_EM}em` }}
            >
              {block.runs.map((run, j) => {
                const content = wordIndices ? renderWords(run.text, counter) : run.text
                return run.bold ? <strong key={j}>{content}</strong> : <span key={j}>{content}</span>
              })}
            </p>
          )
        })}
      </div>
    </div>
  )
}
