// Alle Texte, die Spieler sehen, in Englisch (Standard) und Deutsch. Die Sprache wählt die Plugin-Option `language`;
// `setLanguage` setzt sie beim Laden, `tx()` liefert die aktive Tabelle.
//
// Neue Sprache: 1. `Lang` um das Kürzel erweitern, 2. eine Tabelle vom Typ `Texts` anlegen (der Compiler meldet jeden
// fehlenden Eintrag), 3. in `TEXTS` eintragen, 4. das Kürzel in plugin.json unter userConfig.language.options ergänzen.

import type { DealKind, Rules } from '../types'

export type Lang = 'en' | 'de'

export type Texts = {
  title: string
  commandDescription: string
  tooNarrow: string
  opened: string
  rules: { easy: string; medium: string; hard: string; custom: string }
  kind: { checked: string; random: string }
  moves: (n: number) => string
  wins: (n: number) => string
  passOf: (n: number, of: number) => string
  demo: string
  // Regeln (game.ts)
  noFit: string
  noPasses: string
  noSuchColumn: string
  noStock: string
  labels: { waste: string; foundation: string }
  wasteEmpty: string
  notThatMany: string
  drawCards: string
  turnWaste: string
  wasteToFound: (card: string) => string
  wasteToCol: (card: string, col: number) => string
  colToFound: (card: string, col: number) => string
  colToCol: (card: string, extra: number, from: number, to: number) => string
  // Sitzung (session.ts)
  newGame: (rules: string, kind: string) => string
  solvedAssisted: (moves: number) => string
  won: (moves: number) => string
  wasteBack: string
  pass: (next: number, of: number) => string
  columnEmpty: string
  selectedRun: (run: number, col: number) => string
  selectedCount: (count: number) => string
  nothingBackToWaste: string
  wasteEmptyDraw: string
  onlySingleToFound: string
  nothingFits: string
  played: (n: number) => string
  gameWon: string
  nothingToUndo: string
  undone: string
  stillSolvable: string
  noSolvableInHistory: string
  rescued: (n: number) => string
  hintDraw: (n: number, rest: string) => string
  uncovers: string
  hintPrefix: string
  suggestionPrefix: string
  // Statuszeile (render.ts)
  chooseRules: string
  chooseKind: string
  demoSeeking: string
  demoRunning: string
  checking: string
  previewDone: string
  previewRunning: string
  solving: string
  allFaceUp: string
  paneTooSmall: (cols: number, rows: number) => string
  // Pane (register.tsx)
  autoStopped: string
  thatWasSolution: string
  noSolutionFrom: string
  uncoverFirst: string
  noSolution: string
  noMoves: string
  searchingSolvable: string
  verdict: { solvable: string; unsolvable: string; unknown: string }
  previousDeal: (verdict: string) => string
  buttons: {
    easy: [string, string]
    medium: [string, string]
    hard: [string, string]
    cancel: [string, string]
    checked: [string, string]
    random: [string, string]
    solver: [string, string]
    auto: [string, string]
    hint: [string, string]
    rescue: [string, string]
    demo: [string, string]
    undo: [string, string]
    clear: [string, string]
    newGame: [string, string]
    close: [string, string]
  }
  before: (rules: string, kind: string) => string
  rulesHint: (rules: string) => string
  help: { noFocus: string; demoRunning: string; animation: string; keysWide: string; keysNarrow: string }
}

const en: Texts = {
  title: 'Solitaire',
  commandDescription: 'Play Solitaire (Klondike) in a pane',
  tooNarrow: 'Solitaire: widen the terminal, then the pane opens.',
  opened: 'Solitaire opened. Keys apply while the pane has the focus (ctrl+x, then Tab, or click).',
  rules: { easy: 'Easy', medium: 'Medium', hard: 'Hard', custom: 'Custom' },
  kind: { checked: 'checked', random: 'random' },
  moves: n => `Moves ${n}`,
  wins: n => `Wins ${n}`,
  passOf: (n, of) => `Pass ${n}/${of}`,
  demo: 'Demo',
  noFit: "That doesn't fit there.",
  noPasses: 'No passes left: the stock stays empty.',
  noSuchColumn: 'There is no such column.',
  noStock: 'No cards left in the stock.',
  labels: { waste: 'Waste', foundation: 'Found.' },
  wasteEmpty: 'The waste is empty.',
  notThatMany: 'Not that many face-up cards there.',
  drawCards: 'draw card(s)',
  turnWaste: 'turn the waste over',
  wasteToFound: card => `${card} from the waste to the foundation`,
  wasteToCol: (card, col) => `${card} from the waste to column ${col}`,
  colToFound: (card, col) => `${card} from column ${col} to the foundation`,
  colToCol: (card, extra, from, to) => `${card}${extra > 0 ? ` (+${extra} cards)` : ''} from column ${from} to column ${to}`,
  newGame: (rules, kind) => `New game (${rules}, ${kind}). Good luck!`,
  solvedAssisted: moves => `Solved in ${moves} ${moves === 1 ? 'move' : 'moves'} (with the solver).`,
  won: moves => `Won in ${moves} ${moves === 1 ? 'move' : 'moves'}!`,
  wasteBack: 'Waste returned to the stock.',
  pass: (next, of) => `Pass ${next} of ${of}${next === of ? ', the last' : ''}.`,
  columnEmpty: 'This column is empty.',
  selectedRun: (run, col) => `${run} cards selected. Press ${col} again: one fewer.`,
  selectedCount: count => `${count} card(s) selected.`,
  nothingBackToWaste: 'Nothing can go back onto the waste.',
  wasteEmptyDraw: 'The waste is empty. s draws a card.',
  onlySingleToFound: 'Only single cards can go to the foundations.',
  nothingFits: 'Nothing fits the foundations right now.',
  played: n => `${n} card(s) played to the foundations.`,
  gameWon: 'The game is won. n starts a new one.',
  nothingToUndo: 'Nothing to undo.',
  undone: 'Move taken back.',
  stillSolvable: 'The position is still solvable.',
  noSolvableInHistory: 'No solvable position found in the history.',
  rescued: n => `${n} ${n === 1 ? 'move' : 'moves'} taken back – solvable again from here.`,
  hintDraw: (n, rest) => `draw ${n}×, then ${rest}`,
  uncovers: ' – uncovers a card',
  hintPrefix: 'Hint: ',
  suggestionPrefix: 'No sure solution found – suggestion: ',
  chooseRules: 'New game – choose rules (below), c cancels',
  chooseKind: 'New game – choose the deal (below), c cancels',
  demoSeeking: 'Demo: looking for a deal …',
  demoRunning: 'Demo running … any key ends it.',
  checking: 'Checking the deal …',
  previewDone: 'Solution shown – returning to the position.',
  previewRunning: 'Showing the solution … (any key stops it)',
  solving: 'Auto-solve running … (any key stops it)',
  allFaceUp: 'All face up: l plays out the solution.',
  paneTooSmall: (cols, rows) => `Pane too small (at least ${cols}×${rows})`,
  autoStopped: 'Auto-solve stopped.',
  thatWasSolution: 'That was the solution. Your turn.',
  noSolutionFrom: 'No solution found from this position.',
  uncoverFirst: 'Uncover all cards in the columns first.',
  noSolution: 'No solution found.',
  noMoves: 'No moves left – u takes back, n starts anew.',
  searchingSolvable: 'Looking for the last solvable position …',
  verdict: { solvable: 'solvable', unsolvable: 'unsolvable', unknown: 'undecided' },
  previousDeal: verdict => ` The previous deal was ${verdict}.`,
  buttons: {
    easy: ['Easy (1 card)', 'Easy'],
    medium: ['Medium (3 cards)', 'Medium'],
    hard: ['Hard (3 cards, 3 passes)', 'Hard'],
    cancel: ['cancel', 'cancel'],
    checked: ['checked solvable', 'checked'],
    random: ['random', 'random'],
    solver: ['Solver', 'Solver'],
    auto: ['Auto-solve', 'Auto'],
    hint: ['Hint', 'Hint'],
    rescue: ['Rescue', 'Resc.'],
    demo: ['Demo', 'Demo'],
    undo: ['undo', 'undo'],
    clear: ['clear selection', 'clear'],
    newGame: ['new game', 'new'],
    close: ['Close', 'Quit'],
  },
  before: (rules, kind) => `So far: ${rules} · ${kind}`,
  rulesHint: rules => `Rules: ${rules} · Checked deals were solved by the solver first.`,
  help: {
    noFocus: 'Pane has no focus: ctrl+x, then Tab (or click).',
    demoRunning: 'Demo running: one of the keys above ends it.',
    animation: 'One of the keys above ends the animation.',
    keysWide: '1–7 column (again: one card fewer) · s draw · w waste · f foundation (no selection: everything that fits)',
    keysNarrow: '1–7 column · s draw · w waste · f foundation',
  },
}

const de: Texts = {
  title: 'Solitär',
  commandDescription: 'Solitär (Klondike) in einem Pane spielen',
  tooNarrow: 'Solitär: Terminal breiter machen, dann öffnet sich das Pane.',
  opened: 'Solitär geöffnet. Tasten gelten, solange das Pane den Fokus hat (ctrl+x, dann Tab, oder Klick).',
  rules: { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer', custom: 'Eigene' },
  kind: { checked: 'geprüft', random: 'Zufall' },
  moves: n => `Züge ${n}`,
  wins: n => `Siege ${n}`,
  passOf: (n, of) => `Durchgang ${n}/${of}`,
  demo: 'Demo',
  noFit: 'Das passt dort nicht.',
  noPasses: 'Keine Durchgänge mehr: der Stapel bleibt leer.',
  noSuchColumn: 'Diese Spalte gibt es nicht.',
  noStock: 'Keine Karten mehr im Stapel.',
  labels: { waste: 'Ablage', foundation: 'Ziel' },
  wasteEmpty: 'Die Ablage ist leer.',
  notThatMany: 'So viele offene Karten liegen dort nicht.',
  drawCards: 'Karte(n) ziehen',
  turnWaste: 'Ablage umdrehen',
  wasteToFound: card => `${card} von der Ablage auf den Zielstapel`,
  wasteToCol: (card, col) => `${card} von der Ablage auf Spalte ${col}`,
  colToFound: (card, col) => `${card} von Spalte ${col} auf den Zielstapel`,
  colToCol: (card, extra, from, to) => `${card}${extra > 0 ? ` (+${extra} Karten)` : ''} von Spalte ${from} auf Spalte ${to}`,
  newGame: (rules, kind) => `Neues Spiel (${rules}, ${kind}). Viel Glück!`,
  solvedAssisted: moves => `Gelöst in ${moves} ${moves === 1 ? 'Zug' : 'Zügen'} (mit Löser).`,
  won: moves => `Gewonnen in ${moves} ${moves === 1 ? 'Zug' : 'Zügen'}!`,
  wasteBack: 'Ablage zurück in den Stapel.',
  pass: (next, of) => `Durchgang ${next} von ${of}${next === of ? ', der letzte' : ''}.`,
  columnEmpty: 'Diese Spalte ist leer.',
  selectedRun: (run, col) => `${run} Karten gewählt. Nochmal ${col} drücken: eine weniger.`,
  selectedCount: count => `${count} Karte(n) gewählt.`,
  nothingBackToWaste: 'Auf die Ablage kann nichts zurück.',
  wasteEmptyDraw: 'Die Ablage ist leer. s zieht eine Karte.',
  onlySingleToFound: 'Nur einzelne Karten können auf den Ablagestapel.',
  nothingFits: 'Nichts passt gerade auf die Ablagestapel.',
  played: n => `${n} Karte(n) abgelegt.`,
  gameWon: 'Das Spiel ist gewonnen. n startet ein neues.',
  nothingToUndo: 'Nichts rückgängig zu machen.',
  undone: 'Zug zurückgenommen.',
  stillSolvable: 'Die Stellung ist noch lösbar.',
  noSolvableInHistory: 'Keine lösbare Stellung in der Historie gefunden.',
  rescued: n => `${n} ${n === 1 ? 'Zug' : 'Züge'} zurückgenommen – ab hier ist es wieder lösbar.`,
  hintDraw: (n, rest) => `Ziehe ${n}×, dann ${rest}`,
  uncovers: ' – deckt eine Karte auf',
  hintPrefix: 'Tipp: ',
  suggestionPrefix: 'Keine sichere Lösung gefunden – Vorschlag: ',
  chooseRules: 'Neues Spiel – Regeln wählen (unten), c bricht ab',
  chooseKind: 'Neues Spiel – Blatt wählen (unten), c bricht ab',
  demoSeeking: 'Demo: Blatt wird gesucht …',
  demoRunning: 'Demo läuft … Taste beendet.',
  checking: 'Blatt wird geprüft …',
  previewDone: 'Lösung gezeigt – gleich zurück zur Stellung.',
  previewRunning: 'Lösung wird gezeigt … (beliebige Taste bricht ab)',
  solving: 'Auto-Lösen läuft … (beliebige Taste hält an)',
  allFaceUp: 'Alles aufgedeckt: l spielt die Lösung ab.',
  paneTooSmall: (cols, rows) => `Pane zu klein (mindestens ${cols}×${rows})`,
  autoStopped: 'Auto-Lösen angehalten.',
  thatWasSolution: 'Das war die Lösung. Jetzt bist du dran.',
  noSolutionFrom: 'Aus dieser Stellung keine Lösung gefunden.',
  uncoverFirst: 'Erst alle Karten in den Spalten aufdecken.',
  noSolution: 'Keine Lösung gefunden.',
  noMoves: 'Keine Züge mehr möglich – u nimmt zurück, n beginnt neu.',
  searchingSolvable: 'Suche die letzte lösbare Stellung …',
  verdict: { solvable: 'lösbar', unsolvable: 'unlösbar', unknown: 'unentschieden' },
  previousDeal: verdict => ` Das vorige Blatt war ${verdict}.`,
  buttons: {
    easy: ['Leicht (1 Karte)', 'Leicht'],
    medium: ['Mittel (3 Karten)', 'Mittel'],
    hard: ['Schwer (3 Karten, 3 Durchgänge)', 'Schwer'],
    cancel: ['abbrechen', 'abbr.'],
    checked: ['geprüft lösbar', 'geprüft'],
    random: ['Zufall', 'Zufall'],
    solver: ['Löser', 'Löser'],
    auto: ['Auto-Lösen', 'Auto'],
    hint: ['Tipp', 'Tipp'],
    rescue: ['Rettung', 'Rett.'],
    demo: ['Demo', 'Demo'],
    undo: ['zurück', 'zurück'],
    clear: ['Auswahl weg', 'weg'],
    newGame: ['neues Spiel', 'neu'],
    close: ['Schließen', 'Ende'],
  },
  before: (rules, kind) => `Bisher: ${rules} · ${kind}`,
  rulesHint: rules => `Regeln: ${rules} · Geprüfte Blätter hat der Solver vorher gelöst.`,
  help: {
    noFocus: 'Pane hat keinen Fokus: ctrl+x, dann Tab (oder klicken).',
    demoRunning: 'Demo läuft: eine der Tasten oben beendet sie.',
    animation: 'Eine der Tasten oben beendet die Animation.',
    keysWide: '1–7 Spalte (nochmal: eine Karte weniger) · s ziehen · w Ablage · f Ziel (ohne Auswahl: alles Passende)',
    keysNarrow: '1–7 Spalte · s ziehen · w Ablage · f Ziel',
  },
}

const TEXTS: Record<Lang, Texts> = { en, de }
let current: Lang = 'en'

/** Sprache setzen: ein Kürzel aus `TEXTS`, alles andere → 'en'. */
export const setLanguage = (lang: unknown): void => {
  current = typeof lang === 'string' && lang in TEXTS ? (lang as Lang) : 'en'
}
export const language = (): Lang => current
export const tx = (): Texts => TEXTS[current]

/** Name eines Regelsatzes bzw. einer Blattart in der aktiven Sprache. */
export const rulesLabel = (r: Rules, isEasy: boolean, isMedium: boolean, isHard: boolean): string =>
  isEasy ? tx().rules.easy : isMedium ? tx().rules.medium : isHard ? tx().rules.hard : tx().rules.custom
export const kindLabel = (k: DealKind): string => (k === 'checked' ? tx().kind.checked : tx().kind.random)
