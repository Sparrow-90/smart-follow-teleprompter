import { describe, it, expect } from 'vitest'
import { SmoothFollowEngine } from './SmoothFollowEngine'

const FRAME = 1 / 60

/** Advance the engine by `seconds` worth of 60fps frames. */
function run(engine: SmoothFollowEngine, seconds: number) {
  const frames = Math.round(seconds / FRAME)
  for (let i = 0; i < frames; i++) engine.tick(FRAME)
}

describe('SmoothFollowEngine — rest state', () => {
  it('starts at rest', () => {
    const e = new SmoothFollowEngine({ baseSpeed: 60 })
    expect(e.position).toBe(0)
    expect(e.velocity).toBe(0)
    expect(e.playing).toBe(false)
  })

  it('does not move while paused', () => {
    const e = new SmoothFollowEngine({ baseSpeed: 60 })
    run(e, 1)
    expect(e.position).toBe(0)
  })
})

describe('SmoothFollowEngine — eased play/pause (no hard jumps)', () => {
  it('eases in: velocity rises gradually, never jumping to target on the first frame', () => {
    const e = new SmoothFollowEngine({ baseSpeed: 60, tau: 0.35 })
    e.play()
    e.tick(FRAME)
    expect(e.velocity).toBeGreaterThan(0)
    expect(e.velocity).toBeLessThan(60) // not an instant jump to full speed
    expect(e.position).toBeGreaterThan(0)
  })

  it('reaches (approximately) the target velocity at steady state', () => {
    const e = new SmoothFollowEngine({ baseSpeed: 60, tau: 0.35 })
    e.play()
    run(e, 3)
    expect(e.velocity).toBeGreaterThan(60 * 0.98)
    expect(e.velocity).toBeLessThanOrEqual(60 + 1e-6)
  })

  it('eases out on pause: velocity decays toward zero and motion stops', () => {
    const e = new SmoothFollowEngine({ baseSpeed: 60, tau: 0.35 })
    e.play()
    run(e, 3)
    const vAtPause = e.velocity
    e.pause()
    e.tick(FRAME)
    expect(e.velocity).toBeLessThan(vAtPause)
    expect(e.velocity).toBeGreaterThan(0) // still coasting, not a hard stop
    run(e, 3)
    expect(e.velocity).toBeLessThan(0.5) // effectively stopped
  })
})

describe('SmoothFollowEngine — speed control', () => {
  it('scales target velocity by the speed multiplier', () => {
    const e = new SmoothFollowEngine({ baseSpeed: 60, tau: 0.35 })
    e.setSpeedMultiplier(2)
    e.play()
    run(e, 3)
    expect(e.velocity).toBeGreaterThan(120 * 0.98)
    expect(e.velocity).toBeLessThanOrEqual(120 + 1e-6)
  })
})

describe('SmoothFollowEngine — clamping', () => {
  it('never scrolls past the end and stops there', () => {
    const e = new SmoothFollowEngine({ baseSpeed: 1000, tau: 0.1 })
    e.setContentMetrics(1000, 400) // maxPosition = 600
    e.play()
    run(e, 5)
    expect(e.position).toBe(600)
    expect(e.velocity).toBe(0)
    expect(e.isAtEnd()).toBe(true)
  })

  it('never scrolls above the start', () => {
    const e = new SmoothFollowEngine({ baseSpeed: 60 })
    e.setContentMetrics(1000, 400)
    e.setPosition(50)
    e.scrubBy(-200)
    expect(e.position).toBe(0)
  })
})

describe('SmoothFollowEngine — manual scrub always wins', () => {
  it('scrubBy moves the position directly, clamped to content', () => {
    const e = new SmoothFollowEngine({ baseSpeed: 60 })
    e.setContentMetrics(2000, 400)
    e.scrubBy(300)
    expect(e.position).toBe(300)
  })

  it('does not auto-advance while scrubbing, even when playing', () => {
    const e = new SmoothFollowEngine({ baseSpeed: 60 })
    e.setContentMetrics(2000, 400)
    e.play()
    run(e, 2) // build up some velocity + position
    const posBefore = e.position
    e.setScrubbing(true)
    run(e, 1)
    expect(e.position).toBe(posBefore) // frozen while the user drives
    e.setScrubbing(false)
    run(e, 1)
    expect(e.position).toBeGreaterThan(posBefore) // resumes afterward
  })
})

describe('SmoothFollowEngine — glideTo (Restart / tap-to-jump)', () => {
  it('eases toward a forward target without overshooting, then arrives', () => {
    const e = new SmoothFollowEngine({ tau: 0.3 })
    e.setContentMetrics(2000, 400)
    let prev = e.position
    for (let i = 0; i < 5; i++) e.tick(FRAME) // idle: no movement before glide
    expect(e.position).toBe(0)
    e.glideTo(300)
    for (let i = 0; i < 300; i++) {
      e.tick(FRAME)
      expect(e.position).toBeLessThanOrEqual(300 + 1e-6)
      expect(e.position).toBeGreaterThanOrEqual(prev - 1e-6)
      prev = e.position
    }
    expect(e.position).toBe(300)
  })

  it('glides back to the top from a scrolled position', () => {
    const e = new SmoothFollowEngine({ tau: 0.3 })
    e.setContentMetrics(2000, 400)
    e.setPosition(500)
    e.glideTo(0)
    run(e, 4)
    expect(e.position).toBe(0)
  })

  it('clamps the glide target to the content range', () => {
    const e = new SmoothFollowEngine({ tau: 0.2 })
    e.setContentMetrics(1000, 400) // max 600
    e.glideTo(9999)
    run(e, 4)
    expect(e.position).toBe(600)
  })

  it('is cancelled by a manual scrub (manual wins)', () => {
    const e = new SmoothFollowEngine({ tau: 0.3 })
    e.setContentMetrics(2000, 400)
    e.glideTo(300)
    run(e, 0.3) // partway
    const partway = e.position
    expect(partway).toBeGreaterThan(0)
    expect(partway).toBeLessThan(300)
    e.scrubBy(20) // user grabs the text
    const afterScrub = e.position
    run(e, 2)
    expect(e.position).toBe(afterScrub) // did not continue gliding to 300
  })
})

describe('SmoothFollowEngine — velocity-limited follow (gentle line-by-line)', () => {
  it('eases to the target and settles (no snap on the first frame)', () => {
    const e = new SmoothFollowEngine({ maxFollowSpeed: 320, followSmoothTime: 0.4 })
    e.setContentMetrics(4000, 400)
    e.setMode('follow')
    e.setTargetPosition(60) // one line
    e.tick(FRAME)
    expect(e.position).toBeGreaterThan(0)
    expect(e.position).toBeLessThan(30) // not an instant jump to 60
    run(e, 2)
    expect(Math.abs(e.position - 60)).toBeLessThan(1)
  })

  it('never exceeds the max follow speed, even for a large jump', () => {
    const e = new SmoothFollowEngine({ maxFollowSpeed: 320, followSmoothTime: 0.4 })
    e.setContentMetrics(4000, 400)
    e.setMode('follow')
    e.setTargetPosition(2000) // far away
    let maxSeen = 0
    for (let i = 0; i < 600; i++) {
      const before = e.position
      e.tick(FRAME)
      maxSeen = Math.max(maxSeen, Math.abs(e.position - before) / FRAME)
    }
    expect(maxSeen).toBeLessThanOrEqual(320 * 1.06)
  })

  it('does not overshoot the target', () => {
    const e = new SmoothFollowEngine({ maxFollowSpeed: 320, followSmoothTime: 0.4 })
    e.setContentMetrics(4000, 400)
    e.setMode('follow')
    e.setTargetPosition(200)
    for (let i = 0; i < 600; i++) {
      e.tick(FRAME)
      expect(e.position).toBeLessThanOrEqual(200 + 1e-6)
    }
  })

  it('a one-line step reads as calm — settles in roughly 0.4–1.6s', () => {
    const e = new SmoothFollowEngine({ maxFollowSpeed: 320, followSmoothTime: 0.4 })
    e.setContentMetrics(4000, 400)
    e.setMode('follow')
    e.setTargetPosition(60)
    let t = 0
    while (Math.abs(e.position - 60) > 0.5 && t < 3) {
      e.tick(FRAME)
      t += FRAME
    }
    expect(t).toBeGreaterThan(0.35)
    expect(t).toBeLessThan(1.6)
  })
})

describe('SmoothFollowEngine — follow mode (Phase 2 seam)', () => {
  it('eases the position toward a target without overshooting', () => {
    const e = new SmoothFollowEngine({ tau: 0.3 })
    e.setContentMetrics(2000, 400)
    e.setMode('follow')
    e.setTargetPosition(300)
    let prev = e.position
    for (let i = 0; i < 300; i++) {
      e.tick(FRAME)
      expect(e.position).toBeLessThanOrEqual(300 + 1e-6) // no overshoot
      expect(e.position).toBeGreaterThanOrEqual(prev - 1e-6) // monotonic toward target
      prev = e.position
    }
    expect(e.position).toBeGreaterThan(300 * 0.98)
  })
})

describe('SmoothFollowEngine — manual override in follow mode (PRD §37)', () => {
  /** An engine mid-Smart-Follow: following a target 2000px down a long script. */
  const following = () => {
    const e = new SmoothFollowEngine()
    e.setContentMetrics(5000, 800)
    e.setMode('follow')
    e.setPosition(2000)
    e.setTargetPosition(2000)
    return e
  }

  it('holds the position the finger put it at, instead of gliding back to the target', () => {
    const e = following()
    e.setScrubbing(true)
    e.scrubBy(-300) // the presenter pulls the script back to a fumbled line
    const chosen = e.position
    expect(chosen).toBe(1700)
    run(e, 1) // a full second of animation frames while the finger is still down
    expect(e.position).toBe(chosen)
  })

  it('adopts the chosen position as the new target when the finger lifts', () => {
    const e = following()
    e.setScrubbing(true)
    e.scrubBy(-300)
    e.setScrubbing(false)
    const chosen = e.position
    run(e, 1)
    expect(e.position).toBe(chosen)
    expect(e.velocity).toBe(0)
  })

  it('reports whether a scrub is in progress', () => {
    const e = following()
    expect(e.scrubbing).toBe(false)
    e.setScrubbing(true)
    expect(e.scrubbing).toBe(true)
    e.setScrubbing(false)
    expect(e.scrubbing).toBe(false)
  })

  it('still follows a new target once the scrub has ended', () => {
    const e = following()
    e.setScrubbing(true)
    e.scrubBy(-300)
    e.setScrubbing(false)
    e.setTargetPosition(e.position + 200) // he starts reading again
    run(e, 3)
    expect(e.position).toBeCloseTo(1900, 0)
  })

  it('leaves auto mode behaviour untouched', () => {
    const e = new SmoothFollowEngine({ baseSpeed: 60 })
    e.setContentMetrics(5000, 800)
    e.play()
    run(e, 1)
    const moved = e.position
    expect(moved).toBeGreaterThan(0)
    e.setScrubbing(true)
    run(e, 1)
    expect(e.position).toBe(moved) // auto mode already froze during a scrub
  })

  it('cancels an in-flight glide when the finger touches down (manual always wins)', () => {
    const e = following()
    e.glideTo(0) // initiate a glide from position 2000 toward 0
    e.tick(FRAME) // let it start moving
    const posAfterGlideStart = e.position
    expect(posAfterGlideStart).toBeLessThan(2000) // glide is in progress
    e.setScrubbing(true) // user touches the screen during the glide
    run(e, 0.5) // a half-second of animation frames
    // The glide should have been cancelled, so position should not move
    expect(e.position).toBe(posAfterGlideStart)
  })
})
