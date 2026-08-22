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
  private scrubbing = false
  private mode: EngineMode = 'auto'
  private targetPosition = 0
  private gliding = false
  private glideTarget = 0

  constructor(opts: SmoothFollowOptions = {}) {
    this.baseSpeed = opts.baseSpeed ?? 55
    this.tau = opts.tau ?? 0.35
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
  setScrubbing(on: boolean): void {
    this.scrubbing = on
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

  /** Eased one-shot move to an absolute position (Restart / tap-to-jump). Manual scrub cancels it. */
  glideTo(targetPx: number): void {
    this.glideTarget = clamp(targetPx, 0, this.maxPosition)
    this.gliding = true
  }

  // Phase 2 forward-compat:
  setMode(mode: EngineMode): void {
    this.mode = mode
  }
  setTargetPosition(px: number): void {
    this.targetPosition = clamp(px, 0, this.maxPosition)
  }

  private currentTargetVelocity(): number {
    return this.playingFlag && !this.scrubbing ? this.baseSpeed * this.speedMultiplier : 0
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
      // Phase 2 path: ease the position itself toward the Smart Follow target.
      this.position += (this.targetPosition - this.position) * alpha
      this.position = clamp(this.position, 0, this.maxPosition)
      this.velocity = 0
      return
    }

    // Auto mode: ease velocity toward its target, then integrate position.
    const target = this.currentTargetVelocity()
    this.velocity += (target - this.velocity) * alpha

    if (!this.scrubbing) {
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
