import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorToolbar } from './EditorToolbar'
import { PAUSE_GLYPH, SECTION_GLYPH } from '../../model/document'

const noop = () => {}

function setup(overrides: Partial<Parameters<typeof EditorToolbar>[0]> = {}) {
  const props = {
    boldActive: false,
    onNew: noop,
    onBold: noop,
    onPause: noop,
    onSection: noop,
    ...overrides,
  }
  render(<EditorToolbar {...props} />)
  return props
}

describe('EditorToolbar', () => {
  it('renders exactly four controls', () => {
    setup()
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('no longer shows a word count', () => {
    setup()
    expect(screen.queryByText(/words?/i)).toBeNull()
  })

  it('labels the pause button and shows the glyph it inserts', () => {
    setup()
    const pause = screen.getByRole('button', { name: 'Insert pause' })
    expect(pause).toHaveTextContent(PAUSE_GLYPH)
  })

  it('labels the paragraph marker button and shows the pilcrow', () => {
    setup()
    const section = screen.getByRole('button', { name: 'Insert paragraph marker' })
    expect(section).toHaveTextContent(SECTION_GLYPH)
  })

  it('keeps the paragraph marker distinct from the pause button', () => {
    // Two adjacent glyph-only buttons in one group: if they ever collapse to the same label or
    // the same glyph, the presenter has no way to tell which one they are pressing.
    setup()
    const pause = screen.getByRole('button', { name: 'Insert pause' })
    const section = screen.getByRole('button', { name: 'Insert paragraph marker' })
    expect(pause.textContent).not.toBe(section.textContent)
  })

  it('reflects boldActive on the Bold button', () => {
    const { unmount } = render(
      <EditorToolbar boldActive={false} onNew={noop} onBold={noop} onPause={noop} onSection={noop} />,
    )
    expect(screen.getByRole('button', { name: 'Bold selection' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    unmount()

    render(<EditorToolbar boldActive onNew={noop} onBold={noop} onPause={noop} onSection={noop} />)
    expect(screen.getByRole('button', { name: 'Bold selection' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('fires each handler', async () => {
    const user = userEvent.setup()
    const onNew = vi.fn()
    const onBold = vi.fn()
    const onPause = vi.fn()
    setup({ onNew, onBold, onPause })

    await user.click(screen.getByRole('button', { name: 'New' }))
    await user.click(screen.getByRole('button', { name: 'Bold selection' }))
    await user.click(screen.getByRole('button', { name: 'Insert pause' }))

    expect(onNew).toHaveBeenCalledOnce()
    expect(onBold).toHaveBeenCalledOnce()
    expect(onPause).toHaveBeenCalledOnce()
  })
})
