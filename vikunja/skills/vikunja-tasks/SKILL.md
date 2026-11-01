---
name: vikunja-tasks
description: Work with the Vikunja project that is the authoritative task list - list open tasks, add new ones, mark tasks done, and import or mirror a markdown checklist (the documentation) into it. Use when the user mentions Vikunja, their project/task list, improvements to track, or asks to add, finish or sync to-dos.
---

# Vikunja tasks

The Vikunja project is the **authoritative task list**. A markdown checklist in the repository (if there is one) is
**documentation**: it explains the background of each item and keeps the history, but what is open or done is decided
in Vikunja.

Tools come from the `vikunja` MCP server of this plugin (`projects_list`, `tasks_list`, `tasks_create`, `tasks_update`,
`labels_list`, `labels_create`, `task_labels_add`, `task_comments_add`, …).

## Find the project

1. Project title: `${user_config.project}`. If that is empty, ask the user which project to use.
2. `projects_list` with `search` set to the title; take the project whose title matches exactly. If none matches,
   say so and list the closest titles – do not create a project without being asked.

## List open tasks

`tasks_list` with the project ID and the filter `done = false`. Group the answer by label.

## Add a task

1. Look for an existing open task with the same or nearly the same title first (`tasks_list` with `search`); if there
   is one, tell the user instead of creating a duplicate.
2. `tasks_create` with a short title (the action, at most about 80 characters) and the details in the description.
3. Label: the area of the task (e.g. the section heading of the checklist). Use `labels_list`; create the label with
   `labels_create` only if it does not exist yet; attach it with `task_labels_add`.

## Finish a task

When work for a task is done and verified:

1. `tasks_update` with `done: true`.
2. If the work produced references (PR numbers, commits, dates), add them with `task_comments_add`.
3. Update the markdown documentation (tick the item, add the result) in the same step.

Never mark a task done that was not finished and verified in this session or confirmed by the user.

## Import or mirror a markdown checklist

For a checklist like `- [ ] item` under `## Section` headings:

1. Read the file. Every unchecked item is a candidate; checked items (`- [x]`) are history and are not imported.
2. Title = the item text up to the first sentence end or colon, without markdown formatting; description = the full
   item text plus "Source: <file path>, section <heading>".
3. Label = the section heading without its number (e.g. `## 2. Jenkins` → `Jenkins`).
4. Skip items whose title already exists in the project (open or done). Report created, skipped and unclear items.
5. Afterwards Vikunja leads: new work goes into Vikunja first; the checklist is updated as documentation when a task
   is finished.

Show the user the list of tasks you are about to create and wait for a yes before creating more than five at once.
