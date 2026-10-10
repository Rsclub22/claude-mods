// Regeln wie in solitaire++ (src/game.cpp): Züge prüfen und anwenden, Austeilen aus einem Seed.

import { rulesLabel, tx } from './text.ts'
import type { Card, Move, Rules, State } from '../types'

export const UNLIMITED = 0
export const EASY: Rules = { draw: 1, passes: UNLIMITED }
export const MEDIUM: Rules = { draw: 3, passes: UNLIMITED }
export const HARD: Rules = { draw: 3, passes: 3 }

export const SUITS = ['♠', '♥', '♦', '♣']
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export const isRed = (c: Card | number): boolean => {
  const s = typeof c === 'number' ? c : c.s
  return s === 1 || s === 2
}
export const label = (c: Card): string => (RANKS[c.r] ?? '?') + SUITS[c.s]!

export const sameRules = (a: Rules, b: Rules): boolean => a.draw === b.draw && a.passes === b.passes
export const rulesName = (r: Rules): string => rulesLabel(r, sameRules(r, EASY), sameRules(r, MEDIUM), sameRules(r, HARD))


export type Applied = { ok: true; state: State } | { ok: false; error: string }
const fail = (error: string): Applied => ({ ok: false, error })

export const clone = (s: State): State => ({
  talon: s.talon.map(c => ({ ...c })),
  waste: s.waste,
  found: [...s.found],
  tab: s.tab.map(p => p.map(c => ({ ...c }))),
  pass: s.pass,
})

const validCol = (col: number | undefined): col is number => col !== undefined && col >= 0 && col < 7

const flipTop = (pile: Card[]): void => {
  const top = pile[pile.length - 1]
  if (top && !top.up) top.up = true
}

export const canStack = (moving: Card, pile: Card[]): boolean => {
  const onto = pile[pile.length - 1]
  if (!onto) return moving.r === 13
  return onto.up && isRed(moving) !== isRed(onto) && moving.r === onto.r - 1
}

export const fitsFoundation = (s: State, c: Card): boolean => s.found[c.s] === c.r - 1
export const stockCount = (s: State): number => s.talon.length - s.waste
export const wasteTop = (s: State): Card | undefined => (s.waste > 0 ? s.talon[s.waste - 1] : undefined)
export const canRecycle = (s: State, rules: Rules): boolean =>
  stockCount(s) === 0 && s.waste > 0 && (rules.passes === UNLIMITED || s.pass < rules.passes)

export const faceUpRun = (pile: Card[]): number => {
  let n = 0
  for (let i = pile.length - 1; i >= 0 && pile[i]!.up; i--) n++
  return n
}

export const won = (s: State): boolean => s.found.every(f => f === 13)
export const allFaceUp = (s: State): boolean => s.tab.every(p => p.every(c => c.up))

export const apply = (s: State, rules: Rules, m: Move): Applied => {
  const n = clone(s)
  switch (m.kind) {
    case 'draw': {
      const stock = stockCount(s)
      if (stock > 0) {
        const k = Math.min(rules.draw, stock)
        for (let i = 0; i < k; i++) n.talon[n.waste + i]!.up = true
        n.waste += k
        return { ok: true, state: n }
      }
      if (s.waste === 0) return fail(tx().noStock)
      if (!canRecycle(s, rules)) return fail(tx().noPasses)
      for (const c of n.talon) c.up = false
      n.waste = 0
      n.pass += 1
      return { ok: true, state: n }
    }
    case 'wasteFound':
    case 'wasteTab': {
      const top = wasteTop(s)
      if (!top) return fail(tx().wasteEmpty)
      if (m.kind === 'wasteFound') {
        if (!fitsFoundation(s, top)) return fail(tx().noFit)
        n.found[top.s]! += 1
      } else {
        if (!validCol(m.to)) return fail(tx().noSuchColumn)
        if (!canStack(top, s.tab[m.to]!)) return fail(tx().noFit)
        n.tab[m.to]!.push({ ...top })
      }
      n.talon.splice(s.waste - 1, 1)
      n.waste -= 1
      return { ok: true, state: n }
    }
    case 'tabFound': {
      if (!validCol(m.from)) return fail(tx().noSuchColumn)
      const pile = n.tab[m.from]!
      const c = pile[pile.length - 1]
      if (!c) return fail(tx().columnEmpty)
      if (!c.up || !fitsFoundation(s, c)) return fail(tx().noFit)
      n.found[c.s]! += 1
      pile.pop()
      flipTop(pile)
      return { ok: true, state: n }
    }
    case 'tabTab': {
      if (!validCol(m.from) || !validCol(m.to)) return fail(tx().noSuchColumn)
      if (m.from === m.to) return fail('Das ist dieselbe Spalte.')
      const from = n.tab[m.from]!
      const to = n.tab[m.to]!
      const count = m.count ?? 1
      if (count < 1 || count > faceUpRun(from)) return fail(tx().notThatMany)
      if (!canStack(from[from.length - count]!, to)) return fail(tx().noFit)
      to.push(...from.splice(from.length - count, count))
      flipTop(from)
      return { ok: true, state: n }
    }
  }
}

export const legalMoves = (s: State, rules: Rules): Move[] => {
  const out: Move[] = []
  const top = wasteTop(s)
  if (top && fitsFoundation(s, top)) out.push({ kind: 'wasteFound' })
  for (let col = 0; col < 7; col++) {
    const pile = s.tab[col]!
    const last = pile[pile.length - 1]
    if (last && last.up && fitsFoundation(s, last)) out.push({ kind: 'tabFound', from: col })
  }
  if (top) for (let col = 0; col < 7; col++) if (canStack(top, s.tab[col]!)) out.push({ kind: 'wasteTab', to: col, count: 1 })
  for (let from = 0; from < 7; from++) {
    const pile = s.tab[from]!
    const run = faceUpRun(pile)
    for (let count = 1; count <= run; count++) {
      const moving = pile[pile.length - count]!
      for (let to = 0; to < 7; to++) if (to !== from && canStack(moving, s.tab[to]!)) out.push({ kind: 'tabTab', from, to, count })
    }
  }
  if (stockCount(s) > 0 || canRecycle(s, rules)) out.push({ kind: 'draw' })
  return out
}

/** splitmix32: kleiner, reproduzierbarer Zufall aus einem 32-Bit-Seed. */
export const rng = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x9e3779b9) >>> 0
    let z = a
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0
    return ((z ^ (z >>> 16)) >>> 0) / 4294967296
  }
}

export const deal = (seed: number): State => {
  const deck: Card[] = []
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ r, s, up: false })
  const next = rng(seed)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  const tab: Card[][] = []
  let k = 0
  for (let col = 0; col < 7; col++) {
    const pile: Card[] = []
    for (let i = 0; i <= col; i++) pile.push({ ...deck[k++]!, up: i === col })
    tab.push(pile)
  }
  return { talon: deck.slice(k), waste: 0, found: [0, 0, 0, 0], tab, pass: 1 }
}

export const describe = (m: Move, s: State): string => {
  const top = wasteTop(s)
  switch (m.kind) {
    case 'draw':
      return stockCount(s) > 0 ? tx().drawCards : tx().turnWaste
    case 'wasteFound':
      return tx().wasteToFound(top ? label(top) : '?')
    case 'wasteTab':
      return tx().wasteToCol(top ? label(top) : '?', m.to! + 1)
    case 'tabFound': {
      const pile = s.tab[m.from!]!
      const last = pile[pile.length - 1]
      return tx().colToFound(last ? label(last) : '?', m.from! + 1)
    }
    case 'tabTab': {
      const pile = s.tab[m.from!]!
      const count = m.count ?? 1
      const card = pile[pile.length - count]
      return tx().colToCol(card ? label(card) : '?', count - 1, m.from! + 1, m.to! + 1)
    }
  }
}
