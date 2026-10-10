import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Mounted } from 'claude-code/testing'

import type { On } from 'claude-code'

import type { Card, Move, Session, State } from '../types'
import { Cascade } from '../hooks/celebrate.ts'
import { EASY, HARD, SUITS, apply, deal, won } from '../hooks/game.ts'
import { STYLES, TOP_Y, columnX, feltAt, layoutFor, plain, render, runs, shadowAt } from '../hooks/render.ts'
import { blank, directAlternative, fallbackHint, planHint, play, pressColumn, pressDraw, rescue, showHint, start } from '../hooks/session.ts'
import { simplify, solve } from '../hooks/solver.ts'
import { setLanguage, tx } from '../hooks/text.ts'

const PANE = {
  plugin: 'solitaire',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'solitaire',
  props: {
    title: 'Solitaire',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 26 },
    view: {},
  },
} as const

const c = (r: number, s: number, up = true): Card => ({ r, s, up })
const empty = (): State => ({ talon: [], waste: 0, found: [0, 0, 0, 0], tab: [[], [], [], [], [], [], []], pass: 1 })

/** Lässt das Pane bis zum ersten eigenen Schreiben diesen Spielstand sehen (der Kit hält $.state selbst). */
const seed = (on: On, session: Session) => {
  let written = false
  on('state.set', { plugin: 'solitaire', key: 'session' }, async ($, e, next) => {
    written = true
    return next(e)
  })
  on('state.get', { plugin: 'solitaire', key: 'session' }, async ($, e, next) => {
    const r = await next(e)
    if (written || !r.value) return r
    return { value: { ...r.value, value: session } }
  })
}

type UI = Mounted<'terminal', 'Pane'>

const text = async (ui: { find: (q: { type: 'Text'; text: RegExp }) => Promise<unknown> }, re: RegExp) =>
  (await ui.find({ type: 'Text', text: re })) !== undefined

// ---------- Logik ----------

test('ein Blatt hat 28 Karten in sieben Spalten und 24 im Stapel', async () => {
  const s = deal(7)
  expect(s.tab.map(p => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7])
  expect(s.talon.length).toBe(24)
  expect(s.tab.every(p => p[p.length - 1]!.up && p.slice(0, -1).every(x => !x.up))).toBe(true)
})

test('der Solver findet für ein offenes Endspiel eine Lösung, die zum Sieg führt', async () => {
  const s = empty()
  s.found = [12, 12, 12, 11]
  s.tab[0] = [c(13, 0), c(12, 3)]
  s.tab[1] = [c(13, 1)]
  s.tab[2] = [c(13, 2)]
  s.tab[3] = [c(13, 3)]
  const r = solve(s, HARD)
  expect(r.verdict).toBe('solvable')
  expect(r.moves.length).toBe(5)
})

test('die Siegesanimation startet die Könige zuerst und endet', async () => {
  const size = { cols: 80, rows: 24 }
  const won = { ...empty(), found: [13, 13, 13, 13] }
  const cascade = new Cascade(size, layoutFor(size, won), 3)
  const kings: number[] = []
  let ticks = 0
  while (!cascade.done && ticks < 2000) {
    for (const st of cascade.tick()) if (st.card.r === 13 && !kings.includes(st.card.s)) kings.push(st.card.s)
    ticks++
  }
  expect(cascade.done).toBe(true)
  expect(kings).toEqual([0, 1, 2, 3])
})

test('die Darstellung füllt die Fläche genau aus', async () => {
  for (const size of [{ cols: 80, rows: 24 }, { cols: 43, rows: 11 }, { cols: 140, rows: 45 }]) {
    const lines = plain(render(blank(), size).grid)
    expect(lines.length).toBe(size.rows)
    for (const l of lines) expect([...l].length).toBe(size.cols)
  }
})

const countOf = (t: string, needle: string) => t.split(needle).length - 1
const boardText = (session: Session, size: { cols: number; rows: number }) => plain(render(session, size).grid).join('\n')
const lone = (card: Card, size: { cols: number; rows: number }) => {
  const st = empty()
  st.tab[0] = [card]
  return boardText({ ...blank(), state: st, message: '' }, size)
}

test('die Größenleiter hat fünf Stufen bis 13×9', async () => {
  const st = empty()
  expect(layoutFor({ cols: 43, rows: 11 }, st).w).toBe(5)
  expect(layoutFor({ cols: 80, rows: 24 }, st).w).toBe(9)
  expect(layoutFor({ cols: 90, rows: 40 }, st).w).toBe(11)
  expect([layoutFor({ cols: 120, rows: 50 }, st).w, layoutFor({ cols: 120, rows: 50 }, st).h]).toEqual([13, 9])
})

test('große Karten: Index in Zeile 1, Rang in Blockschrift darunter, Pips rechts, Bildkarten mit großem Symbol', async () => {
  // 13×9 (120×50): Index, gespiegelter Index unten rechts und Pips; 11×7 (90×40): Index und Pips.
  const sizes: [{ cols: number; rows: number }, number][] = [[{ cols: 120, rows: 50 }, 2], [{ cols: 90, rows: 40 }, 1]]
  for (const [size, extra] of sizes) {
    for (let suit = 0; suit < 4; suit++) {
      const sym = SUITS[suit]!
      const background = countOf(boardText({ ...blank(), state: empty(), message: '' }, size), sym)
      for (let r = 1; r <= 13; r++) {
        const t = lone(c(r, suit), size)
        const pips = r >= 2 && r <= 10 ? r : 0
        expect(countOf(t, sym) - background).toBe(pips + extra)
        expect(t.includes('█')).toBe(true)
      }
    }
  }
  const five = lone(c(5, 1), { cols: 120, rows: 50 })
  for (const row of ['│5♥         │', '│█▀▀  ♥   ♥ │', '│▀▀█        │', '│▄▄█    ♥   │', '│     ♥   ♥ │', '│        ♥ 5│']) expect(five.includes(row)).toBe(true)
  const ten = lone(c(10, 0), { cols: 120, rows: 50 })
  for (const row of ['│10♠        │', '│█ █▀█ ♠  ♠ │', '│█ █ █ ♠  ♠ │', '│█ █▄█ ♠  ♠ │', '│      ♠  ♠ │', '│       ♠ 10│']) expect(ten.includes(row)).toBe(true)
  const ace = lone(c(1, 1), { cols: 120, rows: 50 })
  for (const row of ['│A♥         │', '│▄▀▄  ▄█▄█▄ │', '│█▀█  ▀███▀ │', '│▀ ▀   ▀█▀  │']) expect(ace.includes(row)).toBe(true)
  const king = lone(c(13, 0), { cols: 120, rows: 50 })
  for (const row of ['│K♠         │', '│█ █   ▄█▄  │', '│█▀▄  █████ │', '│█ █  ▀▀█▀▀ │', '│           │', '│        ♠ K│']) expect(king.includes(row)).toBe(true)
  const nine = lone(c(9, 3), { cols: 90, rows: 40 })
  for (const row of ['│9♣  ♣   ♣│', '│█▀█ ♣   ♣│', '│▀▀█   ♣  │', '│▄▄█ ♣   ♣│', '│    ♣   ♣│']) expect(nine.includes(row)).toBe(true)
  const queen = lone(c(12, 2), { cols: 90, rows: 40 })
  for (const row of ['│Q♦       │', '│▄▀▄   ▄  │', '│█ █  ███ │', '│▀▀█   ▀  │']) expect(queen.includes(row)).toBe(true)
  expect(lone(c(10, 1), { cols: 120, rows: 50 }).includes('♥ 10')).toBe(true)
  expect(lone(c(10, 1), { cols: 90, rows: 40 }).includes('♥ 10')).toBe(false)
})

test('9×6 und kleiner bleiben: einzeiliger Index, Blockschrift mittig', async () => {
  const size = { cols: 80, rows: 24 }
  const background = countOf(boardText({ ...blank(), state: empty(), message: '' }, size), SUITS[0]!)
  for (let r = 1; r <= 13; r++) {
    const t = lone(c(r, 0), size)
    expect(countOf(t, SUITS[0]!) - background).toBe(1)
    expect(t.includes('█')).toBe(true)
  }
  expect(lone(c(10, 0), size).includes('▄█▄ █▄█')).toBe(true)
  expect(lone(c(7, 3), { cols: 43, rows: 11 }).includes('7♣')).toBe(true)
})

test('Karten haben runde Ecken und werfen einen Schatten nach rechts unten', async () => {
  const size = { cols: 80, rows: 24 }
  const st = empty()
  st.tab[0] = [c(5, 0)]
  const board = render({ ...blank(), state: st, message: '' }, size)
  const L = board.layout
  const t = plain(board.grid).join('\n')
  expect(t.includes('╭')).toBe(true)
  expect(t.includes('┌') || t.includes('└')).toBe(false)
  const tabY = TOP_Y + L.h + 1
  const x = columnX(L, 0)
  expect(board.grid[tabY + 1]![x + L.w]!.st).toBe('shadow')
  expect(board.grid[tabY + L.h]![x + 2]!.st).toBe('shadow')
  expect(board.grid[tabY]![x + L.w]!.st).not.toBe('shadow')
  expect(STYLES.shadow.backgroundColor).toBe('shadow')
  expect(shadowAt(5, 24)).not.toBe(feltAt(5, 24))
})

test('der Filz hat einen Verlauf, runs löst ihn je Zeile auf', async () => {
  const rows = 40
  const board = render({ ...blank(), state: empty(), message: '' }, { cols: 120, rows })
  const bgOf = (y: number) => runs(board.grid[y]!, y, rows)[0]!.backgroundColor
  expect(bgOf(1)).toBe(feltAt(1, rows))
  expect(bgOf(1)).not.toBe(feltAt(rows / 2, rows))
  expect(bgOf(1)).toMatch(/^#[0-9a-f]{6}$/)
  const sum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
  expect(sum(feltAt(rows / 2, rows))).toBeGreaterThan(sum(feltAt(1, rows)))
})

test('die Kopfzeile ist ein dunkler Balken über die ganze Breite', async () => {
  const board = render(blank(), { cols: 80, rows: 24 })
  const row0 = board.grid[0]!
  expect(row0.every(cell => STYLES[cell.st].backgroundColor === STYLES.bar.backgroundColor)).toBe(true)
  expect(STYLES.bar.backgroundColor).toMatch(/^#/)
  expect(plain(board.grid)[0]!.includes('Solitaire')).toBe(true)
  expect(board.grid[1]!.every(cell => cell.st === 'felt')).toBe(true)
})

test('Rückseiten sind blau mit hellem Rahmen und Rautenmuster, leere Plätze rund', async () => {
  const st = empty()
  st.tab[0] = [c(5, 0, false), c(6, 1)]
  const board = render({ ...blank(), state: st, message: '' }, { cols: 80, rows: 24 })
  const styles = new Set(board.grid.flat().map(cell => cell.st))
  expect(styles.has('backPattern') && styles.has('backFrame')).toBe(true)
  expect(plain(board.grid).join('').includes('◆')).toBe(true)
  expect(plain(board.grid).join('').includes('░')).toBe(false)
  const t = boardText({ ...blank(), state: empty(), message: '' }, { cols: 80, rows: 24 })
  expect(t.includes('╭')).toBe(true)
  expect(t.includes('╌')).toBe(false)
})


// ---------- Pane ----------

/** Pane mit Speicher- und Uhrattrappe; `until` lässt die Uhr laufen, bis ein Text erscheint. */
const setup = async ($: Engine, on: On, session?: Session) => {
  mock.store(on)
  const clock = mock.clock(on)
  if (session) seed(on, session)
  const ui: UI = await $.ui.mount(PANE)
  const until = async (re: RegExp, step = 50, limit = 400) => {
    for (let i = 0; i < limit && !(await text(ui, re)); i++) await clock.advance(step)
    return text(ui, re)
  }
  const press = (key: string) => void ui.press({ key })
  return { ui, clock, until, press }
}

test('das Pane zeigt Kopfzeile, Tasten für Stapel, Ablage, Ziel und alle Spalten', async ($, on) => {
  const { ui } = await setup($, on)
  expect(await text(ui, /Easy · random · Moves 0/)).toBe(true)
  for (const key of ['s', 'w', 'f', 'ba', 'bl', 'bh', 'br', 'bd', 'bu', 'bc', 'bn', 'bq']) expect(await ui.find({ key })).toBeDefined()
  for (let col = 0; col < 7; col++) expect(await ui.find({ key: `col${col}` })).toBeDefined()
  await ui.unmount()
})

test('q schließt das Pane, auch während einer Demo', async ($, on) => {
  const closed: string[] = []
  on('ui.close', async (_$, e) => {
    closed.push(e.id)   // antwortet selbst: die Testumgebung hat kein Pane, das sich schließen ließe
    return { value: undefined }
  })
  const { ui, until, press, clock } = await setup($, on)
  press('bd')
  expect(await until(/Demo/)).toBe(true)
  press('bq')
  await clock.advance(50)
  expect(closed).toEqual(['solitaire'])
  expect(await text(ui, /Demo running/)).toBe(false)
  await ui.unmount()
})

test('s zieht, u nimmt zurück', async ($, on) => {
  const { ui, until, press } = await setup($, on)
  press('s')
  expect(await until(/Moves 1/)).toBe(true)
  press('bu')
  expect(await until(/Move taken back/)).toBe(true)
  expect(await text(ui, /Moves 0/)).toBe(true)
  await ui.unmount()
})

test('n fragt Regeln und Blatt ab, Zufall teilt sofort aus', async ($, on) => {
  const { ui, until, press } = await setup($, on)
  press('bn')
  expect(await until(/choose rules/)).toBe(true)
  press('b2')
  expect(await until(/choose the deal/)).toBe(true)
  press('b2')
  expect(await until(/Medium · random · Moves 0/)).toBe(true)
  await ui.unmount()
})

test('ein geprüftes Blatt wird ausgeteilt, nachdem der Solver es gelöst hat', async ($, on) => {
  const { ui, until, press } = await setup($, on)
  press('bn')
  await until(/choose rules/)
  press('b1')   // Leicht: fast jedes Blatt ist lösbar, die Suche bleibt unter dem Testlimit
  await until(/choose the deal/)
  press('b1')
  expect(await until(/Easy · checked · Moves 0/, 50, 2000)).toBe(true)
  await ui.unmount()
})

test('h gibt einen Hinweis', async ($, on) => {
  const { ui, until, press } = await setup($, on)
  press('bh')
  expect(await until(/Hint: |suggestion: |No moves/, 1, 5000)).toBe(true)
  await ui.unmount()
})

test('l spielt bei aufgedeckten Karten die Lösung ab bis zum Sieg, a zeigt sie nur', async ($, on) => {
  const st = empty()
  st.found = [10, 10, 10, 10]
  st.talon = [c(11, 0, false), c(13, 2, false), c(11, 3, false), c(11, 2, false)]
  st.tab = [[c(13, 0), c(12, 1)], [c(13, 1), c(12, 0)], [c(11, 1)], [c(12, 3)], [c(13, 3), c(12, 2)], [], []]
  const { ui, until, press } = await setup($, on, { ...blank(), rules: EASY, state: st, message: '' })
  expect(await text(ui, /All face up/)).toBe(true)
  press('ba')
  expect(await until(/Showing the solution/, 100)).toBe(true)
  expect(await until(/That was the solution/, 100)).toBe(true)
  expect(await text(ui, /Moves 0/)).toBe(true)
  press('bl')
  expect(await until(/Won|Solved/, 100)).toBe(true)
  await ui.unmount()
})

test('nach dem Sieg läuft die Animation, bleibt stehen und eine Taste beendet sie', async ($, on) => {
  const st = empty()
  st.found = [13, 13, 13, 12]
  st.tab[0] = [c(13, 3)]
  const { ui, clock, until, press } = await setup($, on, { ...blank(), state: st, message: '' })
  press('f')
  expect(await until(/ends the animation/)).toBe(true)
  for (let i = 0; i < 40; i++) await clock.advance(1000)
  expect(await text(ui, /ends the animation/)).toBe(true)   // fertig, aber das Bild bleibt
  press('bc')
  await clock.settle()
  expect(await text(ui, /ends the animation/)).toBe(false)
  expect(await text(ui, /Wins 1/)).toBe(true)
  await ui.unmount()
})

test('ein assistierter Sieg zählt nicht und meldet „gelöst“', async () => {
  const st = empty()
  st.found = [13, 13, 13, 12]
  st.tab[0] = [c(13, 3)]
  const base = { ...blank(), state: st, message: '' }
  const w = play({ ...base, assisted: true }, { kind: 'tabFound', from: 0 })
  expect(w.won).toBe(true)
  expect(w.wins['1/0/random'] ?? 0).toBe(0)
  expect(w.message).toBe('Solved in 1 move (with the solver).')
  expect(play(base, { kind: 'tabFound', from: 0 }).wins['1/0/random']).toBe(1)
})

test('a zeigt bei verdeckten Karten die Lösung nur vor und stellt die Stellung wieder her', async ($, on) => {
  const st = empty()
  st.found = [13, 13, 13, 11]
  st.tab[0] = [c(13, 3, false), c(12, 3)]
  const { ui, until, press } = await setup($, on, { ...blank(), rules: EASY, state: st, message: '' })
  expect(await text(ui, /All face up/)).toBe(false)
  press('bl')
  expect(await until(/Uncover all cards in the columns first/)).toBe(true)
  press('ba')
  expect(await until(/Showing the solution/, 100)).toBe(true)
  expect(await until(/returning to the position/, 100)).toBe(true)
  expect(await until(/That was the solution/, 100)).toBe(true)
  expect(await text(ui, /Moves 0/)).toBe(true)
  expect(await text(ui, /Solved|Won/)).toBe(false)
  // Danach selbst gewinnen: zählt nicht, weil die Lösung gezeigt wurde.
  press('f')
  expect(await until(/Solved in 2 moves \(with the solver\)/, 100)).toBe(true)
  expect(await text(ui, /Wins 0/)).toBe(true)
  await ui.unmount()
})

test('d startet die Demo, eine Taste beendet sie und der alte Stand bleibt', async ($, on) => {
  const { ui, until, press } = await setup($, on)
  expect(await ui.find({ key: 'bd' })).toBeDefined()
  press('bd')
  expect(await until(/Demo · Easy · checked/, 1, 20000)).toBe(true)
  expect(await until(/Demo running/, 50, 2000)).toBe(true)
  press('bc')
  expect(await until(/Easy · random · Moves 0/)).toBe(true)
  expect(await text(ui, /Demo/)).toBe(false)
  await ui.unmount()
})

test('die Meldungen beim Vorführen der Lösung', async () => {
  const t = plain(render(blank(), { cols: 80, rows: 24 }, { preview: 'running' }).grid).join('\n')
  expect(t.includes('Showing the solution … (any key stops it)')).toBe(true)
  const d = plain(render(blank(), { cols: 80, rows: 24 }, { preview: 'done' }).grid).join('\n')
  expect(d.includes('Solution shown – returning to the position.')).toBe(true)
})

test('Tipp fasst Zieh-Züge zusammen, nennt die Karte, nennt Aufdecken und verschwindet beim nächsten Zug', async () => {
  const st = empty()
  st.talon = [c(9, 0, true), c(7, 2, false), c(2, 3, false)]
  st.waste = 1
  st.tab[4] = [c(8, 3)]
  const s = { ...blank(), state: st, message: '' }
  const h = planHint(st, EASY, [{ kind: 'draw' }, { kind: 'wasteTab', to: 4, count: 1 }, { kind: 'draw' }])
  expect(h).toEqual({ draws: 1, move: { kind: 'wasteTab', to: 4, count: 1 }, card: c(7, 2) })
  const shown = showHint(s, h!, true)
  expect(shown.message).toBe('Hint: draw 1×, then 7♦ from the waste to column 5.')
  expect(pressDraw(shown).hint).toBe(null)
  expect(planHint(st, EASY, [{ kind: 'draw' }])).toBe(null)
  const st2 = empty()
  st2.tab[0] = [c(5, 0, false), c(7, 2)]
  st2.tab[1] = [c(8, 3)]
  const h2 = planHint(st2, EASY, [{ kind: 'tabTab', from: 0, to: 1, count: 1 }])
  expect(showHint({ ...blank(), state: st2 }, h2!, true).message).toBe('Hint: 7♦ from column 1 to column 2 – uncovers a card.')
})

test('Vorschlag: Zielstapel, dann aufdeckender Zug, dann Ziehen, sonst nichts', async () => {
  const st = empty()
  st.talon = [c(4, 1, false), c(9, 0, false)]
  st.tab[0] = [c(5, 0, false), c(7, 2)]
  st.tab[1] = [c(8, 3)]
  st.tab[2] = [c(1, 1)]
  expect(fallbackHint(st, EASY)!.move.kind).toBe('tabFound')
  expect(showHint({ ...blank(), state: st }, fallbackHint(st, EASY)!, false).message).toBe('No sure solution found – suggestion: A♥ from column 3 to the foundation.')
  st.tab[2] = []
  expect(fallbackHint(st, EASY)!.move).toEqual({ kind: 'tabTab', from: 0, to: 1, count: 1 })
  st.tab[0] = [c(7, 2)]
  st.tab[1] = []
  expect(fallbackHint(st, EASY)!.move.kind).toBe('draw')
  st.talon = []
  expect(fallbackHint(st, EASY)).toBe(null)
})

test('ein Tipp hebt Quelle und Ziel hervor, ein Zieh-Tipp den Stapel', async () => {
  const st = empty()
  st.tab[0] = [c(5, 0, false), c(7, 2)]
  st.tab[1] = [c(8, 3)]
  const size = { cols: 80, rows: 24 }
  const styles = (s: Session) => new Set(render(s, size).grid.flat().map(cell => cell.st))
  expect(styles({ ...blank(), state: st }).has('redSrc')).toBe(false)
  const marked = styles({ ...blank(), state: st, hint: { draws: 0, move: { kind: 'tabTab', from: 0, to: 1, count: 1 }, card: c(7, 2) } })
  expect(marked.has('redSrc') && marked.has('srcFrame') && marked.has('blackDst') && marked.has('dstFrame')).toBe(true)
  const chosen = styles({ ...blank(), state: st, sel: { kind: 'col', col: 1, count: 1 } })
  expect(chosen.has('blackSel') && chosen.has('selFrame')).toBe(true)
  st.talon = [c(13, 1, false)]
  const drawn = styles({ ...blank(), state: st, hint: { draws: 1, move: { kind: 'wasteTab', to: 3, count: 1 }, card: c(13, 1) } })
  expect(drawn.has('hintStock') && drawn.has('hintTarget')).toBe(true)
  expect(STYLES.hintStock.color).toBeDefined()
})

test('ein langer Zieh-Tipp weicht einem direkten Zug, wenn die Partie lösbar bleibt', async () => {
  const st = empty()
  st.tab[0] = [c(5, 0, false), c(7, 2)]
  st.tab[1] = [c(8, 3)]
  const planned = { draws: 5, move: { kind: 'wasteFound' as const }, card: c(1, 0) }
  expect(directAlternative(st, EASY, planned, () => true)!.move).toEqual({ kind: 'tabTab', from: 0, to: 1, count: 1 })
  expect(directAlternative(st, EASY, planned, () => false)).toBe(null)
  expect(directAlternative(st, EASY, { ...planned, draws: 1 }, () => true)).toBe(null)
})

// Stellung für die Vereinfachung: Zielstapel bis 10, Bildkarten verteilt, drei Karten im Talon.
const pairState = (kingDown = false): State => ({
  pass: 1,
  found: [10, 10, 10, 10],
  talon: [c(11, 2, false), c(11, 3, false), c(12, 2, false)],
  waste: 0,
  tab: [[c(13, 0, !kingDown), c(12, 1)], [c(13, 3)], [c(11, 1)], [c(12, 0)], [c(13, 1), c(12, 3)], [c(11, 0)], [c(13, 2)]],
})
const tt = (from: number, to: number, count = 1): Move => ({ kind: 'tabTab', from, to, count })
const tf = (from: number): Move => ({ kind: 'tabFound', from })
const DRAW: Move = { kind: 'draw' }
const WF: Move = { kind: 'wasteFound' }
// Q♥ nach Spalte 2 und später zurück; dazwischen nur Züge, die die Spalten 1 und 2 nicht berühren.
const pairSolution: Move[] = [tt(0, 1), DRAW, WF, tt(1, 0), DRAW, WF, tf(2), tf(5), tf(3), tf(0), tf(4), DRAW, WF, tf(0), tf(1), tf(4), tf(6)]

test('simplify streicht ein sinnloses Hin-und-Zurück-Paar, behält aber ein aufdeckendes', async () => {
  const s = pairState()
  const out = simplify(s, EASY, pairSolution)
  expect(out).toEqual(pairSolution.filter((_, i) => i !== 0 && i !== 3))
  let cur: State | null = s
  for (const m of out) {
    const r = apply(cur!, EASY, m)
    expect(r.ok).toBe(true)
    cur = r.ok ? r.state : null
  }
  expect(won(cur!)).toBe(true)
  // K♠ liegt verdeckt unter Q♥: der Hinzug deckt ihn auf, später wandert K♠+Q♥ als Folge in die leere Spalte 6.
  const viaRun: Move[] = [tt(0, 1), DRAW, WF, tt(1, 0), DRAW, WF, tf(2), tf(5), tt(0, 5, 2), tf(3), tf(5), tf(4), DRAW, WF, tf(5), tf(1), tf(4), tf(6)]
  expect(simplify(pairState(true), EASY, viaRun)).toEqual(viaRun)
  expect(simplify(pairState(false), EASY, viaRun)).toEqual(viaRun.filter((_, i) => i !== 0 && i !== 3))
  const r = solve(s, EASY)
  expect(r.verdict).toBe('solvable')
  expect(simplify(s, EASY, r.moves)).toEqual(r.moves)
})

test('rescue nimmt Züge zurück, bis die Stellung wieder lösbar ist', async () => {
  // Historie über drei Ziehen-Züge; „lösbar“ heißt hier: noch mindestens 23 Karten im Stapel.
  const begin = start({ wins: {} }, EASY, 'random', 3)
  let s = begin
  for (let i = 0; i < 3; i++) s = pressDraw(s)
  expect(s.history.length).toBe(3)
  const stock = (st: State) => st.talon.length - st.waste
  const saved = await rescue(s, async st => stock(st) >= 23)
  expect(saved.undone).toBe(2)
  expect(stock(saved.session.state)).toBe(23)
  expect(saved.session.history.length).toBe(1)
  expect(saved.session.moves).toBe(s.moves - 2)
  expect(saved.session.message).toBe('2 moves taken back – solvable again from here.')
  const fine = await rescue(s, async () => true)
  expect(fine.undone).toBe(0)
  expect(fine.session.message).toBe('The position is still solvable.')
  const none = await rescue(s, async () => false)
  expect(none.undone).toBe(0)
  expect(none.session.state).toEqual(s.state)
  expect(none.session.message).toBe('No solvable position found in the history.')
  expect((await rescue(begin, async () => false)).session.message).toBe('No solvable position found in the history.')
  expect((await rescue(pressDraw(begin), async st => stock(st) === 24)).session.message).toBe('1 move taken back – solvable again from here.')
})

test('planHint schiebt einen Tipp auf, der nur den letzten Zug zurücknehmen würde', async () => {
  const st = empty()
  st.talon = [c(1, 2, false)]
  st.tab[0] = [c(13, 0), c(12, 1)]
  st.tab[1] = [c(13, 3)]
  const moved = pressColumn(pressColumn(pressColumn({ ...blank(), state: st }, 0), 0), 1)   // zweimal Spalte 1: nur Q♥ gewählt; dann auf K♣ in Spalte 2
  expect(moved.state.tab[1]!.length).toBe(2)
  const back: Move = { kind: 'tabTab', from: 1, to: 0, count: 1 }
  const prev = moved.history[moved.history.length - 1]!
  // Umkehr, dann Ziehen und A♦ auf den Zielstapel: lieber gleich ziehen.
  expect(planHint(moved.state, moved.rules, [back, { kind: 'draw' }, { kind: 'wasteFound' }], prev)).toEqual({ draws: 1, move: { kind: 'wasteFound' }, card: c(1, 2) })
  // Umkehr, dann ein Zug, der Spalte 1 braucht: die Umkehr ist nötig.
  expect(planHint(moved.state, moved.rules, [back, { kind: 'tabFound', from: 0 }], prev)!.move).toEqual(back)
  // Ohne vorige Stellung bleibt alles beim Alten.
  expect(planHint(moved.state, moved.rules, [back, { kind: 'draw' }, { kind: 'wasteFound' }])!.move).toEqual(back)
})

// ---------- Sprache ----------

test('Deutsch per Option: Pane und Meldungen', { options: { language: 'de' } }, async ($, on) => {
  const { ui, until, press } = await setup($, on)
  expect(await text(ui, /Leicht · Zufall · Züge 0/)).toBe(true)
  press('s')
  expect(await until(/Züge 1/)).toBe(true)
  press('bu')
  expect(await until(/Zug zurückgenommen/)).toBe(true)
  await ui.unmount()
})

test('setLanguage schaltet die Texte der reinen Funktionen um, Standard ist Englisch', async () => {
  const begin = start({ wins: {} }, EASY, 'random', 3)
  expect(begin.message).toBe('New game (Easy, random). Good luck!')
  setLanguage('de')
  try {
    expect(start({ wins: {} }, EASY, 'random', 3).message).toBe('Neues Spiel (Leicht, Zufall). Viel Glück!')
    expect(tx().title).toBe('Solitär')
  } finally {
    setLanguage('en')
  }
  setLanguage('fr')   // unbekannt → Englisch
  expect(tx().title).toBe('Solitaire')
})
