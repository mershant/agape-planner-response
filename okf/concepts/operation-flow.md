---
type: Operation Contract
title: Planner to Response Operation Flow
description: Defines the ordered native Send operation without inventing packet details.
tags: [runtime, planner, response, native-send]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-19T11:17:14Z }
sources:
  - id: david-direction
    resource: /sources/david-simple-planner-response-direction-2026-08-19.md
    title: David's simple Planner and Response direction
    author: human:david
    last_modified: 2026-08-19
---

# Flow

One ordinary native SillyTavern Send runs one ordered operation:[^david-direction]

1. SillyTavern saves the user's message.
2. The extension takes ownership of that exact Send and prevents a duplicate
   host-generated assistant response.
3. SillyTavern expands native macros in the literal custom Planner prompt.
4. The selected Planner profile receives the packet defined by
   [Planner Request Contract](planner-request-contract.md).
5. Nonblank normal Planner content is shown exactly in the native Planning or
   reasoning disclosure.
6. The selected Response profile receives only the packet approved in
   [Response Request Contract](response-request-contract.md).
7. Normal Response content streams into and commits as the native assistant
   response.

The Response request cannot begin before the Planner request completes with
nonblank normal content. Exact Planner output is not parsed, summarized,
rewritten, schema-validated, or replaced with provider-hidden reasoning.

# Cancellation

Native Stop cancels the currently active model request through the operation's
single abort controller. Cancellation must not allow the second model to start
after the first is cancelled.

# Undecided failure behavior

The exact visible behavior after a Response failure is part of the pending
Response contract. Implementation must not silently inherit AGAPE Lite's
warning message, anchored-planning swipe behavior, or retry rules.

[^david-direction]: [David's simple Planner and Response direction](../sources/david-simple-planner-response-direction-2026-08-19.md)
