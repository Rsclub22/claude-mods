// Siegesanimation wie in solitaire++ (src/celebrate.cpp) und im alten Windows-Solitär: Die Karten springen
// nacheinander von den Zielstapeln, hüpfen über den unteren Rand und ziehen eine Spur hinter sich her,
// weil nie gelöscht wird.

import type { Card } from '../types'
import { rng } from './game.ts'
import { type Layout, type Size, TOP_Y, columnX } from './render.ts'

export type Stamp = { card: Card; x: number; y: number }   // card.r 0 = leerer Platz des Zielstapels

const LAUNCH_EVERY = 7   // Takte zwischen zwei Starts
const GRAVITY = 0.09     // Zeilen je Takt²; Zeilen sind etwa doppelt so hoch wie Spalten breit
const BOUNCE = 0.78      // behaltene Geschwindigkeit nach dem Aufprall

type Flyer = { card: Card; x: number; y: number; vx: number; vy: number; lastX: number; lastY: number }

export class Cascade {
  private flying: Flyer[] = []
  private next = 0    // gestartete Karten: K♠ K♥ K♦ K♣ D♠ …
  private clock = 0
  private random: () => number
  private size: Size
  private L: Layout

  constructor(size: Size, L: Layout, seed: number) {
    this.size = size
    this.L = L
    this.random = rng(seed)
  }

  get done(): boolean {
    return this.next >= 52 && this.flying.length === 0
  }

  private launch(out: Stamp[]): void {
    const suit = this.next % 4
    const rank = 13 - Math.floor(this.next / 4)
    this.next++
    const x = columnX(this.L, 3 + suit)
    out.push({ card: { r: rank - 1, s: suit, up: true }, x, y: TOP_Y })   // darunter liegende Karte
    const speed = 0.9 + 1.2 * this.random()
    const vx = this.random() < 0.5 ? -speed : speed
    const vy = -1.1 + 1.2 * this.random()
    const card = { r: rank, s: suit, up: true }
    out.push({ card, x, y: TOP_Y })
    this.flying.push({ card, x, y: TOP_Y, vx, vy, lastX: x, lastY: TOP_Y })
  }

  /** Ein Takt: was neu zu zeichnen ist. */
  tick(): Stamp[] {
    const out: Stamp[] = []
    if (this.next < 52 && this.clock++ % LAUNCH_EVERY === 0) this.launch(out)
    const floor = this.size.rows - this.L.h
    this.flying = this.flying.filter(f => {
      f.vy += GRAVITY
      f.x += f.vx
      f.y += f.vy
      if (f.y > floor) {
        f.y = floor - (f.y - floor) * BOUNCE
        f.vy = -f.vy * BOUNCE
      }
      const x = Math.round(f.x)
      const y = Math.min(Math.round(f.y), floor)
      if (x + this.L.w <= 0 || x >= this.size.cols) return false
      if (x !== f.lastX || y !== f.lastY) out.push({ card: f.card, x, y })
      f.lastX = x
      f.lastY = y
      return true
    })
    return out
  }
}
