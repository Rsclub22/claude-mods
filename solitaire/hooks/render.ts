// Darstellung wie in solitaire++ (src/render.cpp), aber als Zellraster mit Stilnamen statt ANSI-Text:
// das Pane macht daraus farbige Text-Läufe (`runs`), die Hintergründe 'felt'/'shadow' werden dabei je Zeile aufgelöst. Die Tastenzeilen (s/w/f und 1–7) zeichnet das Pane als Buttons.

import { tx } from './text.ts'
import type { Card, Session, State } from '../types'
import { RANKS, SUITS, UNLIMITED, allFaceUp, canRecycle, isRed, label, rulesName, stockCount } from './game.ts'
import { kindName, winCount } from './session.ts'

export type Style =
  | 'felt' | 'shadow' | 'key' | 'msg' | 'good' | 'empty' | 'emptyRed'
  | 'bar' | 'barTitle' | 'barDim'
  | 'backFrame' | 'backPattern' | 'hintStock' | 'hintTarget'
  | 'black' | 'red' | 'blackSel' | 'redSel' | 'selFrame'
  | 'blackSrc' | 'redSrc' | 'srcFrame' | 'blackDst' | 'redDst' | 'dstFrame'

// Optik wie die Microsoft Solitaire Collection: Filz mit Verlauf (oben und unten dunkler), weiße Karten mit Schatten,
// blaue Rückseiten. Die Hintergründe 'felt' und 'shadow' hängen von der Zeile ab und werden erst in `runs` aufgelöst.
const CARD = '#ffffff'
const BLACK = '#181818'
const RED = '#ce2029'
const BACK = '#1e4a9a'
const SEL = '#fff4c2'
const SRC = '#dcebff'
const DST = '#ddf5dd'
const BAR = '#1e1e1e'
const KEY = '#ffe26e'
const GOOD = '#82f082'

export const STYLES: Record<Style, { color?: string; backgroundColor: string; bold?: boolean }> = {
  felt: { backgroundColor: 'felt' },
  shadow: { backgroundColor: 'shadow' },
  key: { color: KEY, backgroundColor: 'felt', bold: true },
  msg: { color: '#fff1b4', backgroundColor: 'felt' },
  good: { color: GOOD, backgroundColor: 'felt', bold: true },
  empty: { color: '#6ebe78', backgroundColor: 'felt' },
  emptyRed: { color: '#d67878', backgroundColor: 'felt' },
  bar: { backgroundColor: BAR },
  barTitle: { color: '#ffffff', backgroundColor: BAR, bold: true },
  barDim: { color: '#b9b9b9', backgroundColor: BAR },
  backFrame: { color: '#f0f4fa', backgroundColor: BACK },
  backPattern: { color: '#3468be', backgroundColor: BACK },
  hintStock: { color: KEY, backgroundColor: BACK, bold: true },
  hintTarget: { color: GOOD, backgroundColor: 'felt', bold: true },
  black: { color: BLACK, backgroundColor: CARD },
  red: { color: RED, backgroundColor: CARD },
  blackSel: { color: BLACK, backgroundColor: SEL },
  redSel: { color: RED, backgroundColor: SEL },
  selFrame: { color: '#d69e00', backgroundColor: SEL },
  blackSrc: { color: BLACK, backgroundColor: SRC },
  redSrc: { color: RED, backgroundColor: SRC },
  srcFrame: { color: '#3b82f6', backgroundColor: SRC },
  blackDst: { color: BLACK, backgroundColor: DST },
  redDst: { color: RED, backgroundColor: DST },
  dstFrame: { color: '#2ea043', backgroundColor: DST },
}

const FELT_EDGE = [18, 84, 40] as const
const FELT_MID = [36, 132, 62] as const
const hex = (rgb: number[]) => '#' + rgb.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')
const feltRgb = (y: number, rows: number): number[] => {
  const t = rows > 1 ? y / (rows - 1) : 0
  const k = 1 - Math.abs(2 * t - 1)
  return FELT_EDGE.map((e, i) => Math.round(e + (FELT_MID[i]! - e) * k))
}
/** Filzfarbe der Zeile y von `rows` Zeilen (Rand dunkler, Mitte heller). */
export const feltAt = (y: number, rows: number): string => hex(feltRgb(y, rows))
/** Schattenfarbe der Zeile y. */
export const shadowAt = (y: number, rows: number): string => hex(feltRgb(y, rows).map(v => Math.round(v * 0.55)))

export type Size = { cols: number; rows: number }
export type Flags = { solving?: boolean; checking?: boolean; demo?: boolean; preview?: 'none' | 'running' | 'done'; prompt?: 'none' | 'rules' | 'kind' }

export type Layout = {
  w: number      // Kartenbreite
  h: number      // Kartenhöhe
  od: number     // sichtbare Zeilen je verdeckter Karte unter anderen
  ou: number     // sichtbare Zeilen je offener Karte unter anderen
  gap: number
  left: number
  avail: number  // Zeilen für die Spalten
}

export const MIN_COLS = 5 * 7 + 6 + 2   // 43
export const MIN_ROWS = 3 + 7 + 1       // 11: Kopf, Leerzeile, Tasten, Karten, Nummern, Spalten, Meldung
export const LABEL_Y = 2
export const TOP_Y = 3

// ---------- Zellraster ----------
export type Cell = { ch: string; st: Style }
export type Grid = Cell[][]

export const makeGrid = (size: Size): Grid =>
  Array.from({ length: size.rows }, () => Array.from({ length: size.cols }, () => ({ ch: ' ', st: 'felt' as Style })))

export const cloneGrid = (g: Grid): Grid => g.map(row => row.map(c => ({ ...c })))

const put = (g: Grid, x: number, y: number, text: string, st: Style): void => {
  const row = g[y]
  if (!row) return
  let i = x
  for (const ch of text) {
    if (i >= 0 && i < row.length) row[i] = { ch, st }
    i++
  }
}

export type Run = { text: string; color?: string; backgroundColor: string; bold?: boolean }

/** Eine Zeile als Folge gleich gestalteter Läufe; 'felt' und 'shadow' werden für Zeile y aufgelöst. */
export const runs = (row: Cell[], y: number, rows: number): Run[] => {
  const out: Run[] = []
  let lastSt: Style | null = null
  for (const c of row) {
    const last = out[out.length - 1]
    if (last && lastSt === c.st) {
      last.text += c.ch
      continue
    }
    const st = STYLES[c.st]
    const bg = st.backgroundColor === 'felt' ? feltAt(y, rows) : st.backgroundColor === 'shadow' ? shadowAt(y, rows) : st.backgroundColor
    const run: Run = { text: c.ch, backgroundColor: bg }
    if (st.color) run.color = st.color
    if (st.bold) run.bold = true
    out.push(run)
    lastSt = c.st
  }
  return out
}

export const plain = (g: Grid): string[] => g.map(row => row.map(c => c.ch).join(''))

// ---------- Karten als Raster (Zeichen + Stil je Zelle) ----------
const width = (s: string): number => [...s].length
const clip = (s: string, w: number) => [...s].slice(0, Math.max(0, w)).join('')

const blankGlyphs = (w: number, h: number, st: Style): Grid => Array.from({ length: h }, () => Array.from({ length: w }, () => ({ ch: ' ', st })))

const setText = (g: Grid, x: number, y: number, text: string, st: Style): void => {
  const row = g[y]
  if (!row) return
  let i = x
  for (const ch of text) {
    if (i >= 0 && i < row.length) row[i] = { ch, st }
    i++
  }
}

/** Runder Rahmen um ein w×h-Raster. */
const frame = (g: Grid, w: number, h: number, st: Style): void => {
  setText(g, 0, 0, '╭', st)
  setText(g, w - 1, 0, '╮', st)
  setText(g, 0, h - 1, '╰', st)
  setText(g, w - 1, h - 1, '╯', st)
  for (let x = 1; x < w - 1; x++) {
    setText(g, x, 0, '─', st)
    setText(g, x, h - 1, '─', st)
  }
  for (let y = 1; y < h - 1; y++) {
    setText(g, 0, y, '│', st)
    setText(g, w - 1, y, '│', st)
  }
}

// Ein Kartenraster ist (w+1)×(h+1) groß: Spalte w und Zeile h tragen den Schatten, die Ecken oben rechts und
// unten links bleiben frei (null = nicht malen).
type Shadowed = (Cell | null)[][]
const withShadow = (g: Grid): Shadowed => {
  const w = g[0]!.length
  const out: Shadowed = g.map((row, y) => [...row, y === 0 ? null : { ch: ' ', st: 'shadow' as Style }])
  out.push([null, ...Array.from({ length: w }, (): Cell => ({ ch: ' ', st: 'shadow' }))])
  return out
}

// ---------- Blockschrift: Rang groß auf der Karte ----------
type Block = readonly [string, string, string]   // drei Zeilen gleicher Breite
const RANK_FONT: Block[] = [
  ['   ', '   ', '   '],
  ['▄▀▄', '█▀█', '▀ ▀'],   // A
  ['▀▀█', '▄▀▀', '█▄▄'],   // 2
  ['▀▀█', ' ▀█', '▄▄█'],   // 3
  ['█ █', '▀▀█', '  █'],   // 4
  ['█▀▀', '▀▀█', '▄▄█'],   // 5
  ['█▀▀', '█▀█', '█▄█'],   // 6
  ['▀▀█', ' ▄▀', '▄▀ '],   // 7
  ['█▀█', '█▀█', '█▄█'],   // 8
  ['█▀█', '▀▀█', '▄▄█'],   // 9
  ['▄█  █▀█', ' █  █ █', '▄█▄ █▄█'],   // 10
  ['▀▀█', '  █', '█▄▀'],   // J
  ['▄▀▄', '█ █', '▀▀█'],   // Q
  ['█ █', '█▀▄', '█ █'],   // K
]
// Schmale 10 für die Ecke der großen Karten, damit neben ihr Platz für Pips bleibt.
const TEN_NARROW: Block = ['█ █▀█', '█ █ █', '█ █▄█']
// Farben ♠ ♥ ♦ ♣, 5 und 3 Zellen breit.
const SUIT_BIG: Block[] = [
  [' ▄█▄ ', '█████', '▀▀█▀▀'],
  ['▄█▄█▄', '▀███▀', ' ▀█▀ '],
  ['  ▄  ', '▄███▄', ' ▀█▀ '],
  [' ▄█▄ ', '█▄█▄█', ' ▀█▀ '],
]
const SUIT_SMALL: Block[] = [
  ['▄█▄', '███', '▀█▀'],
  ['█▄█', '███', '▀█▀'],
  [' ▄ ', '███', ' ▀ '],
  ['▄█▄', '█▄█', '▀█▀'],
]

// ---------- Pips: Farbsymbole wie auf echten Karten ----------
// Raster aus drei Spalten (L, C, R) und fünf Zeilen (0 oben … 4 unten); je Rang die belegten Felder.
type Pip = readonly [col: number, row: number]
const LR = (rows: number[]): Pip[] => rows.flatMap((r): Pip[] => [[0, r], [2, r]])
const CC = (rows: number[]): Pip[] => rows.map((r): Pip => [1, r])
const PIPS: Record<number, Pip[]> = {
  2: CC([0, 4]),
  3: CC([0, 2, 4]),
  4: LR([0, 4]),
  5: [...LR([0, 4]), ...CC([2])],
  6: LR([0, 2, 4]),
  7: [...LR([0, 2, 4]), ...CC([1])],
  8: [...LR([0, 2, 4]), ...CC([1, 3])],
  9: [...LR([0, 1, 3, 4]), ...CC([2])],
  10: LR([0, 1, 2, 3, 4]),
}

// Aufteilung der großen Karten (Innenmaße 11×7 und 9×5): Zeile 1 der einzeilige Index (in Stapeln die einzige
// sichtbare Zeile), darunter der Rang in Blockschrift, rechts daneben die Pips bzw. bei A/J/Q/K das Farbsymbol.
type BigPlan = { pipX: [number, number, number]; tenX: [number, number]; pipY: number; suitX: number; suitY: number; suitBig: boolean; bottomIndex: boolean }
const BIG_PLANS: Record<number, BigPlan> = {
  13: { pipX: [6, 8, 10], tenX: [7, 10], pipY: 2, suitX: 6, suitY: 2, suitBig: true, bottomIndex: true },
  11: { pipX: [5, 7, 9], tenX: [7, 9], pipY: 1, suitX: 6, suitY: 2, suitBig: false, bottomIndex: false },
}

const drawBlock = (g: Grid, x: number, y: number, block: Block, st: Style): void => block.forEach((line, i) => setText(g, x, y + i, line, st))

type Mark = 'none' | 'selected' | 'source' | 'target'
const faceStyles = (c: Card, mark: Mark): { ink: Style; frame: Style } => {
  const red = isRed(c)
  switch (mark) {
    case 'selected': return { ink: red ? 'redSel' : 'blackSel', frame: 'selFrame' }
    case 'source': return { ink: red ? 'redSrc' : 'blackSrc', frame: 'srcFrame' }
    case 'target': return { ink: red ? 'redDst' : 'blackDst', frame: 'dstFrame' }
    default: return { ink: red ? 'red' : 'black', frame: red ? 'red' : 'black' }
  }
}

/** Welche Rolle die Karte `row` der Spalte `col` im Tipp spielt. */
const hintMark = (s: Session, col: number, row: number): Mark => {
  const h = s.hint
  if (!h) return 'none'
  const pile = s.state.tab[col]!
  const last = row === pile.length - 1
  if (h.draws === 0 && h.move.kind === 'tabTab' && h.move.from === col && row >= pile.length - (h.move.count ?? 1)) return 'source'
  if (h.draws === 0 && h.move.kind === 'tabFound' && h.move.from === col && last) return 'source'
  if ((h.move.kind === 'tabTab' || h.move.kind === 'wasteTab') && h.move.to === col && last) return 'target'
  return 'none'
}

const faceGlyphs = (c: Card, w: number, h: number, mark: Mark): Shadowed => {
  const { ink, frame: frameSt } = faceStyles(c, mark)
  const g = blankGlyphs(w, h, ink)
  frame(g, w, h, frameSt)
  const lab = label(c)
  const sym = SUITS[c.s]!
  const iw = w - 2
  const ih = h - 2
  setText(g, 1, 1, lab, ink)
  const big = BIG_PLANS[w]
  if (big) {
    drawBlock(g, 1, 2, c.r === 10 ? TEN_NARROW : RANK_FONT[c.r]!, ink)
    if (big.bottomIndex) {
      const mirrored = `${sym} ${RANKS[c.r]!}`   // mit Leerzeichen: breite Symbol-Glyphen laufen sonst ins Zeichen
      setText(g, 1 + iw - width(mirrored), ih, mirrored, ink)
    }
    const pips = PIPS[c.r]
    if (pips) {
      const xs = c.r === 10 ? [big.tenX[0], 0, big.tenX[1]] : big.pipX
      for (const [col, row] of pips) setText(g, xs[col]!, big.pipY + row, sym, ink)
    } else {
      drawBlock(g, big.suitX, big.suitY, (big.suitBig ? SUIT_BIG : SUIT_SMALL)[c.s]!, ink)
    }
    return withShadow(g)
  }
  if (w === 9) {
    // Innenmaß 7×4: Rang in Blockschrift, kleines Farbsymbol daneben (bei der breiten 10 keins).
    drawBlock(g, 1, 2, RANK_FONT[c.r]!, ink)
    if (c.r !== 10) drawBlock(g, 5, 2, SUIT_SMALL[c.s]!, ink)
    return withShadow(g)
  }
  // 7×5 und 5×3: Index oben links, Farbsymbol mittig, bei 7×5 Index unten rechts.
  if (h >= 5) {
    setText(g, 1 + iw - width(lab), ih, lab, ink)
    setText(g, 1 + Math.floor((iw - 1) / 2), Math.floor((h - 1) / 2), sym, ink)
  }
  return withShadow(g)
}

/** Rückseite: blaue Fläche, heller Rahmen, Rautenmuster. */
const backGlyphs = (w: number, h: number, hinted = false): Shadowed => {
  const g = blankGlyphs(w, h, 'backPattern')
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if ((x + y) % 2 === 0) g[y]![x] = { ch: '◆', st: 'backPattern' }
  frame(g, w, h, hinted ? 'hintStock' : 'backFrame')
  return withShadow(g)
}

/** Leerer Platz: runder Rahmen auf dem Filz, wahlweise mit Symbol in der Mitte. */
const emptyGlyphs = (w: number, h: number, lab: string, st: Style): Grid => {
  const g = blankGlyphs(w, h, 'felt')
  frame(g, w, h, st)
  if (lab) setText(g, 1 + Math.floor((w - 2 - width(lab)) / 2), Math.floor((h - 1) / 2), lab, st)
  return g
}

/** Zeilen `from` bis `to` (exklusiv) eines Rasters ab Bildschirmzeile y malen, nicht über yMax hinaus. */
const blit = (g: Grid, x: number, y: number, src: Shadowed, from: number, to: number, yMax: number): void => {
  for (let i = from; i < to && i < src.length; i++) {
    const row = y + i - from
    if (row >= yMax) return
    const dst = g[row]
    if (!dst) continue
    src[i]!.forEach((cell, k) => {
      const col = x + k
      if (cell && col >= 0 && col < dst.length) dst[col] = cell
    })
  }
}

/** Eine ganze Karte samt Schattenzeile. */
const drawCard = (g: Grid, x: number, y: number, c: Card, L: Layout, mark: Mark, yMax: number): void =>
  blit(g, x, y, c.up ? faceGlyphs(c, L.w, L.h, mark) : backGlyphs(L.w, L.h), 0, L.h + 1, yMax)

const drawEmpty = (g: Grid, x: number, y: number, L: Layout, lab: string, st: Style): void =>
  blit(g, x, y, emptyGlyphs(L.w, L.h, lab, st), 0, L.h, g.length)

/** Für die Siegesanimation: eine offene Karte (r 0: leerer Zielstapel ihrer Farbe) ins Raster malen, beschnitten. */
export const stamp = (g: Grid, c: Card, x: number, y: number, L: Layout): void => {
  if (c.r === 0) drawEmpty(g, x, y, L, SUITS[c.s]!, isRed(c) ? 'emptyRed' : 'empty')
  else blit(g, x, y, faceGlyphs(c, L.w, L.h, 'none').map(row => row.slice(0, L.w)), 0, L.h, g.length)
}

// ---------- Layout ----------
export const columnX = (L: Layout, col: number): number => L.left + col * (L.w + L.gap)

export const layoutFor = (size: Size, s: State): Layout => {
  const sizes = [[13, 9], [11, 7], [9, 6], [7, 5], [5, 3]] as const
  const gap = 1
  const fixed = 5   // Kopfzeile, Leerzeile, Tastenzeile, Spaltennummern, Meldung
  const piles = s.tab.map(p => {
    const down = p.filter(c => !c.up).length
    return { down, up: p.length - down }
  })
  let fallback: Layout = { w: 5, h: 3, od: 1, ou: 1, gap, left: 0, avail: 0 }
  for (const [w, h] of sizes) {
    const board = 7 * w + 6 * gap
    if (board + 2 > size.cols) continue
    const avail = size.rows - h - fixed
    const left = Math.floor((size.cols - board) / 2)
    for (const [od, ou] of [[2, 2], [1, 2], [1, 1]] as const) {
      let need: number = h
      for (const p of piles) need = Math.max(need, p.down * od + Math.max(0, p.up - 1) * ou + h)
      const L: Layout = { w, h, od, ou, gap, left, avail }
      if (need <= avail) return L
      fallback = L
    }
  }
  return fallback
}

// ---------- Texte ----------
const header = (s: Session): string => {
  let out = `${rulesName(s.rules)} · ${kindName(s.kind)} · ${tx().moves(s.moves)}`
  if (s.rules.passes !== UNLIMITED) out += ` · ${tx().passOf(s.state.pass, s.rules.passes)}`
  return out + ` · ${tx().wins(winCount(s))}`
}

export type Board = { grid: Grid; layout: Layout; numY: number; tooSmall: boolean }

export const render = (s: Session, size: Size, flags: Flags = {}): Board => {
  const grid = makeGrid(size)
  const st = s.state
  const L = layoutFor(size, st)
  if (size.cols < MIN_COLS || size.rows < MIN_ROWS) {
    const msg = clip(tx().paneTooSmall(MIN_COLS, MIN_ROWS + 2), size.cols)
    put(grid, Math.max(0, Math.floor((size.cols - width(msg)) / 2)), Math.floor(size.rows / 2), msg, 'msg')
    return { grid, layout: L, numY: -1, tooSmall: true }
  }
  const colX = (i: number) => columnX(L, i)

  // Kopfzeile als dunkler Balken
  put(grid, 0, 0, ' '.repeat(size.cols), 'bar')
  put(grid, L.left, 0, tx().title, 'barTitle')
  const head = flags.demo ? `${tx().demo} · ${rulesName(s.rules)} · ${kindName(s.kind)}` : header(s)
  put(grid, L.left + 10, 0, clip(head, size.cols - L.left - 10), 'barDim')

  // Stapel, Ablage, Zielstapel (die Tastenzeile darüber zeichnet das Pane).
  const drawHint = !!s.hint && s.hint.draws > 0
  if (stockCount(st) > 0) blit(grid, colX(0), TOP_Y, backGlyphs(L.w, L.h, drawHint), 0, L.h + 1, size.rows)
  else drawEmpty(grid, colX(0), TOP_Y, L, canRecycle(st, s.rules) ? '↻' : '', drawHint ? 'hintTarget' : 'empty')

  // Ablage als Fächer: die letzten `draw` Karten, nur die oberste wählbar.
  const shown = Math.min(st.waste, s.rules.draw)
  const compact = L.w < 7
  const fan = compact ? 3 : 4
  if (shown === 0) drawEmpty(grid, colX(1), TOP_Y, L, '', 'empty')
  for (let i = 0, x = colX(1); i < shown; i++) {
    const c = st.talon[st.waste - shown + i]!
    if (i === shown - 1) {
      const wasteSrc = !!s.hint && s.hint.draws === 0 && (s.hint.move.kind === 'wasteTab' || s.hint.move.kind === 'wasteFound')
      drawCard(grid, x, TOP_Y, c, L, s.sel?.kind === 'waste' ? 'selected' : wasteSrc ? 'source' : 'none', size.rows)
    } else if (compact && i > 0) {
      blit(grid, x, TOP_Y, faceGlyphs(c, L.w, L.h, 'none').map(row => row.slice(1, 1 + fan)), 0, L.h, size.rows)
      x += fan
    } else {
      drawCard(grid, x, TOP_Y, c, L, 'none', size.rows)
      x += compact ? 1 + fan : fan
    }
  }

  for (let suit = 0; suit < 4; suit++) {
    const x = colX(3 + suit)
    const n = st.found[suit]!
    const foundDst = !!s.hint && (s.hint.move.kind === 'tabFound' || s.hint.move.kind === 'wasteFound') && s.hint.card.s === suit
    if (n > 0) drawCard(grid, x, TOP_Y, { r: n, s: suit, up: true }, L, foundDst ? 'target' : 'none', size.rows)
    else drawEmpty(grid, x, TOP_Y, L, SUITS[suit]!, foundDst ? 'hintTarget' : isRed(suit) ? 'emptyRed' : 'empty')
  }

  // Spalten
  const numY = TOP_Y + L.h
  const tabY = numY + 1
  const yMax = size.rows - 1
  for (let col = 0; col < 7; col++) {
    const pile = st.tab[col]!
    const x = colX(col)
    if (pile.length === 0) {
      const colDst = !!s.hint && (s.hint.move.kind === 'tabTab' || s.hint.move.kind === 'wasteTab') && s.hint.move.to === col
      drawEmpty(grid, x, tabY, L, '', colDst ? 'hintTarget' : 'empty')
      continue
    }
    let y = tabY
    for (let row = 0; row < pile.length; row++) {
      const c = pile[row]!
      const selected = s.sel?.kind === 'col' && s.sel.col === col && row >= pile.length - s.sel.count
      const mark: Mark = selected ? 'selected' : hintMark(s, col, row)
      if (row === pile.length - 1) {
        drawCard(grid, x, y, c, L, mark, yMax)
        break
      }
      const o = c.up ? L.ou : L.od
      const from = o === 1 ? 1 : 0   // eine Zeile Überlappung: Inhaltszeile statt Oberkante
      blit(grid, x, y, c.up ? faceGlyphs(c, L.w, L.h, mark) : backGlyphs(L.w, L.h), from, from + o, yMax)
      y += o
    }
  }

  // Meldung in der letzten Zeile, linksbündig zum Brett, bei Platzmangel weiter links.
  const line = (t: string, stl: Style) => {
    const cut = clip(t, size.cols)
    put(grid, Math.max(0, Math.min(L.left, size.cols - width(cut))), size.rows - 1, cut, stl)
  }
  const prompt = flags.prompt ?? 'none'
  const T = tx()
  if (prompt === 'rules') line(T.chooseRules, 'key')
  else if (prompt === 'kind') line(T.chooseKind, 'key')
  else if (flags.demo && flags.checking) line(T.demoSeeking, 'good')
  else if (flags.demo) line(T.demoRunning, 'good')
  else if (flags.checking) line(T.checking, 'good')
  else if (flags.preview === 'done') line(T.previewDone, 'good')
  else if (flags.preview === 'running') line(T.previewRunning, 'good')
  else if (flags.solving) line(T.solving, 'good')
  else if (!s.message && !s.won && allFaceUp(st)) line(T.allFaceUp, 'good')
  else line(s.message, s.won ? 'good' : 'msg')
  return { grid, layout: L, numY, tooSmall: false }
}
