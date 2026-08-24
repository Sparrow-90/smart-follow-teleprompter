import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SegmentedControl } from './SegmentedControl'

type Size = 'small' | 'medium' | 'large'

const OPTIONS = [
  { value: 'small' as Size, label: 'Small' },
  { value: 'medium' as Size, label: 'Medium' },
  { value: 'large' as Size, label: 'Large' },
]

function setup(value: Size = 'medium', onChange = vi.fn()) {
  render(
    <SegmentedControl<Size>
      ariaLabel="Size"
      value={value}
      options={OPTIONS}
      onChange={onChange}
    />,
  )
  return onChange
}

/**
 * The internals of this control were rewritten to animate the selected pill. These tests
 * pin the behaviour that must survive that rewrite — the accessibility contract and the
 * change callback — independently of how the selection is drawn.
 */
describe('SegmentedControl', () => {
  it('is a labelled radiogroup', () => {
    setup()
    expect(screen.getByRole('radiogroup', { name: 'Size' })).toBeInTheDocument()
  })

  it('renders one radio per option, labelled by its text', () => {
    setup()
    expect(screen.getAllByRole('radio')).toHaveLength(OPTIONS.length)
    for (const opt of OPTIONS) {
      expect(screen.getByRole('radio', { name: opt.label })).toBeInTheDocument()
    }
  })

  it('marks only the selected option as checked', () => {
    setup('large')
    expect(screen.getByRole('radio', { name: 'Large' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Small' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'false')
  })

  it('fires onChange with the clicked value', async () => {
    const user = userEvent.setup()
    const onChange = setup('medium')

    await user.click(screen.getByRole('radio', { name: 'Small' }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith('small')
  })

  it('still fires when the already-selected option is clicked', async () => {
    const user = userEvent.setup()
    const onChange = setup('medium')

    await user.click(screen.getByRole('radio', { name: 'Medium' }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith('medium')
  })
})
