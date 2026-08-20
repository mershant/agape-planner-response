---
type: Operation Contract
title: Planner to Response Operation Flow
description: Defines the ordered native Send operation without inventing packet details.
tags: [runtime, planner, response, native-send]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-20T09:07:29Z }
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

# Flow

One ordinary native SillyTavern Send runs one ordered operation:[^david-direction]

1. SillyTavern saves the user's message.
2. The extension takes ownership of that exact Send, opens one native assistant
   message, and prevents a duplicate host-generated response.
3. The extension reads the selected visible history, optional Summaryception,
   and, in preset context, enabled prompts from the current active preset.
4. SillyTavern expands native macros in the literal custom Planner template and
   copied preset prompts.
5. The selected Planner profile receives the packet defined by
   [Planner Request Contract](planner-request-contract.md).
6. Normal Planner content streams into the native Planning disclosure. The
   Response does not start until nonblank Planning completes.
7. SillyTavern assembles its normal active Response prompt. Exact Planning is
   appended as the final `system` message under every preset prompt.
8. The chosen Response connection streams normal content into the same native
   assistant message and commits it once.

The Response request cannot begin before the Planner request completes with
nonblank normal content. Exact Planner output is not parsed, summarized,
rewritten, schema-validated, macro-expanded a second time, or replaced with
provider-hidden reasoning.

# Cancellation

Native Stop cancels the currently active model request through the operation's
single abort controller. Cancellation must not allow the second model to start
after the first is cancelled.

# Response failure

The exact visible behavior after a Response failure is owned by the accepted
[Response Request Contract](response-request-contract.md). It does not inherit
AGAPE Lite's warning message, anchored-planning swipe behavior, or retry rules.

[^david-direction]: [David's simple Planner and Response direction](../sources/david-simple-planner-response-direction-2026-08-19.md)
