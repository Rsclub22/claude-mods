# Philipp's mods for Claude Code

Plugins ("mods") for Claude Code, each in its own folder, served from this repository as a marketplace.

| Mod | What it is | Install |
| --- | --- | --- |
| [solitaire](solitaire/) | Klondike solitaire in a pane, styled after the Microsoft Solitaire Collection, with a solver, hints, rescue and demo. English or German. | `/plugin install solitaire --marketplace Rsclub22/claude-mods` |
| [vikunja](vikunja/) | Vikunja projects, tasks, labels and kanban through an MCP server; a skill keeps one project as the authoritative task list. URL and API token are asked at install (token in the secure store). | `/plugin install vikunja --marketplace Rsclub22/claude-mods` |

Type the install line at the prompt of a terminal session of Claude Code, answer "Add marketplace?" with `y` and
pick a scope. Each mod's folder has its own README with the keys and options. Updates: `claude plugin update
<mod>@philipp-mods`. Changes per version are in [CHANGELOG.md](CHANGELOG.md).

## Layout

```
.claude-plugin/marketplace.json   lists the mods (source: ./<mod>)
<mod>/.claude-plugin/plugin.json  the mod's manifest (name, version, options)
<mod>/hooks/                      the hooks module and its code (if any)
<mod>/.mcp.json                   MCP servers of the mod (if any)
<mod>/skills/<name>/SKILL.md      skills of the mod (if any)
<mod>/tests/                      claude plugin test <mod>
```

A new mod is a new folder plus one entry in the marketplace file. Each mod is versioned on its own; a release is a
version bump in its `plugin.json`, a CHANGELOG entry and a tag `<mod>-v<version>`.
