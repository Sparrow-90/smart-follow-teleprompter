import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toggle } from './Toggle'

const noop = () => {}

/**
 * The knob moved from a CSS `peer-checked:` selector to a Framer-driven transform. The
 * real checkbox underneath is what carries keyboard support and accessibility, so these
 * tests pin that contract — it must be untouched by the animation work.
 */
describe('Toggle', () => {
  it('exposes a switch named by its label', () => {
    render(<Toggle label="Mirror" checked={false} onChange={noop} />)
    expect(screen.getByRole('switch', { name: 'Mirror' })).toBeInTheDocument()
  })

  it('reflects the checked prop', () => {
    const { unmount } = render(<Toggle label="Mirror" checked={false} onChange={noop} />)
    expect(screen.getByRole('switch')).not.toBeChecked()
    unmount()

    render(<Toggle label="Mirror" checked onChange={noop} />)
    expect(screen.getByRole('switch')).toBeChecked()
  })

  it('fires onChange with the negated value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Toggle label="Mirror" checked={false} onChange={onChange} />)

    await user.click(screen.getByRole('switch'))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('is toggled by clicking the label text, not just the switch', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Toggle label="Mirror" checked onChange={onChange} />)

    await user.click(screen.getByText('Mirror'))

    expect(onChange).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('does not fire while disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Toggle label="Mirror" checked={false} onChange={onChange} disabled />)

    await user.click(screen.getByRole('switch'))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows the optional hint alongside the label', () => {
    render(<Toggle label="Mirror" checked={false} onChange={noop} hint="Coming soon" />)
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })
})
