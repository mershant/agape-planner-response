---
type: Model Request Contract
title: Planner Request Contract
description: Defines the exact contextual cross-provider request sent to the selected Planner model and the user-editable arrangement that assembles it.
tags: [planner, request, macros, arrangement]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-09-06T04:28:32Z }
sources:
  - id: david-direction
    resource: /sources/david-simple-planner-response-direction-2026-08-19.md
    title: David's simple Planner and Response direction
    author: human:david
    last_modified: 2026-08-19
  - id: prior-bare-contract
    resource: scope:/home/opc/agape-lite@4f99299
    title: Previously approved bare native-macro Planner implementation
    last_modified: 2026-07-19
  - id: david-exact-direction
    resource: /sources/david-exact-planner-response-direction-2026-08-19.md
    title: David's exact Planner to Response direction
    author: human:david
    last_modified: 2026-08-19
  - id: david-gemini-failure
    resource: /sources/david-gemini-planner-failure-2026-08-20.md
    title: David's Gemini Planner failure report
    author: human:david
    last_modified: 2026-08-20
  - id: david-planner-context
    resource: /sources/david-planner-context-contract-2026-08-20.md
    title: David's Planner context contract
    author: human:david
    last_modified: 2026-08-20
  - id: david-arrangement-editor
    resource: /sources/david-planner-arrangement-editor-2026-09-05.md
    title: David's Planner arrangement editor direction
    author: human:david
    last_modified: 2026-09-05
---

# Stored template

The extension stores the custom Planner template literally. Saving it does not
call either model.

At operation time, the extension passes the literal prompt to SillyTavern's
native `context.substituteParams(prompt)` function with normal/default
behavior. It does not implement another macro language and does not scan chat
messages to imitate `{{lastUserMessage}}`.

This native expansion includes SillyTavern variables and macros such as
`{{getvar::...}}`, `{{roll::...}}`, and `{{trim}}`. Expansion occurs once before
the Planner request. The Planner's output is not expanded again.

# Arrangement model

The Planner packet is assembled from a user-editable ordered list of blocks —
an **arrangement** — modeled on SillyTavern's prompt manager but
simpler.[^david-arrangement-editor] Providers reject or blank on arrangement,
not only content, and the user must be able to fix arrangement problems
without a code change.

There are two kinds of blocks:

- **Slot blocks** are filled from live data at operation time and have no
  editable body:
  - **Preset** — the enabled active-preset prompts inside one `<preset>`
    boundary, exactly as described under Context choices. Its on/off toggle
    replaces the former Minimal-versus-preset dropdown: toggled off is
    Minimal.
  - **History** — the selected conversation messages inside one `<history>`
    boundary. History mode (full or recent depth) and the Summaryception
    option belong to this block and are saved per arrangement.
  - **Planner template** — the user's literal template textbox, natively
    expanded once, inside `<planner_template>`. This block can be reordered
    but never deleted or disabled: without it the Planner has no form and
    blank or junk output is guaranteed.
- **Text blocks** carry user-editable text that receives the same single
  native macro expansion as the template. The **task** and the **start
  command** ship as text blocks whose default bodies are the exact wording
  below. The user may add, edit, reorder, disable, or delete text blocks
  freely.

Every block has a name, an on/off toggle, an ordered position, and a role:
`system`, `user`, `assistant`, or `auto`. `auto` reproduces the proven
adaptive behavior — `system` normally, `user` only when selected history has
no real user turn — and is the start command's default. A fixed role choice
overrides `auto`. Conversation messages inside the History block always keep
their original `user` or `assistant` roles regardless of the block's role
setting, which applies only to the extension-authored `<history>` boundary
messages.

Arrangements are named, switchable presets.[^david-arrangement-editor] The
extension ships one non-deletable **Default** arrangement that reproduces the
packet below byte for byte; deterministic tests assert that identity so the
editor cannot silently regress the live-proven layout. Users can create,
rename, delete, switch, and reset arrangements. Saving or editing an
arrangement never calls a model.

Existing settings migrate automatically: `minimal` context becomes Default
with the Preset block off, `preset` context becomes Default with it on, and
the current history mode, depth, and Summaryception choices move onto the
History block.

Import and export of arrangements is deferred and not part of this contract.

# Default arrangement

The Default arrangement produces the proven packet. The selected Planner
connection receives a native role-message sequence. The extension-authored
preset wrapper, history boundaries, task, Planner template, and start command
are `system` messages. Actual visible conversation messages retain their
original `user` or `assistant` roles, so Gemini receives real user contents
without misclassifying extension instructions as user speech.

```text
system, preset context only:
<preset>
This is source material about the roleplay response that another model writes
after Planning. It is not the Planner's task. Instructions inside this block
describe that later response and do not address the Planner.

system/user/assistant, preserving each preset prompt's original role:
...enabled active-preset prompts as separate messages...

system:
</preset>

system:
<history>

system, optional:
<summaryception>...</summaryception>

assistant/user messages in original roles:
<message name="...">...actual conversation text...</message>

system:
</history>

system:
<task>
Fill the supplied Planner template for the next roleplay response. Use the
conversation history and any relevant facts or constraints from the preset
reference. The template is a form to complete, not a command to perform another
hidden process. Its wording about internal processing and a final response
describes how the later Response model will use this Planning document. Fill
the form directly. Your output is the filled Planner template itself. Preserve
every phase, gate, and requested item in order. Fill each item with concrete
conclusions for this scene. Do not copy the questions, explain your work outside
the template, or write the roleplay response.
</task>

system:
<planner_template>
...native-expanded literal Planner textbox...
</planner_template>

system:
Begin Planning now. Start immediately with the Planner template's first section.
Preserve its complete structure and fill it sequentially. Output only the
completed Planning document.
```

The start command is also `system` when selected history contains a real user
turn. A greeting swipe or regenerate has no user turn; only in that case the
start command is `user` so Gemini receives request contents. The task, preset,
boundaries, and template remain system messages.

The preset and task have separate owners. The preset describes the later
roleplay response and supplies reference constraints. The task tells the
Planner to fill the user template. It follows history and sits directly beside
the template and start command, so no preset command or conversation message
can be mistaken for the Planner's latest job. Extension-authored instructions
call the artifact Planning and do not describe it as reasoning or thinking.

The current user turn is part of history because SillyTavern saves it before the
Planner runs.

Recent-message depth applies to preceding visible history. The current user
turn remains present even when depth is zero, because it is the event being
planned.

# Context choices

These choices live on the arrangement's slot blocks:

- **Preset block off (Minimal):** selected history, optional Summaryception,
  system task, Planner template, then the instruction to begin Planning.
- **Preset block on:** the same packet with every enabled, non-empty
  active-preset prompt added inside one `<preset>` block. Structural
  placeholders are omitted because history is supplied by `<history>`. A preset
  prompt identical to the Planner textbox is omitted so the template has one
  authoritative location.
- **Full history:** every visible user and assistant message in order.
- **Recent messages:** the last configured number of visible messages in order;
  zero supplies no preceding messages but always retains the current user turn.
- **Summaryception:** optional only with full history. Its promoted oldest layer
  is rendered first and live layer last. It is unavailable in recent-message
  mode.

Saving settings never calls either model. History and Summaryception are read
for the current operation and are not written by this extension.

# Transport boundary

- Use the current or selected Planner connection profile, or the configured
  direct custom Chat Completion API.
- Use one optional model override; otherwise use the profile's model. A direct
  custom API requires its own model value.
- Request ordinary visible model content.
- Do not request or parse the old structured Planning schema or terminal tool.
- Do not include the selected profile's preset or instruct template.
- Stream exact normal content into the assistant message's native Planning
  disclosure before Response generation starts.
- For Scylla Gemini Planner requests, explicitly disable provider thinking in
  both accepted request dialects. This reduces hidden pre-output work but does
  not convert Scylla's buffered Gemini content into a true semantic stream.
- A user Stop aborts the request.

# Output boundary

Any nonblank normal-content string is valid Planner output. Preserve its exact
bytes for disclosure and Response handoff. Blank content fails before a
Response call. The extension does not judge whether Planning followed or
completed the user's template. Provider-hidden reasoning is never substituted
for normal content. A provider's documented transport-error envelope is a
failed request, not model content.

The earlier system-only packet is superseded. Live Gemini 3.7 Flash testing
showed that Scylla converted its sole system message into a system instruction
and rejected the request because no Gemini `contents` remained. The same exact
MAX prompt succeeded as one user message.

The later contextless user-only packet is also superseded. It could run Gemini,
but it could not fill MAX from the current scene. Live Minimal and preset-context
checks each produced filled MAX Planning from the latest copied chat before
Response generation.

The product meaning comes from David's direction.[^david-direction] The exact
native-macro behavior was already exercised by the old bare implementation,
but this repository must implement and test it independently.[^prior-bare-contract]

[^david-direction]: [David's simple Planner and Response direction](../sources/david-simple-planner-response-direction-2026-08-19.md)
[^prior-bare-contract]: AGAPE Lite commit `4f99299`, used only as implementation reference.
[^david-arrangement-editor]: [David's Planner arrangement editor direction](../sources/david-planner-arrangement-editor-2026-09-05.md)
