// Spielsitzung wie in solitaire++ (src/session.cpp): Auswahl, Züge verbuchen, Siege je Kombination, Rückgängig.

import { kindLabel, tx } from './text.ts'
import type { Card, DealKind, Hint, Move, Rules, Session, State } from '../types'
import { EASY, UNLIMITED, apply, canRecycle, deal, describe, faceUpRun, legalMoves, rulesName, stockCount, won } from './game.ts'

const HISTORY = 100

export const kindName = (k: DealKind): string => kindLabel(k)
export const comboKey = (s: { rules: Rules; kind: DealKind }): string => `${s.rules.draw}/${s.rules.passes}/${s.kind}`
export const winCount = (s: Session): number => s.wins[comboKey(s)] ?? 0

const failed = (s: Session, message: string): Session => ({ ...s, sel: null, hint: null, message })
const unhinted = (s: Session): Session => (s.hint ? { ...s, hint: null } : s)

export const start = (base: Pick<Session, 'wins'>, rules: Rules, kind: DealKind, seed: number): Session => ({
  rules,
  kind,
  seed,
  state: deal(seed),
  sel: null,
  hint: null,
  message: tx().newGame(rulesName(rules), kindName(kind)),
  moves: 0,
  won: false,
  assisted: false,
  history: [],
  wins: { ...base.wins },
})

export const blank = (): Session => start({ wins: {} }, EASY, 'random', 1)

export const play = (s: Session, m: Move, message = ''): Session => {
  if (s.won) return s
  s = unhinted(s)
  const r = apply(s.state, s.rules, m)
  if (!r.ok) return failed(s, r.error)
  const moves = s.moves + 1
  const nowWon = won(r.state)
  const wins = nowWon && !s.won && !s.assisted ? { ...s.wins, [comboKey(s)]: winCount(s) + 1 } : s.wins
  return {
    ...s,
    history: [...s.history, s.state].slice(-HISTORY),
    state: r.state,
    sel: null,
    hint: null,
    moves,
    won: nowWon,
    wins,
    message: nowWon ? (s.assisted ? tx().solvedAssisted(moves) : tx().won(moves)) : message,
  }
}

export const pressDraw = (s: Session): Session => {
  if (s.won) return s
  s = unhinted(s)
  let message = ''
  if (canRecycle(s.state, s.rules)) {
    if (s.rules.passes === UNLIMITED) message = tx().wasteBack
    else message = tx().pass(s.state.pass + 1, s.rules.passes)
  }
  return play(s, { kind: 'draw' }, message)
}

export const pressColumn = (s: Session, col: number): Session => {
  if (s.won) return s
  s = unhinted(s)
  const sel = s.sel
  if (!sel) {
    const run = faceUpRun(s.state.tab[col]!)
    if (run === 0) return { ...s, message: tx().columnEmpty }
    return { ...s, sel: { kind: 'col', col, count: run }, message: run > 1 ? tx().selectedRun(run, col + 1) : '' }
  }
  if (sel.kind === 'col' && sel.col === col) {
    const count = sel.count - 1
    if (count === 0) return { ...s, sel: null, message: '' }
    return { ...s, sel: { ...sel, count }, message: tx().selectedCount(count) }
  }
  if (sel.kind === 'waste') return play(s, { kind: 'wasteTab', to: col, count: 1 })
  return play(s, { kind: 'tabTab', from: sel.col, to: col, count: sel.count })
}

export const pressWaste = (s: Session): Session => {
  if (s.won) return s
  s = unhinted(s)
  if (s.sel?.kind === 'waste') return { ...s, sel: null, message: '' }
  if (s.sel) return failed(s, tx().nothingBackToWaste)
  if (s.state.waste === 0) return { ...s, message: tx().wasteEmptyDraw }
  return { ...s, sel: { kind: 'waste' }, message: '' }
}

export const pressFoundation = (s: Session): Session => {
  if (s.won) return s
  s = unhinted(s)
  if (s.sel?.kind === 'waste') return play(s, { kind: 'wasteFound' })
  if (s.sel?.kind === 'col') {
    if (s.sel.count !== 1) return failed(s, tx().onlySingleToFound)
    return play(s, { kind: 'tabFound', from: s.sel.col })
  }
  let n = 0
  for (let progress = true; progress && !s.won; ) {
    progress = false
    const m = legalMoves(s.state, s.rules).find(m => m.kind === 'wasteFound' || m.kind === 'tabFound')
    if (m) {
      s = play(s, m)
      n++
      progress = true
    }
  }
  if (n === 0) return failed(s, tx().nothingFits)
  return s.won ? s : { ...s, message: tx().played(n) }
}

export const undo = (s: Session): Session => {
  if (s.won) return failed(s, tx().gameWon)
  const last = s.history[s.history.length - 1]
  if (!last) return failed(s, tx().nothingToUndo)
  return { ...s, state: last, history: s.history.slice(0, -1), sel: null, hint: null, moves: Math.max(0, s.moves - 1), won: false, message: tx().undone }
}

export const clearSelection = (s: Session): Session => ({ ...s, sel: null, hint: null, message: '' })

// ---------- Tipps ----------

/** Die Karte, die `m` in der Stellung `s` bewegt. */
const movingCard = (s: State, m: Move): Card | undefined => {
  switch (m.kind) {
    case 'wasteFound':
    case 'wasteTab':
      return s.waste > 0 ? s.talon[s.waste - 1] : undefined
    case 'tabFound':
      return s.tab[m.from!]![s.tab[m.from!]!.length - 1]
    case 'tabTab': {
      const pile = s.tab[m.from!]!
      const count = m.count ?? 1
      return count >= 1 && pile.length >= count ? pile[pile.length - count] : undefined
    }
    default:
      return undefined
  }
}

const uncovers = (s: State, m: Move): boolean => {
  if (m.kind !== 'tabTab' && m.kind !== 'tabFound') return false
  const pile = s.tab[m.from!]!
  const count = m.kind === 'tabFound' ? 1 : (m.count ?? 1)
  return pile.length > count && !pile[pile.length - count - 1]!.up
}

const touches = (m: Move, a: number, b: number): boolean =>
  (m.kind === 'tabTab' && (m.from === a || m.from === b || m.to === a || m.to === b)) ||
  (m.kind === 'tabFound' && (m.from === a || m.from === b)) ||
  (m.kind === 'wasteTab' && (m.to === a || m.to === b))

const sameState = (a: State, b: State): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Aus einer Solver-Lösung: führende Zieh-Züge zusammenfassen; nur Ziehen → null. `previous` (die vorige Stellung
 * der Historie): ein Tipp, der sie nur wiederherstellen würde, wirkt wie Pendeln und wird aufgeschoben, wenn die
 * Lösung die betroffenen Spalten nicht sofort braucht – dann gilt der nächste Zug.
 */
export const planHint = (start: State, rules: Rules, solution: Move[], previous?: State): Hint | null => {
  let s = start
  let draws = 0
  for (let i = 0; i < solution.length; i++) {
    const m = solution[i]!
    if (m.kind !== 'draw') {
      const card = movingCard(s, m)
      if (!card) return null
      if (draws === 0 && previous && m.kind === 'tabTab') {
        const undone = apply(start, rules, m)
        if (undone.ok && sameState(undone.state, previous)) {
          const rest = solution.slice(i + 1)
          const nextMove = rest.find(x => x.kind !== 'draw')
          if (nextMove && !touches(nextMove, m.from ?? -1, m.to ?? -1)) return planHint(start, rules, rest)
        }
      }
      return { draws, move: m, card }
    }
    const r = apply(s, rules, m)
    if (!r.ok) return null
    s = r.state
    draws++
  }
  return null
}

/**
 * Zurück bis zur letzten Stellung der Historie, die `solvable` für lösbar hält. Lösbarkeit ist entlang der
 * Historie monoton (was unlösbar ist, bleibt es), darum reicht eine Halbierungssuche.
 * `undone` = zurückgenommene Züge (0: schon lösbar oder nichts Lösbares gefunden).
 */
export const rescue = async (s: Session, solvable: (st: State) => Promise<boolean>): Promise<{ session: Session; undone: number }> => {
  const settle = (message: string): Session => ({ ...s, sel: null, hint: null, message })
  if (await solvable(s.state)) return { session: settle(tx().stillSolvable), undone: 0 }
  const n = s.history.length
  if (n === 0 || !(await solvable(s.history[0]!))) return { session: settle(tx().noSolvableInHistory), undone: 0 }
  let lo = 0   // lösbar
  let hi = n   // unlösbar (die aktuelle Stellung)
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (await solvable(s.history[mid]!)) lo = mid
    else hi = mid
  }
  const undone = n - lo
  let session = s
  for (let i = 0; i < undone; i++) session = undo(session)
  return { session: { ...session, message: tx().rescued(undone) }, undone }
}

/** Heuristik, wenn der Solver nichts fand: Zielstapel, aufdeckender Zug, Ablage auf Spalte, sonst Ziehen; nichts → null. */
export const fallbackHint = (s: State, rules: Rules): Hint | null => {
  const moves = legalMoves(s, rules)
  const pick = (pred: (m: Move) => boolean): Hint | null => {
    for (const m of moves) {
      if (!pred(m)) continue
      const card = movingCard(s, m)
      if (card) return { draws: 0, move: m, card }
    }
    return null
  }
  return (
    pick(m => m.kind === 'wasteFound' || m.kind === 'tabFound') ??
    pick(m => m.kind === 'tabTab' && uncovers(s, m)) ??
    pick(m => m.kind === 'wasteTab') ??
    (stockCount(s) > 0 || canRecycle(s, rules) ? { draws: 1, move: { kind: 'draw' }, card: { r: 0, s: 0, up: false } } : null)
  )
}

/**
 * Ein geplanter Tipp mit vielen Zieh-Zügen (> 2) weicht einem direkten Zug (Zielstapel, Aufdecken, Ablage auf
 * Spalte), wenn `solvable` die Stellung danach noch für lösbar hält; sonst null.
 */
export const directAlternative = (s: State, rules: Rules, planned: Hint, solvable: (after: State) => boolean): Hint | null => {
  if (planned.draws <= 2) return null
  const direct = fallbackHint(s, rules)
  if (!direct || direct.move.kind === 'draw') return null
  const r = apply(s, rules, direct.move)
  return r.ok && solvable(r.state) ? direct : null
}

/** Markierung und Meldung für einen Tipp; `certain` = aus einer echten Lösung. */
export const showHint = (s: Session, h: Hint, certain: boolean): Session => {
  let text: string
  if (h.move.kind === 'draw') {
    text = stockCount(s.state) > 0 ? tx().drawCards : tx().turnWaste
  } else {
    let after = s.state
    for (let i = 0; i < h.draws; i++) {
      const r = apply(after, s.rules, { kind: 'draw' })
      if (r.ok) after = r.state
    }
    text = describe(h.move, after)
    if (h.draws > 0) text = tx().hintDraw(h.draws, text)
    if (uncovers(s.state, h.move)) text += tx().uncovers
  }
  return { ...s, sel: null, hint: h, message: `${certain ? tx().hintPrefix : tx().suggestionPrefix}${text}.` }
}
