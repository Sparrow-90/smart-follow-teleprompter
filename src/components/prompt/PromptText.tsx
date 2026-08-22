import { type RefObject } from 'react'
import { type ScriptDoc, PAUSE_GLYPH } from '../../model/document'
import type { PresetStyle } from '../../model/presets'
import { cn } from '../ui/cn'

interface PromptTextProps {
  doc: ScriptDoc
  preset: PresetStyle
  mirror: boolean
  contentRef: RefObject<HTMLDivElement>
}

/**
 * The scrolling text. This is the element the engine transforms each frame, so it is
 * kept free of per-frame React state. Top/bottom padding lets the first line start at
 * the Focus Zone and the last line reach it.
 */
export function PromptText({ doc, preset, mirror, contentRef }: PromptTextProps) {
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
      <div className="mx-auto px-6" style={{ maxWidth: `${preset.columnWidth}px` }}>
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
                block.runs.map((run, j) =>
                  run.bold ? <strong key={j}>{run.text}</strong> : <span key={j}>{run.text}</span>,
                )
              )}
            </p>
          )
        })}
      </div>
    </div>
  )
}
