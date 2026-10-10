// Klondike-Solver wie in solitaire++ (src/solver.cpp): Bestensuche mit Makro-Zieh-Zügen, erzwungenen sicheren
// Ablagen und Beschneidung nutzloser Teilfolgen. „Lösbar“ wird durch Nachspielen bewiesen, „unlösbar“ heißt:
// der Suchraum ist erschöpft (mit den Beschneidungen also heuristisch).

import type { Card, Move, Rules, State } from '../types'
import { UNLIMITED, apply, canStack, clone, faceUpRun, fitsFoundation, isRed, won } from './game.ts'

export type Verdict = 'solvable' | 'unsolvable' | 'unknown'
export type Budget = { ms: number; nodes: number }
export type Result = { verdict: Verdict; moves: Move[]; nodes: number }

export const DEFAULT_BUDGET: Budget = { ms: 1000, nodes: 400_000 }

const code = (c: Card): number => c.r | (c.s << 4) | (c.up ? 0x40 : 0)

// Spalten sortiert: vertauschte Spalten sind dieselbe Stellung. `pass` zählt nur bei begrenzten Durchgängen.
const key = (s: State, rules: Rules): string => {
  let head = String.fromCharCode(s.waste, ...s.found, rules.passes === UNLIMITED ? 0 : s.pass)
  for (const c of s.talon) head += String.fromCharCode(c.r | (c.s << 4))
  const cols = s.tab.map(p => String.fromCharCode(...p.map(code))).sort()
  return head + '|' + cols.join('|')
}

type Macro = { draws: number; move: Move }
type Reach = { draws: number; waste: number }

const reachable = (s: State, rules: Rules): Reach[] => {
  const out: Reach[] = []
  const n = s.talon.length
  if (n === 0) return out
  const seen = new Array<boolean>(n + 1).fill(false)
  let w = s.waste
  let pass = s.pass
  let draws = 0
  if (w > 0) {
    out.push({ draws: 0, waste: w })
    seen[w] = true
  }
  for (let guard = 0; guard < 3 * n + 3; guard++) {
    if (w < n) w = Math.min(w + rules.draw, n)
    else if (w > 0 && (rules.passes === UNLIMITED || pass < rules.passes)) {
      w = 0
      pass++
    } else break
    draws++
    if (seen[w]) break
    seen[w] = true
    if (w > 0) out.push({ draws, waste: w })
  }
  return out
}

const advance = (s: State, rules: Rules, draws: number): void => {
  const n = s.talon.length
  for (let i = 0; i < draws; i++) {
    if (s.waste < n) {
      const k = Math.min(rules.draw, n - s.waste)
      for (let j = 0; j < k; j++) s.talon[s.waste + j]!.up = true
      s.waste += k
    } else {
      for (const c of s.talon) c.up = false
      s.waste = 0
      s.pass += 1
    }
  }
}

const applyMacro = (s: State, rules: Rules, m: Macro): State | null => {
  let from = s
  if (m.draws > 0) {
    from = clone(s)
    advance(from, rules, m.draws)
  }
  const r = apply(from, rules, m.move)
  return r.ok ? r.state : null
}

// Sicher: Ass oder Zwei, oder beide gegenfarbigen Zielstapel liegen schon bei Rang-1.
const safeToFoundation = (s: State, c: Card): boolean => {
  if (c.r <= 2) return true
  const [a, b] = isRed(c) ? [0, 3] : [1, 2]
  return s.found[a]! >= c.r - 1 && s.found[b]! >= c.r - 1
}

const uncovers = (s: State, m: Move): boolean => {
  const pile = s.tab[m.from!]!
  const count = m.count!
  if (pile.length === count) return true
  return !pile[pile.length - count - 1]!.up
}

const pointlessKing = (s: State, m: Move): boolean => s.tab[m.to!]!.length === 0 && s.tab[m.from!]!.length === m.count

const orderedMoves = (s: State, rules: Rules): Macro[] => {
  const found: Macro[] = []
  const uncover: Macro[] = []
  const wasteTab: Macro[] = []
  const other: Macro[] = []
  for (let col = 0; col < 7; col++) {
    const pile = s.tab[col]!
    const last = pile[pile.length - 1]
    if (!last || !last.up || !fitsFoundation(s, last)) continue
    const m: Macro = { draws: 0, move: { kind: 'tabFound', from: col } }
    if (safeToFoundation(s, last)) return [m]
    found.push(m)
  }
  const reach = reachable(s, rules)
  for (const r of reach) {
    const c = s.talon[r.waste - 1]!
    if (fitsFoundation(s, c)) {
      const m: Macro = { draws: r.draws, move: { kind: 'wasteFound' } }
      if (r.draws === 0 && safeToFoundation(s, c)) return [m]
      found.push(m)
    }
    for (let col = 0; col < 7; col++) if (canStack(c, s.tab[col]!)) wasteTab.push({ draws: r.draws, move: { kind: 'wasteTab', to: col, count: 1 } })
  }
  for (let from = 0; from < 7; from++) {
    const pile = s.tab[from]!
    const run = faceUpRun(pile)
    for (let count = 1; count <= run; count++) {
      const moving = pile[pile.length - count]!
      // Teilfolgen nur, wenn die freigelegte Karte danach etwas bringt.
      if (count < run) {
        const exposed = pile[pile.length - count - 1]!
        const lands = (c: Card) => isRed(c) !== isRed(exposed) && c.r === exposed.r - 1
        let useful = fitsFoundation(s, exposed)
        for (const r of reach) if (!useful) useful = lands(s.talon[r.waste - 1]!)
        for (let o = 0; o < 7 && !useful; o++) {
          if (o === from) continue
          const op = s.tab[o]!
          const orun = faceUpRun(op)
          if (orun > 0 && op.length > orun) useful = lands(op[op.length - orun]!)
        }
        if (!useful) continue
      }
      for (let to = 0; to < 7; to++) {
        if (to === from || !canStack(moving, s.tab[to]!)) continue
        const mv: Move = { kind: 'tabTab', from, to, count }
        if (pointlessKing(s, mv)) continue
        ;(uncovers(s, mv) ? uncover : other).push({ draws: 0, move: mv })
      }
    }
  }
  return [...found, ...uncover, ...wasteTab, ...other]
}

const replaysToWin = (start: State, rules: Rules, moves: Move[]): boolean => {
  let s = start
  for (const m of moves) {
    const r = apply(s, rules, m)
    if (!r.ok) return false
    s = r.state
  }
  return won(s)
}

// Kompakt für die Knotenablage: [0] Talon-Länge, [1] waste, [2..5] found, [6] pass, Talon, je Spalte Länge + Karten.
const encode = (s: State): Uint8Array => {
  const e = new Uint8Array(72)
  let i = 0
  e[i++] = s.talon.length
  e[i++] = s.waste
  for (const f of s.found) e[i++] = f
  e[i++] = s.pass
  for (const c of s.talon) e[i++] = code(c)
  for (const pile of s.tab) {
    e[i++] = pile.length
    for (const c of pile) e[i++] = code(c)
  }
  return e
}

const card = (b: number): Card => ({ r: b & 0x0f, s: (b >> 4) & 0x3, up: (b & 0x40) !== 0 })

const decode = (e: Uint8Array): State => {
  let i = 0
  const n = e[i++]!
  const waste = e[i++]!
  const found = [e[i++]!, e[i++]!, e[i++]!, e[i++]!]
  const pass = e[i++]!
  const talon: Card[] = []
  for (let k = 0; k < n; k++) talon.push(card(e[i++]!))
  const tab: Card[][] = []
  for (let col = 0; col < 7; col++) {
    const len = e[i++]!
    const pile: Card[] = []
    for (let k = 0; k < len; k++) pile.push(card(e[i++]!))
    tab.push(pile)
  }
  return { talon, waste, found, tab, pass }
}

const score = (s: State): number => {
  let found = 0
  for (const f of s.found) found += f
  let down = 0
  let empty = 0
  for (const pile of s.tab) {
    if (pile.length === 0) empty++
    for (const c of pile) if (!c.up) down++
  }
  return 10 * found - 6 * down + 3 * empty
}

// Binärer Max-Heap über (score, Index); bei Gleichstand gewinnt der neuere Knoten.
class Heap {
  private items: [number, number][] = []
  get size() {
    return this.items.length
  }
  private better(a: [number, number], b: [number, number]) {
    return a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])
  }
  push(item: [number, number]) {
    const h = this.items
    h.push(item)
    for (let i = h.length - 1; i > 0; ) {
      const p = (i - 1) >> 1
      if (!this.better(h[i]!, h[p]!)) break
      ;[h[i], h[p]] = [h[p]!, h[i]!]
      i = p
    }
  }
  pop(): [number, number] {
    const h = this.items
    const top = h[0]!
    const last = h.pop()!
    if (h.length > 0) {
      h[0] = last
      for (let i = 0; ; ) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < h.length && this.better(h[l]!, h[m]!)) m = l
        if (r < h.length && this.better(h[r]!, h[m]!)) m = r
        if (m === i) break
        ;[h[i], h[m]] = [h[m]!, h[i]!]
        i = m
      }
    }
    return top
  }
}

// Die Suche als Generator: gibt nach jeweils CHUNK Knoten nach, damit ein Aufrufer zwischendurch warten kann.
// Das Zeitbudget zählt nur die Rechenzeit, nicht die Pausen.
const CHUNK = 4000

function* search(start: State, rules: Rules, budget: Budget): Generator<void, Result> {
  const res: Result = { verdict: 'unknown', moves: [], nodes: 0 }
  if (won(start)) return { ...res, verdict: 'solvable' }
  let spent = 0
  let t0 = Date.now()
  type Node = { enc: Uint8Array; parent: number; via: Macro }
  const arena: Node[] = [{ enc: encode(start), parent: 0, via: { draws: 0, move: { kind: 'draw' } } }]
  const heap = new Heap()
  heap.push([score(start), 0])
  const seen = new Set<string>([key(start, rules)])
  while (heap.size > 0) {
    const [, idx] = heap.pop()
    const state = decode(arena[idx]!.enc)
    for (const m of orderedMoves(state, rules)) {
      const child = applyMacro(state, rules, m)
      if (!child) continue
      if (++res.nodes > budget.nodes) return res
      if ((res.nodes & 255) === 0 && spent + Date.now() - t0 > budget.ms) return res
      if (res.nodes % CHUNK === 0) {
        spent += Date.now() - t0
        yield
        t0 = Date.now()
      }
      const k = key(child, rules)
      if (seen.has(k)) continue
      seen.add(k)
      const id = arena.length
      arena.push({ enc: encode(child), parent: idx, via: m })
      if (won(child)) {
        const path: Macro[] = []
        for (let at = id; at !== 0; at = arena[at]!.parent) path.push(arena[at]!.via)
        for (const p of path.reverse()) {
          for (let i = 0; i < p.draws; i++) res.moves.push({ kind: 'draw' })
          res.moves.push(p.move)
        }
        if (!replaysToWin(start, rules, res.moves)) return { ...res, moves: [] }
        return { ...res, verdict: 'solvable' }
      }
      heap.push([score(child), id])
    }
  }
  return { ...res, verdict: 'unsolvable' }
}

// ---------- Lösung vereinfachen ----------
// Die Suche findet Lösungen mit sinnlosen Paaren: eine Folge von Spalte a nach b und später unverändert zurück,
// ohne dass dazwischen etwas a oder b berührt. Als Tipp wirkt das wie Hin-und-Her-Pendeln. Solche Paare fliegen raus,
// sofern die Lösung ohne sie gültig bleibt (ein Hinzug, der eine Karte aufdeckt, bleibt dadurch erhalten).
const touches = (m: Move, a: number, b: number): boolean =>
  (m.kind === 'tabTab' && (m.from === a || m.from === b || m.to === a || m.to === b)) ||
  (m.kind === 'tabFound' && (m.from === a || m.from === b)) ||
  (m.kind === 'wasteTab' && (m.to === a || m.to === b))

const replays = (start: State, rules: Rules, moves: Move[]): boolean => {
  let s = start
  for (const m of moves) {
    const r = apply(s, rules, m)
    if (!r.ok) return false
    s = r.state
  }
  return won(s)
}

/** Lösung ohne sinnlose Hin-und-Zurück-Paare; `moves` muss `start` zum Sieg führen. */
export const simplify = (start: State, rules: Rules, moves: Move[]): Move[] => {
  let out = moves.slice()
  for (let i = 0; i < out.length; i++) {
    const a = out[i]!
    if (a.kind !== 'tabTab') continue
    for (let j = i + 1; j < out.length; j++) {
      const b = out[j]!
      if (b.kind === 'tabTab' && b.from === a.to && b.to === a.from && b.count === a.count) {
        const trial = out.filter((_, k) => k !== i && k !== j)
        if (replays(start, rules, trial)) {
          out = trial
          i = -1   // von vorn: das Streichen kann neue Paare freilegen
        }
        break
      }
      if (touches(b, a.from ?? -1, a.to ?? -1)) break
    }
  }
  return out
}

const finish = (start: State, rules: Rules, r: Result): Result => (r.verdict === 'solvable' ? { ...r, moves: simplify(start, rules, r.moves) } : r)

export const solve = (start: State, rules: Rules, budget: Budget = DEFAULT_BUDGET): Result => {
  const it = search(start, rules, budget)
  for (;;) {
    const step = it.next()
    if (step.done) return finish(start, rules, step.value)
  }
}

/** Wie solve, wartet aber nach jedem Abschnitt auf `pause` (z. B. einen Timer); `stop` bricht mit unknown ab. */
export const solveAsync = async (
  start: State,
  rules: Rules,
  pause: () => Promise<unknown>,
  stop: () => boolean = () => false,
  budget: Budget = DEFAULT_BUDGET,
): Promise<Result> => {
  const it = search(start, rules, budget)
  for (;;) {
    const step = it.next()
    if (step.done) return finish(start, rules, step.value)
    await pause()
    if (stop()) return { verdict: 'unknown', moves: [], nodes: 0 }
  }
}
