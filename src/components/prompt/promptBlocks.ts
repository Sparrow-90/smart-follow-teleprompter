import type { Block, ScriptDoc } from '../../model/document'

/**
 * Prompt Mode's view of the document: what actually gets drawn, and how much room it may take.
 *
 * The rule this exists to enforce:
 *
 *   > A non-reading block — a paragraph marker, a pause, or a blank line — occupies exactly one
 *   > line pitch, and a consecutive run of them collapses to one.
 *
 * Why one pitch: the Focus Zone holds the line being read at 40% of the viewport and its gradient
 * has faded the text to near the background colour by 82%, so there are only ~2.4 line pitches of
 * legible runway below the anchor. That figure is the same on every screen, because `resolvePreset`
 * scales text by whichever viewport axis is tighter. Measured against the real app, a marker with a
 * blank line beside it cost 2.23 pitches and put the next line 3.23 down — past the fade and off
 * the bottom edge. The presenter finished a line with nothing readable to move to.
 *
 * It is a VIEW transform on purpose. The document model stays the single source of truth and the
 * Editor keeps showing the presenter's blank lines exactly as typed; only the teleprompter, where
 * dead space is expensive, collapses them. Nothing downstream shifts: word indices come from
 * `tokenizeScript` over the *document*, which already skips sections, pauses and word-free text
 * blocks, and `paragraphJumps` reads the document too. And because both blocks survive in the doc,
 * this does not foreclose PRD Phase 3's pause behaviour.
 */

export type RenderBlock =
  | { kind: 'text'; block: Extract<Block, { type: 'text' }> }
  /**
   * One collapsed run of non-reading blocks. `section` is the number of the section the run OPENS
   * (null if it held no marker) and `pause` says whether it held a pause — a run can carry both,
   * and must, because a pause is a reading instruction and a marker is a bookmark.
   */
  | { kind: 'gap'; section: number | null; pause: boolean }

/** A text block with nothing to read in it — the blank line the presenter typed. */
function isBlank(block: Block): boolean {
  return block.type === 'text' && !block.runs.some((r) => r.text.trim().length > 0)
}

export function toRenderBlocks(doc: ScriptDoc): RenderBlock[] {
  const items: RenderBlock[] = []
  // Section numbering starts at 1 because the top of the script IS section 1, so the first marker
  // opens section 2. The editor reaches the same numbers through a CSS counter (`counter-reset:
  // section 1` in index.css) — change one and you must change the other, or the same document is
  // numbered differently in the two places the presenter sees it.
  let section = 1
  let i = 0

  while (i < doc.blocks.length) {
    const block = doc.blocks[i]
    if (block.type === 'text' && !isBlank(block)) {
      items.push({ kind: 'text', block })
      i++
      continue
    }
    // A maximal run of markers, pauses and blank lines — however many, it draws as one.
    let sectionNumber: number | null = null
    let pause = false
    while (i < doc.blocks.length) {
      const b = doc.blocks[i]
      if (b.type === 'section') {
        // Every marker still advances the count even though only one rule is drawn: two adjacent
        // markers open sections 2 and 3, and the rule must say 3 or everything after reads behind.
        sectionNumber = ++section
      } else if (b.type === 'pause') {
        pause = true
      } else if (!isBlank(b)) {
        break
      }
      i++
    }
    items.push({ kind: 'gap', section: sectionNumber, pause })
  }

  return items
}
