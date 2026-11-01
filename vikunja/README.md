# vikunja

[Vikunja](https://vikunja.io) in Claude Code: projects, tasks, labels, comments and kanban through the MCP server
[`@0xk3vin/vikunja-mcp`](https://github.com/0xK3vin/vikunja-mcp) (pinned to 1.2.0), plus the skill `vikunja-tasks`
that treats one Vikunja project as the authoritative task list and a markdown checklist as its documentation.

## Install

```
/plugin install vikunja --marketplace Rsclub22/claude-mods
```

Claude Code asks for three options:

| Option | Meaning |
| --- | --- |
| `url` | Base URL of your Vikunja instance, without `/api/v1` (the server appends it), e.g. `https://vikunja.example.org` |
| `api_token` | API token, stored in the secure credential store (not in `settings.json`) |
| `project` | Title of the project the skill works in (optional; empty = ask each time) |

Change them later with `/plugin` → vikunja → configure.

## API token

In Vikunja: **Settings → API Tokens → Create a token**. Give it at least:

- Projects: read
- Tasks: read, create, update
- Labels: read, create (and task labels: create)

Add comments/kanban permissions if you want Claude to use those tools too. Pick an expiry date; when the token
expires, create a new one and update the option.

## Requirements

Node.js ≥ 18 with `npx` on the `PATH`. The server is fetched from npm on first start (`npx -y`), pinned to the
reviewed version 1.2.0. It talks only to the configured Vikunja URL.

## Use

Ask in plain words, for example:

- "What is still open in Vikunja?"
- "Add a task: migrate the backup script to Ansible."
- "That's done – close the task and note PR #83."
- "Import the open items of `docs/TODO.md` into Vikunja."

The skill `vikunja-tasks` describes the workflow (no duplicates, labels per area, confirmation before bulk imports,
done only after verified work). All MCP tools are also available directly as `mcp__plugin_vikunja_vikunja__*`.
