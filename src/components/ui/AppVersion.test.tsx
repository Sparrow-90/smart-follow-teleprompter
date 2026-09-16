import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppVersion } from './AppVersion'
import { APP_COMMIT, APP_VERSION, BUILD_DATE } from '../../buildInfo'

/**
 * Every value here is asserted against the IMPORTED constant, never a literal. They come from
 * `define` in vite.config.ts and the commit is whatever git answers in whichever environment the
 * suite runs in — a hardcoded SHA would pass on one machine and fail on the next.
 *
 * That the imports resolve at all is itself the first assertion: if `define` ever stopped applying
 * to the vitest config, `__APP_VERSION__` would be an undefined global and this file would throw
 * on import rather than fail a matcher.
 */
describe('AppVersion', () => {
  it('shows the version, and nothing else, at rest', () => {
    render(<AppVersion />)
    expect(screen.getByRole('button')).toHaveTextContent(`v${APP_VERSION}`)
    expect(screen.getByRole('button')).not.toHaveTextContent(APP_COMMIT)
  })

  it('names itself for screen readers while collapsed', () => {
    render(<AppVersion />)
    const button = screen.getByRole('button', { name: `Version ${APP_VERSION}, tap for build details` })
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  /*
   * An `aria-label` overrides the button's content, so keeping the collapsed one while open would
   * announce the same name again and never the commit or date — the only thing the control exists
   * to give. Open, the rendered text IS the name.
   */
  it('announces the build once revealed, rather than repeating its own name', async () => {
    const user = userEvent.setup()
    render(<AppVersion />)

    await user.click(screen.getByRole('button'))

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAccessibleName(expect.stringContaining(APP_COMMIT))
  })

  it('reveals the commit and the build date on a tap', async () => {
    const user = userEvent.setup()
    render(<AppVersion />)

    await user.click(screen.getByRole('button'))

    const button = screen.getByRole('button')
    expect(button).toHaveTextContent(APP_COMMIT)
    expect(button).toHaveTextContent(BUILD_DATE)
  })

  it('hides them again on a second tap', async () => {
    const user = userEvent.setup()
    render(<AppVersion />)

    await user.click(screen.getByRole('button'))
    await user.click(screen.getByRole('button'))

    expect(screen.getByRole('button')).not.toHaveTextContent(APP_COMMIT)
  })
})
