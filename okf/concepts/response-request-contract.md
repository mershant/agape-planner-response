---
type: Model Request Contract
title: Response Request Contract
description: Owns the accepted normal SillyTavern Response prompt with exact Planning last.
tags: [response, request, active-preset]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-19T20:34:45Z }
sources:
  - id: david-direction
    resource: /sources/david-simple-planner-response-direction-2026-08-19.md
    title: David's simple Planner and Response direction
    author: human:david
    last_modified: 2026-08-19
  - id: david-exact-direction
    resource: /sources/david-exact-planner-response-direction-2026-08-19.md
    title: David's exact Planner to Response direction
    author: human:david
    last_modified: 2026-08-19
---

# Accepted relationship

The Response is an ordinary SillyTavern roleplay generation that follows visible
Planning in the same native Send operation.[^david-exact-direction]

SillyTavern first assembles the normal Chat Completion request from the current
chat, character, persona, lore, active preset, enabled prompt blocks, and other
native context. The extension then appends exactly one final message:

```jsonc
// existing normal SillyTavern messages remain unchanged, followed by:
{
  "role": "system",
  "content": "<exact Planner normal-content output>"
}
```

That final content is not macro-expanded, parsed, summarized, wrapped, labeled,
or rewritten. It is the last prompt message the Response model sees.

# Complete contract

| Choice | Accepted behavior |
|---|---|
| Planner output placement | Exact Planner normal content is the final `system` message after the complete normal SillyTavern request. |
| Additional instructions | None. |
| Conversation history and current user message | Included normally by SillyTavern. |
| Response preset | The user's active preset is the default. A selected Response profile applies for that Send without becoming the user's lasting selection. |
| Completion transport | Chat Completion first. Use the current or selected profile, or direct custom API. |
| Model | One optional Response model override; otherwise use the connection profile's model. |
| Token handling | Use the selected Response preset's normal allowance. |
| Streaming | Stream ordinary visible content. |
| Output acceptance | Any nonblank normal model content; preserve exact content. A provider's documented transport-error envelope remains a failed request. |
| Native placement | Planner output completes in native reasoning before Response text begins in the same assistant message. |
| Provider-hidden reasoning | Never replace or overwrite Planner output with Response-provider hidden reasoning. |
| Stop | Abort the active Response request through the operation's single signal. |
| Failure after Planning | Keep the assistant shell and set its visible text exactly to `Response failed.`; add no retry or swipe behavior. |

RP-01 is superseded. It incorrectly made Planning the whole Response request
and excluded the normal preset and chat.

[^david-direction]: [David's simple Planner and Response direction](../sources/david-simple-planner-response-direction-2026-08-19.md)
[^david-exact-direction]: [David's exact Planner to Response direction](../sources/david-exact-planner-response-direction-2026-08-19.md)
