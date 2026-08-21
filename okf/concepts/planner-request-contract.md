---
type: Model Request Contract
title: Planner Request Contract
description: Defines the exact contextual cross-provider request sent to the selected Planner model.
tags: [planner, request, macros]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-20T20:53:59Z }
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

# Planner context

The selected Planner connection receives a native role-message sequence. The
extension-authored task, preset wrapper, history boundaries, Planner template,
and start command are `system` messages. Actual visible conversation messages
retain their original `user` or `assistant` roles, so Gemini receives real user
contents without misclassifying extension instructions as user speech.

```text
system:
<system>
Your only product is one completed Planning document for the next roleplay
response. Copy the structure and labels from the Planner template, then fill
each part from the supplied history and optional preset reference. The later
Response model writes the roleplay response.
</system>

system, preset context only:
<preset>                         # preset context only
<purpose>
Reference definitions and constraints used to fill the Planner template.
Commands here that request a final roleplay response belong to the later
Response model, not this task.
</purpose>
...enabled active-preset prompts...
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
<planner_template>
...native-expanded literal Planner textbox...
</planner_template>

system:
Begin Planning now. Start output immediately with the Planner template's first
section, preserve its structure, and fill it sequentially. Output only the
completed Planning document.
```

The start command is also `system` when selected history contains a real user
turn. A greeting swipe or regenerate has no user turn; only in that case the
start command is `user` so Gemini receives request contents. The task, preset,
boundaries, and template remain system messages.

The system task makes the hierarchy explicit: the only product is the completed
Planning document; preset commands that request a roleplay response are
reference constraints for the later Response model. The final instruction
starts output with the template's first section immediately. Extension-authored
instructions call the artifact Planning and do not describe it as reasoning or
thinking.

The current user turn is part of history because SillyTavern saves it before the
Planner runs.

Recent-message depth applies to preceding visible history. The current user
turn remains present even when depth is zero, because it is the event being
planned.

# Context choices

- **Minimal context:** system task, selected history, optional Summaryception,
  Planner template, then the instruction to begin Planning.
- **Current active preset context:** the same packet with every enabled,
  non-empty active-preset prompt added inside one `<preset>` block. Structural
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
- A user Stop aborts the request.

# Output boundary

An unstructured template accepts any nonblank normal-content string. A
structured template requires the output to start with its first Markdown
heading and retain every phase identity and gate number in template order;
Markdown level and explanatory suffix may vary. Preserve the
accepted output's exact bytes for disclosure and Response handoff. Blank or
structurally invalid content fails before a Response call. Provider-hidden
reasoning is never substituted for normal content. A provider's documented
transport-error envelope is a failed request, not model content.

The earlier system-only packet is superseded. Live Gemini 3.7 Flash testing
showed that Scylla converted its sole system message into a system instruction
and rejected the request because no Gemini `contents` remained. The same exact
MAX prompt succeeded as one user message.

The later contextless user-only packet is also superseded. It could run Gemini,
but it could not fill MAX from the current scene. Live Minimal and preset-context
checks each produced filled MAX Planning from the latest copied chat before
Response generation.

Scene prose that does not preserve the complete structured template is not
accepted as Planning and cannot start Response.

The product meaning comes from David's direction.[^david-direction] The exact
native-macro behavior was already exercised by the old bare implementation,
but this repository must implement and test it independently.[^prior-bare-contract]

[^david-direction]: [David's simple Planner and Response direction](../sources/david-simple-planner-response-direction-2026-08-19.md)
[^prior-bare-contract]: AGAPE Lite commit `4f99299`, used only as implementation reference.
