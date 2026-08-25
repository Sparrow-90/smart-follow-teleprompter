/**
 * Smooth Follow Engine — owns the teleprompter's scroll position and produces smooth,
 * eased motion. It is deliberately framework-agnostic and imperative: React never drives
 * it per-frame. The hook (useSmoothFollow) runs the rAF loop and writes the transform.
 *
 * Phase 1 uses "auto" mode (constant-velocity scroll with eased play/pause + manual scrub).
 * "follow" mode + setTargetPosition are the forward-compatible seam for Smart Follow (Phase 2).
 */

export type EngineMode = 'auto' | 'follow'

export interface SmoothFollowOptions {
  /** Base auto-scroll velocity in px/sec at speed multiplier 1. */
  baseSpeed?: number
  /** Velocity smoothing time constant in seconds (larger = gentler ease). */
  tau?: number
  /** Max speed (px/sec) the follow motion may reach — caps big jumps so nothing snaps. */
  maxFollowSpeed?: number
  /** Approx settle time (sec) for the follow motion; larger = gentler/slower. */
  followSmoothTime?: number
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

export class SmoothFollowEngine {
  position = 0
  velocity = 0

  private playingFlag = false
  private baseSpeed: number
  private speedMultiplier = 1
  private tau: number
  private maxPosition = Infinity
  private scrubbingFlag = false
  private mode: EngineMode = 'auto'
  private targetPosition = 0
  private gliding = false
  private glideTarget = 0
  private maxFollowSpeed: number
  private followSmoothTime: number

  constructor(opts: SmoothFollowOptions = {}) {
    this.baseSpeed = opts.baseSpeed ?? 55
    this.tau = opts.tau ?? 0.35
    this.maxFollowSpeed = opts.maxFollowSpeed ?? 320
    this.followSmoothTime = opts.followSmoothTime ?? 0.4
  }

  get playing(): boolean {
    return this.playingFlag
  }
  play(): void {
    this.playingFlag = true
  }
  pause(): void {
    this.playingFlag = false
  }
  toggle(): void {
    this.playingFlag = !this.playingFlag
  }

  setBaseSpeed(px: number): void {
    this.baseSpeed = px
  }
  setSpeedMultiplier(m: number): void {
    this.speedMultiplier = m
  }
  getSpeedMultiplier(): number {
    return this.speedMultiplier
  }

  setContentMetrics(contentHeight: number, viewportHeight: number): void {
    this.maxPosition = Math.max(0, contentHeight - viewportHeight)
    this.position = clamp(this.position, 0, this.maxPosition)
  }
  get scrubbing(): boolean {
    return this.scrubbingFlag
  }

  /**
   * Begin/end a manual drag. Ending one in follow mode adopts the position the user chose as
   * the new target: without this the engine would glide straight back to its stale pre-drag
   * target the instant the finger lifts. It lives here rather than in a separate method the
   * caller must remember, because forgetting that call is exactly the bug this fixes.
   */
  setScrubbing(on: boolean): void {
    if (on) this.gliding = false // a finger cancels an in-flight glide, as scrubBy/setPosition do
    if (!on && this.scrubbingFlag && this.mode === 'follow') {
      this.targetPosition = this.position
      this.velocity = 0
    }
    this.scrubbingFlag = on
  }
  scrubBy(deltaPx: number): void {
    this.gliding = false // manual override always wins
    this.position = clamp(this.position + deltaPx, 0, this.maxPosition)
  }
  setPosition(px: number): void {
    this.gliding = false
    this.position = clamp(px, 0, this.maxPosition)
  }
  isAtEnd(): boolean {
    return this.maxPosition < Infinity && this.position >= this.maxPosition - 0.5
  }

  /**
   * True while a glide is still travelling. A glide is animated, so anything that must read the
   * DOM *after* the move has to wait for this to go false — nudging a line does, because Smart
   * Follow can only be told which word the presenter is on once the text has stopped moving.
   */
  isGliding(): boolean {
    return this.gliding
  }

  /**
   * Where the text is going to come to rest: the glide destination while one is running,
   * otherwise simply where it is now.
   *
   * Anything pinning the follow target has to use THIS, not `position`. `tick()` serves an
   * in-flight glide and returns before the follow branch, so a target pinned to the live position
   * mid-glide is ignored until the glide lands — and then fought, dragging the text back to where
   * it happened to be when the pin was taken.
   */
  get destination(): number {
    return this.gliding ? this.glideTarget : this.position
  }

  /**
   * Eased one-shot move to an absolute position (Restart / tap-to-jump / nudge). Manual scrub
   * cancels it. Returns the destination actually accepted — clamped to the script — so a caller
   * stacking moves (holding the nudge button) counts from where the text will really stop.
   */
  glideTo(targetPx: number): number {
    this.glideTarget = clamp(targetPx, 0, this.maxPosition)
    this.gliding = true
    return this.glideTarget
  }

  // Phase 2 forward-compat:
  setMode(mode: EngineMode): void {
    this.mode = mode
  }
  setTargetPosition(px: number): void {
    this.targetPosition = clamp(px, 0, this.maxPosition)
  }

  private currentTargetVelocity(): number {
    return this.playingFlag && !this.scrubbingFlag ? this.baseSpeed * this.speedMultiplier : 0
  }

  /**
   * Critically-damped move toward `target` with a max-speed cap (Unity-style SmoothDamp).
   * Eases in and out, never overshoots, and never exceeds maxFollowSpeed. Updates this.velocity.
   */
  private smoothDampFollow(current: number, target: number, dt: number): number {
    const smoothTime = Math.max(0.0001, this.followSmoothTime)
    const omega = 2 / smoothTime
    const x = omega * dt
    const expFactor = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)

    let change = current - target
    const originalTo = target
    const maxChange = this.maxFollowSpeed * smoothTime
    change = clamp(change, -maxChange, maxChange)
    const clampedTarget = current - change

    const temp = (this.velocity + omega * change) * dt
    this.velocity = (this.velocity - omega * temp) * expFactor
    let output = clampedTarget + (change + temp) * expFactor

    // Guard against overshoot past the original target.
    if (originalTo - current > 0 === output > originalTo) {
      output = originalTo
      this.velocity = (output - originalTo) / dt
    }
    return output
  }

  tick(dt: number): void {
    if (dt <= 0) return

    // Frame-rate independent exponential smoothing: fraction of the gap closed this frame.
    const alpha = 1 - Math.exp(-dt / this.tau)

    // Eased one-shot glide (Restart / tap-to-jump) takes over until it arrives.
    if (this.gliding) {
      this.position += (this.glideTarget - this.position) * alpha
      this.velocity = 0
      if (Math.abs(this.position - this.glideTarget) < 0.5) {
        this.position = this.glideTarget
        this.gliding = false
      }
      this.position = clamp(this.position, 0, this.maxPosition)
      return
    }

    if (this.mode === 'follow') {
      // The finger owns the position while it is down — the AI must never fight a manual
      // scroll (PRD §37). scrubBy() is the only thing that may move it until release.
      if (this.scrubbingFlag) {
        this.velocity = 0
        return
      }
      this.position = this.smoothDampFollow(this.position, this.targetPosition, dt)
      this.position = clamp(this.position, 0, this.maxPosition)
      return
    }

    // Auto mode: ease velocity toward its target, then integrate position.
    const target = this.currentTargetVelocity()
    this.velocity += (target - this.velocity) * alpha

    if (!this.scrubbingFlag) {
      this.position += this.velocity * dt
    }

    if (this.position <= 0) {
      this.position = 0
      if (this.velocity < 0) this.velocity = 0
    }
    if (this.position >= this.maxPosition) {
      this.position = this.maxPosition
      this.velocity = 0
    }
  }
}
