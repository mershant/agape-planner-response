---
type: Acceptance Contract
title: Acceptance Contract
description: Separates deterministic proof, live host proof, user acceptance, and release.
tags: [testing, acceptance, release]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-21T04:32:19Z }
---

# Evidence states

- **Written:** the relevant files exist and were reviewed for scope.
- **Tested:** the named deterministic tests pass in this repository.
- **Live-proven:** ordinary native Send and Stop were observed through the
  isolated SillyTavern Dev UI with the real extension loaded.
- **Accepted:** David confirms the named behavior after seeing the required
  evidence.
- **Released:** David separately approves publication or deployment.

One state does not imply the next. A commit is not acceptance. Automated tests
are not live proof. An old AGAPE Lite test is not evidence for new code.

# Deterministic acceptance

The suite must prove the exact current contracts:

1. Settings save literal values without model calls.
2. Planner macro expansion is delegated once to SillyTavern.
3. Planner receives the native role-message sequence: extension-authored task,
   optional preset, boundaries, template, and start command as `system`; actual
   selected conversation retains `user` and `assistant` roles in the accepted
   order.
4. Blank Planner normal content prevents Response.
5. Response receives the unchanged normal SillyTavern request plus exact
   Planning as its final `system` message.
6. Each successful normal, swipe, or regenerate candidate makes exactly one
   Planner request and one Response request; no failure or cancellation path
   makes more than one of either.
7. Visible Planning completes in the native Planning disclosure before Response text begins
   in the same assistant message.
8. Stop cancels the active model and prevents later stages.
9. Host generation cannot create a duplicate assistant response.
10. Failure behavior matches the approved contract.
11. Swipe adds one planned swipe slot without adding a chat message. Regenerate
    replaces the candidate without changing chat length. Continue is not
    intercepted.
12. The candidate and Planning disclosure appear before Response prompt
    assembly. Stream updates are throttled and the browser remains responsive.
13. Planner input uses native roles: extension instructions are system messages;
    actual selected history retains assistant and user roles.
14. Planning and Response Markdown are rendered during streaming through
    SillyTavern's formatters, including temporary balancing for incomplete
    Markdown.
15. The native timer covers the complete Planner-to-Response operation and
    records first visible Planning separately.
16. Normal generation binds the exact `MESSAGE_SENT` terminal user object.
    Replacement runs are serialized; Stop and chat changes abort the active
    controller before later stages can write.
17. Visible transport returns first-delta and total metrics for Planner and
    Response while ignoring provider-hidden content.

# Live acceptance

Use only `/home/opc/SillyTavern-Dev` and its isolated data root. Observe:

1. the extension loads after an ordinary browser refresh;
2. literal prompt and profile settings persist;
3. a normal Send produces visible Planning followed by one assistant response;
4. packet inspection shows native Planner macro values and exact Planning as
   the final Response message beneath all active preset prompts;
5. Stop during Planner and Stop during Response each cancel cleanly;
6. no request or file touches David's main SillyTavern.
7. normal, swipe, and regenerate each show exactly two model requests in network
   inspection, and the page remains interactive during full-MAX Planning.
8. repeated Gemini 3.7 Flash preset-context runs produce filled template
   structure rather than a roleplay response; first-visible-Planning latency is
   reported separately from local candidate startup.
9. on the latest snapshot, normal, swipe, regenerate, Planner Stop, and Response
   Stop each satisfy request counts, ownership, rendering, timing, and rollback
   behavior before STD is restored.

Record what was directly observed and any remaining gap. Do not label live proof
as acceptance without David's confirmation.
