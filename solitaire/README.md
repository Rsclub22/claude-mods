# Solitaire for Claude Code

Klondike solitaire in a pane of Claude Code, styled after the Microsoft Solitaire Collection: green felt with a
gradient, white cards with shadows, block-letter ranks, pips like on real cards, blue card backs. The cards grow with
the pane (up to 13×9 cells). A built-in solver checks deals, gives hints, shows solutions and rescues lost positions.

And yes: you can play while Claude is working on your task. The pane sits beside the conversation, and the keys only
reach the game while it has the focus.

## Install

In a terminal session of Claude Code:

```
/plugin install solitaire --marketplace Rsclub22/claude-mods
```

Answer "Add marketplace?" with `y`, then pick the scope (usually "user"). `/solitaire` opens the pane. Keys apply
while the pane has the focus (ctrl+x, then Tab, or click into the pane).

The game speaks English by default. For German, set the plugin option `language` to `de` (in `/config` under the
plugin, or when installing).

## Playing

- `1`–`7` selects a column (again: one card fewer), `s` draws from the stock, `w` selects the waste, `f` plays to the
  foundations (with nothing selected: everything that fits).
- `n` new game: rules (`1` Easy: draw 1, `2` Medium: draw 3, `3` Hard: draw 3, three passes), then the deal
  (`1` checked solvable, `2` random). Checked deals have been solved by the solver beforehand.
- `h` hint: the next move of a found solution, marked on the board; a heuristic suggestion when nothing was found.
- `a` solver: shows the solution move by move (each move marked first, then played) and restores the position
  afterwards; a later win does not count.
- `l` auto-solve: plays to the end once all cards are face up.
- `r` rescue: takes moves back until the position is solvable again.
- `u` undo, `c` clear the selection, `d` demo (any key ends it), `q` closes the pane.
- After a win the cards bounce like in the old Windows solitaire.

Every key is also a button and can be clicked. The game and the win counts persist across sessions.

## Development

Tests: `claude plugin test .` – manifest and hooks check: `claude plugin validate .`.
The game logic in `hooks/` (`game`, `solver`, `session`, `render`, `celebrate`) is a port of the author's terminal
game solitaire++ (C++23). All user-facing texts live in `hooks/text.ts`.
