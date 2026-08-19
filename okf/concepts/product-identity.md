---
type: Product Definition
title: AGAPE Planner Response Product Identity
description: Defines the clean two-model SillyTavern extension and owns implementation status.
tags: [agape, sillytavern, planner, response]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-19T11:17:14Z }
sources:
  - id: david-direction
    resource: /sources/david-simple-planner-response-direction-2026-08-19.md
    title: David's simple Planner and Response direction
    author: human:david
    last_modified: 2026-08-19
---

# Product

AGAPE Planner Response is a new, clean SillyTavern extension built around one
inspectable relationship:[^david-direction]

```text
native SillyTavern Send
-> user-authored custom Planner prompt
-> Planner model
-> exact visible Planner output
-> Response model
-> visible native assistant response
```

The new repository exists to avoid extending or cleaning around AGAPE Lite's
abandoned Planner architecture. The old repository supplies proven host seams,
not the new product foundation.

# Current implementation state

- **Repository foundation:** written in the canonical workspace; strict OKF
  v0.2 validation passed with no issues.
- **Exact Planner packet:** specified from the previously approved bare Planner behavior; not implemented in this repository.
- **Exact Response packet:** proposed but not approved.
- **Runtime extension:** not started; requires exact Response contract approval
  and a separate implementation directive from David.
- **Automated tests:** not started.
- **Live SillyTavern Dev proof:** not started.
- **Acceptance and release:** not granted.

Only this section owns changing implementation and acceptance status.

# Current boundary

This concept owns the extension's one enable switch and three configuration
values:

- enable or disable;
- Planner connection profile;
- Response connection profile;
- literal custom Planner prompt.

Normal SillyTavern Send starts the operation. A separate manual run path is not
part of the current boundary. SillyTavern owns native macro expansion, selected
profile transport, reasoning display, assistant-message display, and Stop.

The exact Planner request is owned by
[Planner Request Contract](planner-request-contract.md). The exact handoff is
owned by [Response Request Contract](response-request-contract.md) and must not
be inferred from AGAPE Lite's old CHATTER path.

# Excluded architecture

No phase scaffold, EGO system, mode system, lore injection, Summaryception,
planning store, swipe lineage, renderer constitution, closed-world audit,
privacy firewall, or structured Planning protocol enters the clean core unless
David later directs a separately bounded addition.

[^david-direction]: [David's simple Planner and Response direction](../sources/david-simple-planner-response-direction-2026-08-19.md)
