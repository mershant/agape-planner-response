---
type: Model Request Contract
title: Response Request Contract
description: Owns the proposed exact Planner-to-Response packet and approval gate.
tags: [response, request, approval-required]
status: draft
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-19T11:17:14Z }
sources:
  - id: david-direction
    resource: /sources/david-simple-planner-response-direction-2026-08-19.md
    title: David's simple Planner and Response direction
    author: human:david
    last_modified: 2026-08-19
---

# Current approved boundary

The Response model follows the Planner in the same native Send operation and
produces the visible assistant response.[^david-direction]

The exact request packet is not yet approved. No runtime implementation may
infer it from AGAPE Lite or treat the candidate below as current authority.

# RP-01 proposed complete contract

State: **proposed, awaiting David's explicit approval or replacement**. No
field below is approved merely because it appears in this candidate.

```json
[
  {
    "role": "system",
    "content": "<exact Planner normal-content output>"
  }
]
```

The proposed JSON and every row below are one contract:

| Choice | RP-01 proposal |
|---|---|
| Planner output placement | Exact Planner normal content is the sole `system` message. |
| Additional instructions | None. |
| Conversation history | None. |
| Current user message | No separate message; any needed input must already have reached Planner through the user-authored prompt and native macros. |
| Response profile preset | Excluded. |
| Instruct template | Excluded. |
| Completion transport | SillyTavern chooses chat or text completion from the selected profile. |
| Token handling | The extension supplies no private cap or override; SillyTavern's selected-profile transport owns its normal allowance. |
| Streaming | Stream ordinary visible content. |
| Output acceptance | Any nonblank normal-content string; preserve exact content. |
| Native placement | Planner output in native reasoning and Response output in the same native assistant message. |
| Provider-hidden reasoning | Never substitute it for normal Response content. |
| Stop | Abort the active Response request through the operation's single signal. |
| Failure after Planning | Keep the assistant shell and set its visible text exactly to `Response failed.`; add no retry or swipe behavior. |

# Approval gate

Before runtime work, show RP-01's JSON and complete table to David. David may:

- approve `RP-01`;
- replace one or more exact fields;
- reject it and supply another relationship.

Approving `RP-01` means approving the JSON and every table row. A partial
answer changes only the named fields and leaves the complete contract
unapproved. Record the decision in a source note, then update this concept to
contain one accepted contract.

Even complete contract approval does not start runtime implementation. David
must separately direct that work.

[^david-direction]: [David's simple Planner and Response direction](../sources/david-simple-planner-response-direction-2026-08-19.md)
