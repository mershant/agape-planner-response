---
type: Acceptance Contract
title: Acceptance Contract
description: Separates deterministic proof, live host proof, user acceptance, and release.
tags: [testing, acceptance, release]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-19T11:17:14Z }
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
3. Planner receives exactly its accepted request packet.
4. Blank Planner normal content prevents Response.
5. Response receives exactly its accepted request packet.
6. A successful native Send makes exactly one Planner request and one Response
   request; no failure or cancellation path makes more than one of either.
7. Planner output and Response output retain their approved native placement.
8. Stop cancels the active model and prevents later stages.
9. Host generation cannot create a duplicate assistant response.
10. Failure behavior matches the approved contract.

# Live acceptance

Use only `/home/opc/SillyTavern-Dev` and its isolated data root. Observe:

1. the extension loads after an ordinary browser refresh;
2. literal prompt and profile settings persist;
3. a normal Send produces visible Planning followed by one assistant response;
4. packet inspection matches both accepted request contracts;
5. Stop during Planner and Stop during Response each cancel cleanly;
6. no request or file touches David's main SillyTavern.

Record what was directly observed and any remaining gap. Do not label live proof
as acceptance without David's confirmation.
