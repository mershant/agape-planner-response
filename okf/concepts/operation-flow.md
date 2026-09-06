---
type: Operation Contract
title: Planner to Response Operation Flow
description: Defines the ordered native Send operation without inventing packet details.
tags: [runtime, planner, response, native-send]
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
  - id: david-generation-candidate
    resource: /sources/david-generation-candidate-performance-2026-08-20.md
    title: David's generation candidate and performance correction
    author: human:david
    last_modified: 2026-08-20
---

# Flow

One normal, swipe, or regenerate assistant candidate runs one ordered
operation:[^david-generation-candidate]

1. For normal, SillyTavern saves the user's message. Swipe and regenerate use
   the existing terminal user turn and exclude the assistant candidate being
   replaced from Planner history.
2. The extension takes ownership of that candidate and immediately opens its
   native assistant message or swipe slot.
3. The extension reads the selected visible history, optional Summaryception,
   and, in preset context, enabled prompts from the current active preset.
4. SillyTavern expands native macros in the literal custom Planner template and
   copied preset prompts.
5. The selected Planner profile receives the packet defined by
   [Planner Request Contract](planner-request-contract.md).
6. Normal Planner content streams into the native Planning disclosure. The
   Response does not start until nonblank Planning completes.
7. Only after Planning completes, SillyTavern assembles the candidate's normal
   active Response prompt. Exact Planning is
   appended as the final `system` message under every preset prompt.
8. The chosen Response connection streams normal content into the same native
   assistant message. A blank or too-short Response is sent again as the
   identical request until it is acceptable or the retry count is exhausted,
   then the result is committed once.

The complete operation makes exactly one Planner request. After Planning, it
makes one Response request plus up to the configured number of identical
retries when that Response is blank or shorter than the minimum word count.
Prompt assembly is local work and cannot make another model request.

Runtime ownership follows the proven SillyTavern extension kernel: the exact
newly saved terminal user turn binds normal generation; normal, swipe, and
regenerate candidates run through one serialized queue; a newer candidate or
chat switch interrupts the old operation and waits for rollback; one abort
controller spans both requests.

Planning uses SillyTavern's `ReasoningHandler` and Response uses
`updateMessageBlock`, each behind the operation's coalesced update boundary.
Final commit uses native `saveReply({ type: 'appendFinal' })` and native chat
persistence. The extension does not maintain a competing message store or
chat-wide mutation observer.

Planning uses SillyTavern's native disclosure renderer. Response uses
SillyTavern's message formatter with native-style temporary balancing for
incomplete Markdown. The candidate owns its generation start, first-Planning,
and finish timestamps so the displayed timer covers the complete
Planner-to-Response operation even though local Response prompt assembly
calls a host dry run.

The Response request cannot begin before the Planner request completes with
nonblank visible Planning. Exact Planning is not summarized, rewritten,
macro-expanded a second time, or replaced with provider-hidden reasoning. The
extension does not judge whether Planning followed or completed the user's
template.

# Cancellation

Native Stop cancels the currently active model request through the operation's
single abort controller. Cancellation must not allow Response to start after
Planner is cancelled. Stop during any Response attempt ends the retry loop;
no further attempts.

# Response failure

The exact visible behavior after a Response failure is owned by the accepted
[Response Request Contract](response-request-contract.md). It does not inherit
AGAPE Lite's warning message or anchored-planning swipe behavior.

[^david-direction]: [David's simple Planner and Response direction](../sources/david-simple-planner-response-direction-2026-08-19.md)
[^david-generation-candidate]: [David's generation candidate and performance correction](../sources/david-generation-candidate-performance-2026-08-20.md)
