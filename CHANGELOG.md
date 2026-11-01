# Changelog

One section per mod, newest version first.

## vikunja

### 1.0.0 – 2026-11-01

- First release: MCP server `@0xk3vin/vikunja-mcp` 1.2.0 (pinned), options `url`, `api_token` (sensitive) and
  `project`.
- Skill `vikunja-tasks`: Vikunja project as the authoritative task list, markdown checklist as documentation; list,
  add (no duplicates, labels per area), finish (done + comment), import a checklist (confirmation for bulk imports).

## solitaire

### 1.0.0 – 2026-10-11

- First public release.
- English by default, German via the plugin option `language` (`de`).
- Look modelled on the Microsoft Solitaire Collection: felt with a gradient, white cards with rounded corners and
  shadows, block-letter ranks with pips, blue card backs with a diamond pattern.
- Solver-backed hints without back-and-forth suggestions, a solver that announces each move like a hint before
  playing it, rescue (`r`: undo until the position is solvable again), close (`q`).
- Three rule sets, deals checked solvable by the solver, auto-solve, demo, win animation.
