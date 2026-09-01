import { describe, it, expect } from 'vitest'
import {
  type ScriptDoc,
  PAUSE_GLYPH,
  SECTION_GLYPH,
  emptyDoc,
  isEmptyDoc,
  wordCount,
  docToPlainText,
  plainTextToDoc,
  serializeElement,
  docToHtml,
} from './document'

/** Build a detached element with the given innerHTML (simulates the contentEditable root). */
function root(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

describe('emptyDoc / isEmptyDoc', () => {
  it('emptyDoc has no blocks and is empty', () => {
    const doc = emptyDoc()
    expect(doc.blocks).toEqual([])
    expect(isEmptyDoc(doc)).toBe(true)
  })

  it('a doc with only blank text blocks is still empty', () => {
    const doc: ScriptDoc = { blocks: [{ type: 'text', runs: [] }] }
    expect(isEmptyDoc(doc)).toBe(true)
  })

  it('a doc with real text is not empty', () => {
    const doc: ScriptDoc = { blocks: [{ type: 'text', runs: [{ text: 'hi' }] }] }
    expect(isEmptyDoc(doc)).toBe(false)
  })

  it('a doc with only a pause is not empty', () => {
    const doc: ScriptDoc = { blocks: [{ type: 'pause' }] }
    expect(isEmptyDoc(doc)).toBe(false)
  })

  it('a doc with only a paragraph marker is not empty', () => {
    const doc: ScriptDoc = { blocks: [{ type: 'section' }] }
    expect(isEmptyDoc(doc)).toBe(false)
  })
})

describe('wordCount', () => {
  it('counts words across runs and blocks, ignoring bold and pauses', () => {
    const doc: ScriptDoc = {
      blocks: [
        { type: 'text', runs: [{ text: 'This is ' }, { text: 'really', bold: true }, { text: ' important' }] },
        { type: 'pause' },
        { type: 'text', runs: [{ text: 'Ok now' }] },
      ],
    }
    expect(wordCount(doc)).toBe(6) // This, is, really, important, Ok, now
  })

  it('collapses extra whitespace', () => {
    const doc: ScriptDoc = { blocks: [{ type: 'text', runs: [{ text: '  hello   world  ' }] }] }
    expect(wordCount(doc)).toBe(2)
  })

  it('empty doc has zero words', () => {
    expect(wordCount(emptyDoc())).toBe(0)
  })
})

describe('plainTextToDoc / docToPlainText round-trip', () => {
  it('splits lines into text blocks', () => {
    const doc = plainTextToDoc('line one\nline two')
    expect(doc.blocks).toEqual([
      { type: 'text', runs: [{ text: 'line one' }] },
      { type: 'text', runs: [{ text: 'line two' }] },
    ])
  })

  it('preserves blank lines as empty text blocks', () => {
    const doc = plainTextToDoc('a\n\nb')
    expect(doc.blocks).toEqual([
      { type: 'text', runs: [{ text: 'a' }] },
      { type: 'text', runs: [] },
      { type: 'text', runs: [{ text: 'b' }] },
    ])
  })

  it('docToPlainText reverses plainTextToDoc', () => {
    const text = 'Something I want to tell,\nbut what is the starting point'
    expect(docToPlainText(plainTextToDoc(text))).toBe(text)
  })

  it('empty string yields an empty doc', () => {
    expect(isEmptyDoc(plainTextToDoc(''))).toBe(true)
  })
})

describe('serializeElement (DOM → model, sanitizing)', () => {
  it('reads a single line of plain text', () => {
    const doc = serializeElement(root('<div>Hello world</div>'))
    expect(doc.blocks).toEqual([{ type: 'text', runs: [{ text: 'Hello world' }] }])
  })

  it('reads bold from <strong> and <b>', () => {
    const doc = serializeElement(root('<div>This is <strong>really</strong> <b>very</b> important</div>'))
    expect(doc.blocks).toEqual([
      {
        type: 'text',
        runs: [
          { text: 'This is ' },
          { text: 'really', bold: true },
          { text: ' ' },
          { text: 'very', bold: true },
          { text: ' important' },
        ],
      },
    ])
  })

  it('reads bold from inline font-weight styles', () => {
    const doc = serializeElement(root('<div>a <span style="font-weight: 700">b</span> c</div>'))
    expect(doc.blocks).toEqual([
      { type: 'text', runs: [{ text: 'a ' }, { text: 'b', bold: true }, { text: ' c' }] },
    ])
  })

  it('treats each top-level block element as its own line', () => {
    const doc = serializeElement(root('<div>one</div><div>two</div>'))
    expect(doc.blocks).toEqual([
      { type: 'text', runs: [{ text: 'one' }] },
      { type: 'text', runs: [{ text: 'two' }] },
    ])
  })

  it('reads a pause marker as a pause block', () => {
    const doc = serializeElement(
      root('<div>before</div><div><span data-pause="true">' + PAUSE_GLYPH + '</span></div><div>after</div>'),
    )
    expect(doc.blocks).toEqual([
      { type: 'text', runs: [{ text: 'before' }] },
      { type: 'pause' },
      { type: 'text', runs: [{ text: 'after' }] },
    ])
  })

  it('strips disallowed tags, keeping only their text (no injection, no bold)', () => {
    const doc = serializeElement(
      root('<div>safe <a href="http://x">link</a> <em>italic</em> text</div>'),
    )
    expect(doc.blocks).toEqual([
      { type: 'text', runs: [{ text: 'safe link italic text' }] },
    ])
  })

  it('drops script/style content entirely', () => {
    const doc = serializeElement(root('<div>keep<script>evil()</script></div>'))
    expect(doc.blocks).toEqual([{ type: 'text', runs: [{ text: 'keep' }] }])
  })

  it('keeps text after a pause when execCommand nests it in a wrapper div', () => {
    // This is the real DOM shape produced by inserting a PAUSE mid-script: the pause
    // and the following line end up wrapped in an extra <div>.
    const doc = serializeElement(
      root(
        '<div>a b</div>' +
          '<div><div data-block="pause"><span data-pause="true">' +
          PAUSE_GLYPH +
          '</span></div><div>c d</div></div>',
      ),
    )
    expect(doc.blocks).toEqual([
      { type: 'text', runs: [{ text: 'a b' }] },
      { type: 'pause' },
      { type: 'text', runs: [{ text: 'c d' }] },
    ])
    expect(wordCount(doc)).toBe(4)
  })

  it('reads a paragraph marker as a section block', () => {
    const doc = serializeElement(
      root(
        '<div>before</div>' +
          '<div data-block="section"><span data-section="true">' + SECTION_GLYPH + '</span></div>' +
          '<div>after</div>',
      ),
    )
    expect(doc.blocks).toEqual([
      { type: 'text', runs: [{ text: 'before' }] },
      { type: 'section' },
      { type: 'text', runs: [{ text: 'after' }] },
    ])
  })

  it('keeps text after a paragraph marker when execCommand nests it in a wrapper div', () => {
    // The same DOM shape the pause test pins, for the same reason: inserting a marker
    // mid-script leaves it and the following line wrapped in an extra <div>.
    const doc = serializeElement(
      root(
        '<div>a b</div>' +
          '<div><div data-block="section"><span data-section="true">' +
          SECTION_GLYPH +
          '</span></div><div>c d</div></div>',
      ),
    )
    expect(doc.blocks).toEqual([
      { type: 'text', runs: [{ text: 'a b' }] },
      { type: 'section' },
      { type: 'text', runs: [{ text: 'c d' }] },
    ])
    // The marker itself is not script \u2014 it must never reach the word count.
    expect(wordCount(doc)).toBe(4)
  })

  it('round-trips a marker through model \u2192 HTML \u2192 model', () => {
    const doc: ScriptDoc = {
      blocks: [
        { type: 'text', runs: [{ text: 'one' }] },
        { type: 'section' },
        { type: 'pause' },
        { type: 'text', runs: [{ text: 'two' }] },
      ],
    }
    expect(serializeElement(root(docToHtml(doc)))).toEqual(doc)
  })

  it('handles an empty editor as an empty doc', () => {
    expect(isEmptyDoc(serializeElement(root('')))).toBe(true)
    expect(isEmptyDoc(serializeElement(root('<div><br></div>')))).toBe(true)
  })
})

describe('docToHtml (model → editor HTML)', () => {
  it('wraps each text block in a div and marks bold with <strong>', () => {
    const doc: ScriptDoc = {
      blocks: [{ type: 'text', runs: [{ text: 'This is ' }, { text: 'bold', bold: true }] }],
    }
    expect(docToHtml(doc)).toBe('<div>This is <strong>bold</strong></div>')
  })

  it('renders an empty text block as a div with a break', () => {
    expect(docToHtml({ blocks: [{ type: 'text', runs: [] }] })).toBe('<div><br></div>')
  })

  it('renders a pause block with a non-editable pause chip', () => {
    const html = docToHtml({ blocks: [{ type: 'pause' }] })
    expect(html).toContain('data-pause="true"')
    expect(html).toContain(PAUSE_GLYPH)
    expect(html).toContain('contenteditable="false"')
  })

  it('escapes HTML-special characters in text', () => {
    const doc: ScriptDoc = { blocks: [{ type: 'text', runs: [{ text: '5 < 6 & "ok"' }] }] }
    expect(docToHtml(doc)).toBe('<div>5 &lt; 6 &amp; "ok"</div>')
  })

  it('round-trips through serializeElement', () => {
    const doc: ScriptDoc = {
      blocks: [
        { type: 'text', runs: [{ text: 'Intro ' }, { text: 'word', bold: true }] },
        { type: 'pause' },
        { type: 'text', runs: [{ text: 'Outro' }] },
      ],
    }
    expect(serializeElement(root(docToHtml(doc)))).toEqual(doc)
  })
})
