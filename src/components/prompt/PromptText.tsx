import { type ReactNode, type RefObject } from 'react'
import { type ScriptDoc, PAUSE_GLYPH } from '../../model/document'
import type { PresetStyle } from '../../model/presets'
import { normalizeWord } from '../../smartfollow/tokenizeScript'
import { cn } from '../ui/cn'

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
        {doc.blocks.map((block, i) => {
          if (block.type === 'pause') {
            return (
              <div key={i} data-block="pause" className="my-[0.7em]">
                <span data-pause>{PAUSE_GLYPH}</span>
              </div>
            )
          }
          return (
            <p key={i} data-prompter-line className="my-[0.45em] font-medium">
              {block.runs.length === 0 ? (
                <br />
              ) : (
                block.runs.map((run, j) => {
                  const content = wordIndices ? renderWords(run.text, counter) : run.text
                  return run.bold ? <strong key={j}>{content}</strong> : <span key={j}>{content}</span>
                })
              )}
            </p>
          )
        })}
      </div>
    </div>
  )
}
