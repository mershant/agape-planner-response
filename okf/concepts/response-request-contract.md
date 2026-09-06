---
type: Model Request Contract
title: Response Request Contract
description: Owns the accepted normal SillyTavern Response prompt with exact Planning last.
tags: [response, request, active-preset]
status: stable
generated: { by: opencode/grok-4.6, at: 2026-09-06T07:30:00Z }
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
| Output acceptance | A Response is acceptable when it is nonblank and at least the configured minimum word count, default 100. Words are counted by a simple whitespace split. Preserve exact acceptable content. A provider's documented transport-error envelope remains a failed request, not model content. |
| Response retries | Blank or too-short Responses are retried automatically. Retry count is configurable, default 5. Each attempt sends the identical Response request: no nudge text, no prompt changes, and the exact Planning bytes reused. The Planner is never re-run. |
| Native placement | Planner output completes in native Planning before Response text begins in the same assistant message. |
| Provider-hidden reasoning | Never replace or overwrite Planner output with Response-provider hidden reasoning. |
| Stop | Abort the active Response request through the operation's single signal. Stop during any attempt ends the retry loop; no further attempts. |
| Failure after Planning | If every attempt is blank or a failed transport, keep the assistant shell and set its visible text exactly to `Response failed.` If retries run out after a short-but-nonblank attempt, keep that last attempt as the visible Response. |

The Planner and Response choices remain separate through the actual HTTP
requests. A model override changes only its own stage. When the selected
Response model is incompatible with generation-only fields from the selected
preset, the extension removes those incompatible fields for that Response
request without changing the captured Response prompt messages. A GPT 5
Response, for example, does not receive Gemini's `thinking` body or unsupported
sampling fields.

RP-01 is superseded. It incorrectly made Planning the whole Response request
and excluded the normal preset and chat.

[^david-direction]: [David's simple Planner and Response direction](../sources/david-simple-planner-response-direction-2026-08-19.md)
[^david-exact-direction]: [David's exact Planner to Response direction](../sources/david-exact-planner-response-direction-2026-08-19.md)
