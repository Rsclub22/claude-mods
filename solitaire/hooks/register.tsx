// Solitär-Pane wie solitaire++ in der Optik der Microsoft Solitaire Collection: Filz mit Verlauf, mitwachsende Karten mit Pips, drei Stufen, geprüft lösbare Blätter (Solver),
// Tipp, Löser aus jeder Stellung, Demo-Modus und die Siegesanimation. Regeln und Darstellung liegen in den Nachbardateien.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DealKind, Mode, Move, Rules, Session } from '../types'
import { Cascade } from './celebrate.ts'
import { EASY, HARD, MEDIUM, allFaceUp, deal, rulesName, stockCount } from './game.ts'
import { type Grid, type Run, type Size, LABEL_Y, STYLES, cloneGrid, columnX, feltAt, render, runs, stamp } from './render.ts'
import { blank, clearSelection, directAlternative, fallbackHint, kindName, planHint, play, pressColumn, pressDraw, pressFoundation, pressWaste, rescue, showHint, start, undo } from './session.ts'
import { solve, solveAsync } from './solver.ts'
import { setLanguage, tx } from './text.ts'

const PANE = 'solitaire'
const STORE_KEY = 'session'
const SOLVE_MS = 120
const PREVIEW_MS = 250   // Vorführung: Zug ankündigen (wie ein Tipp), halten, ziehen – je ein Takt; Ziehen vom Stapel ohne Ankündigung
const DEMO_MS = 400
const DEMO_PAUSE_MS = 2000
const FX_MS = 40
const HELP_ROWS = 2
const HELP_COLOR = STYLES.empty.color ?? '#6ebe78'

const session = atom({ plugin: 'solitaire', key: 'session' } as const, blank())
const mode = atom({ plugin: 'solitaire', key: 'mode' } as const, {
  prompt: 'none',
  pendingRules: EASY,
  solving: false,
  checking: false,
  demo: false,
  preview: 'none',
  fx: 'none',
  frame: 0,
} as Mode)

type Dollar = EngineInterface

// Laufende Arbeit gehört dem Modul; ein Neuladen des Codes beendet sie.
let solver: { cancel: () => void } | null = null
let solution: Move[] = []
let fx: { timer: { cancel: () => void }; cascade: Cascade; canvas: Grid } | null = null
let lastSize: Size = { cols: 80, rows: 26 }
let job = 0   // erhöht sich bei jedem neuen Spiel; ältere Blattprüfungen geben dann auf

// Demo: eigener Spielstand neben der Sitzung, nur im Modul; `demoJob` lässt eine alte Schleife aufgeben.
type DemoPhase = 'seek' | 'play' | 'celebrate' | 'pause'
let demo: { game: Session; phase: DemoPhase } | null = null
let demoJob = 0
let demoResolve: (() => void) | null = null
let preview: Session | null = null   // Kopie, auf der der Löser die Lösung vorführt
let previewHold: { cancel: () => void } | null = null

const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0]!
const pause = ($: Dollar) => () => $.clock.sleep(0)
const setMode = ($: Dollar, patch: Partial<Mode>) => update($, mode, m => ({ ...m, ...patch }))
const redraw = ($: Dollar) => update($, mode, m => ({ ...m, frame: m.frame + 1 }))

const valid = (s: unknown): s is Session => {
  const v = s as Session | undefined
  return !!v && typeof v === 'object' && !!v.state && Array.isArray(v.state.tab) && v.state.tab.length === 7 && !!v.rules && !!v.wins
}

/** Spielstand ändern, speichern und bei einem frischen Sieg die Animation starten. */
const change = async ($: Dollar, fn: (s: Session) => Session): Promise<Session> => {
  let became = false
  const next = await update($, session, cur => {
    const n = fn(cur)
    became = n.won && !cur.won
    return n
  })
  void $.store.set(STORE_KEY, { ...next, history: [] })
  if (became) await celebrate($, next)
  return next
}

// ---------- Siegesanimation ----------
const celebrate = async ($: Dollar, s: Session, onDone?: () => void) => {
  stopFx()
  const board = render(s, lastSize)
  if (board.tooSmall) return
  const canvas = cloneGrid(board.grid)
  const cascade = new Cascade(lastSize, board.layout, randomSeed())
  const L = board.layout
  const timer = $.clock.every(FX_MS, () => {
    if (!fx) return
    for (const st of cascade.tick()) stamp(canvas, st.card, st.x, st.y, L)
    const done = cascade.done
    if (done) fx.timer.cancel()
    void update($, mode, m => ({ ...m, frame: m.frame + 1, fx: done ? 'shown' : m.fx }))
    if (done) onDone?.()
  })
  fx = { timer, cascade, canvas }
  await setMode($, { fx: 'running' })
}

const stopFx = () => {
  fx?.timer.cancel()
  fx = null
}

// ---------- Auto-Lösen ----------
const stopSolving = async ($: Dollar, announce: boolean) => {
  solver?.cancel()
  solver = null
  solution = []
  const m = await read($, mode)
  if (!m.solving) return
  await setMode($, { solving: false })
  if (announce) await change($, s => ({ ...s, message: tx().autoStopped }))
}

const endPreview = async ($: Dollar) => {
  previewHold?.cancel()
  previewHold = null
  preview = null
  solver?.cancel()
  solver = null
  solution = []
  await setMode($, { preview: 'none', solving: false })
  await change($, cur => ({ ...clearSelection(cur), message: tx().thatWasSolution }))
}

// Löser (a): die Lösung nur auf einer Kopie vorführen und die Stellung danach wiederherstellen.
// Wer die Lösung gesehen hat, gewinnt nicht mehr „fair“ (assisted).
const showSolution = async ($: Dollar) => {
  const s = await read($, session)
  if (s.won) return
  const r = await solveAsync(s.state, s.rules, pause($))
  if (r.verdict !== 'solvable') return change($, cur => ({ ...clearSelection(cur), message: tx().noSolutionFrom }))
  solution = r.moves
  preview = clearSelection(await change($, cur => ({ ...clearSelection(cur), assisted: true })))
  await setMode($, { preview: 'running' })
  let phase = 0   // 0 ankündigen, 1 halten, 2 ziehen
  solver = $.clock.every(PREVIEW_MS, () => {
    const m = solution[0]
    if (m && preview) {
      const h = planHint(preview.state, preview.rules, [m])   // null beim Ziehen vom Stapel
      if (h && phase < 2) {
        if (phase === 0) preview = showHint(preview, h, true)
        phase++
      } else {
        preview = play({ ...preview, hint: null }, m)
        solution.shift()
        phase = 0
      }
    }
    if (!m || !preview || preview.won) {
      solver?.cancel()
      solver = null
      previewHold = $.clock.every(DEMO_PAUSE_MS, () => void endPreview($))
      void setMode($, { preview: 'done' })
      return
    }
    void redraw($)
  })
}

// Auto-Lösen (l), der ursprüngliche Löser: spielt wirklich zu Ende, sobald alle Karten aufgedeckt sind.
const autoSolve = async ($: Dollar) => {
  const s = await read($, session)
  if (s.won) return
  if (!allFaceUp(s.state)) return change($, cur => ({ ...clearSelection(cur), message: tx().uncoverFirst }))
  const r = await solveAsync(s.state, s.rules, pause($))
  if (r.verdict !== 'solvable') return change($, cur => ({ ...clearSelection(cur), message: tx().noSolution }))
  solution = r.moves
  await change($, clearSelection)
  await setMode($, { solving: true })
  solver = $.clock.every(SOLVE_MS, () => {
    const m = solution.shift()
    if (!m) {
      void stopSolving($, false)
      return
    }
    void change($, cur => play(cur, m)).then(next => {
      if (next.won) void stopSolving($, false)
    })
  })
}

// Tipp: der nächste Zug einer gefundenen Lösung, sonst ein heuristischer Vorschlag; beides markiert das Brett.
const hint = async ($: Dollar) => {
  const s = await read($, session)
  if (s.won) return
  const budget = { ms: 800, nodes: 600_000 }
  const r = await solveAsync(s.state, s.rules, pause($), () => false, budget)
  const planned = r.verdict === 'solvable' ? planHint(s.state, s.rules, r.moves, s.history[s.history.length - 1]) : null
  if (planned) {
    // Lange Zieh-Folgen sind korrekt, aber unhandlich: lieber ein direkter Zug, wenn der die Lösbarkeit erhält.
    // Die Prüfung läuft synchron (kurz, nur ein Zug weiter); solve ist in solver.ts auch synchron verfügbar.
    const direct = directAlternative(s.state, s.rules, planned, after => solve(after, s.rules, budget).verdict === 'solvable')
    return change($, cur => showHint(cur, direct ?? planned, true))
  }
  const fallback = fallbackHint(s.state, s.rules)
  if (fallback) return change($, cur => showHint(cur, fallback, false))
  await change($, cur => ({ ...clearSelection(cur), message: tx().noMoves }))
}

// Rettung (r): zurück bis zur letzten Stellung, die der Solver noch für lösbar hält.
const rescueNow = async ($: Dollar) => {
  const s = await read($, session)
  if (s.won) return
  await change($, cur => ({ ...clearSelection(cur), message: tx().searchingSolvable }))
  const budget = { ms: 800, nodes: 600_000 }
  const r = await rescue(s, async st => (await solveAsync(st, s.rules, pause($), () => false, budget)).verdict === 'solvable')
  await change($, () => r.session)
}

// ---------- Demo ----------
const stopDemo = async ($: Dollar) => {
  demoJob++
  demo = null
  stopFx()
  demoResolve?.()
  demoResolve = null
  await setMode($, { demo: false, fx: 'none', checking: false })
}

const demoLoop = async ($: Dollar, mine: number, rules: Rules) => {
  const alive = () => demo !== null && mine === demoJob
  while (alive()) {
    demo!.phase = 'seek'
    await setMode($, { checking: true })
    let seed = randomSeed()
    for (;;) {
      const r = await solveAsync(deal(seed), rules, pause($), () => !alive())
      if (!alive()) return
      if (r.verdict === 'solvable') {
        demo!.game = start({ wins: {} }, rules, 'checked', seed)
        demo!.phase = 'play'
        await setMode($, { checking: false })
        for (const m of r.moves) {
          await $.clock.sleep(DEMO_MS)
          if (!alive()) return
          demo!.game = play(demo!.game, m)
          await redraw($)
        }
        break
      }
      seed = randomSeed()
    }
    if (!alive()) return
    demo!.phase = 'celebrate'
    await new Promise<void>(resolve => {
      demoResolve = resolve
      void celebrate($, demo!.game, resolve)
    })
    demoResolve = null
    if (!alive()) return
    demo!.phase = 'pause'
    await $.clock.sleep(DEMO_PAUSE_MS)
    if (!alive()) return
    stopFx()
    await setMode($, { fx: 'none' })
  }
}

const startDemo = async ($: Dollar) => {
  const mine = ++demoJob
  stopFx()
  previewHold?.cancel()
  previewHold = null
  preview = null
  await setMode($, { preview: 'none' })
  await stopSolving($, false)
  const s = await read($, session)
  demo = { game: s, phase: 'seek' }
  await setMode($, { prompt: 'none', fx: 'none', demo: true })
  // Nach dem Ende der Demo (oder dem Entladen des Moduls) scheitern schwebende Aufrufe; das ist dann egal.
  demoLoop($, mine, s.rules).catch(() => undefined)
}

// Schließen (q): alles Laufende beenden, dann das Pane zumachen; /solitaire öffnet es wieder.
const closePane = async ($: Dollar) => {
  await stopDemo($)
  previewHold?.cancel()
  previewHold = null
  preview = null
  await stopSolving($, false)
  await setMode($, { preview: 'none', prompt: 'none', fx: 'none' })
  await $.ui.close({ id: PANE }).catch(() => undefined)   // ein Hook darf das Schließen verweigern
}

// ---------- Neues Spiel ----------

const newGame = async ($: Dollar, rules: Rules, kind: DealKind) => {
  const mine = ++job
  stopFx()
  await stopSolving($, false)
  await setMode($, { prompt: 'none', fx: 'none' })
  const prev = await read($, session)
  let judged = ''
  if (prev.kind === 'random' && !prev.won && prev.moves > 0) {
    const r = await solveAsync(deal(prev.seed), prev.rules, pause($))
    judged = tx().previousDeal(tx().verdict[r.verdict])
  }
  let seed = randomSeed()
  if (kind === 'checked') {
    await setMode($, { checking: true })
    for (;;) {
      const r = await solveAsync(deal(seed), rules, pause($), () => mine !== job)
      if (mine !== job) return
      if (r.verdict === 'solvable') break
      seed = randomSeed()
    }
    await setMode($, { checking: false })
  }
  if (mine !== job) return
  await change($, cur => {
    const s = start(cur, rules, kind, seed)
    return { ...s, message: s.message + judged }
  })
}

// ---------- Pane ----------
export const register: Register = (on, options) => {
  setLanguage(options.language)
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'solitaire', description: tx().commandDescription, immediate: true })
    const stored = await $.store.get(STORE_KEY)
    if (valid(stored)) await $.state.set({ plugin: 'solitaire', key: 'session' }, { ...stored, sel: null, hint: null, assisted: stored.assisted === true })
    return next(e)
  })

  on('command.run', { command: 'solitaire' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: tx().title, focus: true, rows: 30, columns: 84 })
    if (!(await $.store.get(STORE_KEY))) void newGame($, EASY, 'checked')
    if (!opened.isPlaced) return { text: tx().tooNarrow }
    return { text: tx().opened }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, session)
    const m = await read($, mode)
    const size: Size = { cols: e.props.bodyColumns, rows: Math.max(1, e.props.scroll.bodyRows - HELP_ROWS) }
    lastSize = size

    // Jede Taste hält Auto-Lösen an und beendet die Animation; läuft sie noch, verbraucht der Abbruch die Taste.
    const act = (fn: () => unknown) => async () => {
      const m = await read($, mode)
      if (m.demo) {
        await stopDemo($)
        return
      }
      if (m.preview !== 'none') {
        await endPreview($)
        return
      }
      if (m.fx !== 'none') {
        const running = m.fx === 'running' && fx !== null
        stopFx()
        await setMode($, { fx: 'none' })
        if (running) return
      }
      if (m.solving) {
        await stopSolving($, true)
        return
      }
      await fn()
    }
    const on$ = (fn: (cur: Session) => Session) => act(() => change($, fn))

    const shown = m.demo && demo ? demo.game : m.preview !== 'none' && preview ? preview : s
    const board = render(shown, size, { solving: m.solving, checking: m.checking, demo: m.demo, preview: m.preview, prompt: m.prompt })
    const showFx = m.fx !== 'none' && fx !== null && fx.canvas.length === size.rows && fx.canvas[0]?.length === size.cols
    const grid = showFx ? fx!.canvas : board.grid
    const L = board.layout

    const textRow = (row: Run[], y: number) => (
      <Text key={`r${y}`} wrap="truncate">
        {row.map(r => (
          <Text backgroundColor={r.backgroundColor} {...(r.color ? { color: r.color } : {})} {...(r.bold ? { bold: true } : {})}>{r.text}</Text>
        ))}
      </Text>
    )
    const felt = (y: number) => feltAt(y, size.rows)
    const gapText = (n: number, y: number) => (n > 0 ? <Text backgroundColor={felt(y)}>{' '.repeat(n)}</Text> : null)

    // Tastenzeile über Stapel, Ablage und Zielstapeln.
    const labelRow = () => {
      const items: [number, string, string, () => unknown][] = [
        [columnX(L, 0), 's', String(stockCount(s.state)), on$(pressDraw)],
        [columnX(L, 1), 'w', tx().labels.waste, on$(pressWaste)],
        [columnX(L, 3), 'f', tx().labels.foundation, on$(pressFoundation)],
      ]
      let x = 0
      const kids = []
      for (const [at, key, lab, press] of items) {
        kids.push(gapText(at - x, LABEL_Y))
        kids.push(<Button key={key} plain hotkey={key} label={lab} onPress={press} />)
        x = at + 3 + lab.length
      }
      return (
        <Box key="labels" height={1} backgroundColor={felt(LABEL_Y)}>
          {kids}
        </Box>
      )
    }

    // Spaltennummern als Buttons, mittig über jeder Spalte.
    const numberRow = () => {
      let x = 0
      const kids = []
      for (let col = 0; col < 7; col++) {
        const at = columnX(L, col) + Math.max(0, Math.floor((L.w - 4) / 2))
        kids.push(gapText(at - x, board.numY))
        kids.push(<Button key={`col${col}`} plain hotkey={String(col + 1)} label="▾" onPress={on$(cur => pressColumn(cur, col))} />)
        x = at + 4
      }
      return (
        <Box key="numbers" height={1} backgroundColor={felt(board.numY)}>
          {kids}
        </Box>
      )
    }

    const rows = []
    for (let y = 0; y < grid.length; y++) {
      if (!showFx && !board.tooSmall && m.prompt === 'none' && y === LABEL_Y) rows.push(labelRow())
      else if (!showFx && !board.tooSmall && m.prompt === 'none' && y === board.numY) rows.push(numberRow())
      else rows.push(textRow(runs(grid[y]!, y, grid.length), y))
    }

    // Untere Zeilen: Befehle als Buttons, je nach Breite kurz oder lang beschriftet.
    const wide = size.cols >= 76
    const edge = felt(size.rows - 1)   // Zeilen unter dem Brett in der Randfarbe des Filzes
    const sep = <Text backgroundColor={edge}>{'  '}</Text>
    const T = tx()
    const btn = (key: string, labels: [string, string], press: () => unknown) => (
      <Button key={`b${key}`} plain hotkey={key} label={wide ? labels[0] : labels[1]} onPress={press} />
    )
    const pending = m.pendingRules
    let first
    let second: string
    if (m.prompt === 'rules') {
      const pick = (r: Rules) => act(() => setMode($, { prompt: 'kind', pendingRules: r }))
      first = [btn('1', T.buttons.easy, pick(EASY)), sep, btn('2', T.buttons.medium, pick(MEDIUM)), sep,
        btn('3', T.buttons.hard, pick(HARD)), sep, btn('c', T.buttons.cancel, act(() => setMode($, { prompt: 'none' })))]
      second = T.before(rulesName(s.rules), kindName(s.kind))
    } else if (m.prompt === 'kind') {
      const pick = (k: DealKind) => act(() => newGame($, pending, k))
      first = [btn('1', T.buttons.checked, pick('checked')), sep, btn('2', T.buttons.random, pick('random')), sep,
        btn('c', T.buttons.cancel, act(() => setMode($, { prompt: 'none' })))]
      second = T.rulesHint(rulesName(pending))
    } else {
      first = [btn('a', T.buttons.solver, act(() => showSolution($))), sep, btn('l', T.buttons.auto, act(() => autoSolve($))), sep, btn('h', T.buttons.hint, act(() => hint($))), sep,
        btn('r', T.buttons.rescue, act(() => rescueNow($))), sep, btn('d', T.buttons.demo, act(() => startDemo($))), sep, btn('u', T.buttons.undo, on$(undo)), sep,
        btn('c', T.buttons.clear, on$(clearSelection)), sep, btn('n', T.buttons.newGame, act(() => setMode($, { prompt: 'rules', pendingRules: s.rules }))), sep,
        btn('q', T.buttons.close, () => closePane($))]
      second = !e.props.isFocused
        ? T.help.noFocus
        : m.demo
        ? T.help.demoRunning
        : showFx
        ? T.help.animation
        : wide
        ? T.help.keysWide
        : T.help.keysNarrow
    }

    return (
      <Box flexDirection="column" backgroundColor={edge}>
        {rows}
        <Box key="cmds" height={1} backgroundColor={edge}>
          {gapText(Math.min(L.left, 2), size.rows - 1)}
          {first}
        </Box>
        <Box key="help" height={1} backgroundColor={edge}>
          {gapText(Math.min(L.left, 2), size.rows - 1)}
          <Text color={HELP_COLOR} backgroundColor={edge} wrap="truncate">
            {second}
          </Text>
        </Box>
      </Box>
    )
  })
}
