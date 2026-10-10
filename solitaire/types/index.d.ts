/** Eine Karte: Rang 1 (Ass) bis 13 (König), Farbe 0 ♠, 1 ♥, 2 ♦, 3 ♣, aufgedeckt oder nicht. */
export type Card = { r: number; s: number; up: boolean }

/** Karten je Zug (1 oder 3) und Durchgänge durch den Stapel (0 = unbegrenzt). */
export type Rules = { draw: number; passes: number }

/**
 * Stapel und Ablage sind eine Folge: talon[0..waste) liegt in der Ablage (oberste Karte talon[waste-1]),
 * talon[waste..) ist der Stapel (nächste gezogene Karte talon[waste]).
 */
export type State = {
  talon: Card[]
  waste: number
  found: number[]   // Zähler je Farbe
  tab: Card[][]
  pass: number
}

export type MoveKind = 'draw' | 'wasteFound' | 'wasteTab' | 'tabFound' | 'tabTab'
export type Move = { kind: MoveKind; from?: number; to?: number; count?: number }

export type DealKind = 'checked' | 'random'

/** Was gerade zum Verschieben ausgewählt ist. */
export type Selection = { kind: 'waste' } | { kind: 'col'; col: number; count: number }

/** Ein Tipp: nach `draws` Zieh-Zügen den Zug `move` mit der Karte `card` spielen; wird auf dem Brett markiert. */
export type Hint = { draws: number; move: Move; card: Card }

export type Session = {
  rules: Rules
  kind: DealKind
  seed: number
  state: State
  sel: Selection | null
  hint: Hint | null   // Markierung des letzten Tipps, bis zum nächsten Zug
  message: string
  moves: number
  won: boolean
  assisted: boolean   // Löser bei noch verdeckten Karten benutzt: ein Sieg zählt nicht
  history: State[]
  wins: Record<string, number>   // je Kombination aus Regeln und Blatt, siehe comboKey
}

/** Was das Pane außer dem Spielstand zeigt. */
export type Mode = {
  prompt: 'none' | 'rules' | 'kind'
  pendingRules: Rules
  solving: boolean
  checking: boolean   // Blattprüfung; zusammen mit demo: Blattsuche der Demo
  demo: boolean
  /** Der Löser führt die Lösung auf einer Kopie vor: läuft, ist durch (Stellung kommt gleich zurück), oder nicht. */
  preview: 'none' | 'running' | 'done'
  /** Siegesanimation: läuft, ist fertig und bleibt stehen, bis eine Taste kommt, oder keine. */
  fx: 'none' | 'running' | 'shown'
  /** Zählt die Bilder der Animation hoch, damit das Pane neu zeichnet. */
  frame: number
}

declare module 'claude-code' {
  interface PluginState {
    solitaire: { session: Session; mode: Mode }
  }
}
