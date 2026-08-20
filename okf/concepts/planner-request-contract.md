---
type: Model Request Contract
title: Planner Request Contract
description: Defines the exact bare request sent to the selected Planner model.
tags: [planner, request, macros]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-19T20:34:45Z }
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
---

# Stored prompt

This contract transfers the bare Planner piece David referred to as already
available. It defines the new repository's target behavior, but it does not
claim that behavior has been implemented here.

The extension stores the custom Planner prompt literally. Saving it does not
call either model.

At operation time, the extension passes the literal prompt to SillyTavern's
native `context.substituteParams(prompt)` function with normal/default
behavior. It does not implement another macro language and does not scan chat
messages to imitate `{{lastUserMessage}}`.

This native expansion includes SillyTavern variables and macros such as
`{{getvar::...}}`, `{{roll::...}}`, and `{{trim}}`. Expansion occurs once before
the Planner request. The Planner's output is not expanded again.

# Exact Planner packet

The selected Planner profile receives exactly one message:

```json
[
  {
    "role": "system",
    "content": "<native-expanded custom Planner prompt>"
  }
]
```

No current user message, history, character card, persona, lore, skill,
Summaryception result, product prompt, preset content, or old Planner source is
added as another message.

# Transport boundary

- Use the current or selected Planner connection profile, or the configured
  direct custom Chat Completion API.
- Use one optional model override; otherwise use the profile's model. A direct
  custom API requires its own model value.
- Request ordinary visible model content.
- Do not request or parse the old structured Planning schema or terminal tool.
- Do not include the selected profile's preset or instruct template.
- Stream exact normal content into the assistant message's native reasoning
  disclosure before Response generation starts.
- A user Stop aborts the request.

# Output boundary

Any nonblank normal-content string is valid Planner output. Preserve its exact
bytes for disclosure and Response handoff. Blank normal content fails before a
Response call. Provider-hidden reasoning is never substituted for normal
content. A provider's documented transport-error envelope is a failed request,
not model content.

The product meaning comes from David's direction.[^david-direction] The exact
native-macro behavior was already exercised by the old bare implementation,
but this repository must implement and test it independently.[^prior-bare-contract]

[^david-direction]: [David's simple Planner and Response direction](../sources/david-simple-planner-response-direction-2026-08-19.md)
[^prior-bare-contract]: AGAPE Lite commit `4f99299`, used only as implementation reference.
