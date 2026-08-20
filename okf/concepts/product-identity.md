---
type: Product Definition
title: AGAPE Planner Response Product Identity
description: Defines the clean two-model SillyTavern extension and owns implementation status.
tags: [agape, sillytavern, planner, response]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-20T07:53:49Z }
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

# Product

AGAPE Planner Response is a new, clean SillyTavern extension built around one
inspectable relationship:[^david-direction]

```text
native SillyTavern Send
-> user-authored custom Planner prompt
-> Planner model
-> exact visible Planner output
-> normal SillyTavern Response prompt with Planning last
-> Response model
-> visible native assistant response
```

The new repository exists to avoid extending or cleaning around AGAPE Lite's
abandoned Planner architecture. The old repository supplies proven host seams,
not the new product foundation.

# Current implementation state

- **Repository foundation:** written in the canonical workspace; strict OKF
  v0.2 validation passed with no issues.
- **Exact Planner packet:** implemented, deterministically tested, and observed
  live with a native variable expanded in its sole system message.
- **Exact Response packet:** implemented, deterministically tested, and observed
  live as the normal preset/chat request followed by exact Planning as its final
  system message.
- **Runtime extension:** written and loaded from the canonical repository into
  isolated SillyTavern Dev.
- **Automated tests:** 26 deterministic tests pass.
- **Live SillyTavern Dev proof:** ordinary Send completed through selected-profile
  and direct-custom transports; one assistant message retained Planning and
  Response; both Stop phases, failure text, settings persistence, message
  persistence, packet ordering, profile preservation, and desktop/mobile drawer
  layout were observed. The latest main-chat capsule could not be activated
  because Dev lacks its proxy password; the snapshot guard prevented a partial
  or credential-copying activation, so live proof used Dev's Test Environment.
- **Acceptance:** not granted.
- **Release:** published as a public SillyTavern extension at
  `https://github.com/mershant/agape-planner-response` after David directed
  publication for installation on main.

Only this section owns changing implementation and acceptance status.

# Current boundary

This concept owns the extension's one enable switch, literal Planner prompt,
and two model connections:

- enable or disable;
- Planner connection: current or selected SillyTavern profile, or direct custom
  Chat Completion API;
- Response connection: current or selected SillyTavern profile, or direct
  custom Chat Completion API;
- literal custom Planner prompt.

Each connection has one optional model override. When it is blank, a selected
profile's own model is used. Direct custom API keys remain in SillyTavern's key
store rather than extension settings.

Normal SillyTavern Send starts the operation. A separate manual run path is not
part of the current boundary. SillyTavern owns native macro expansion, profile
and API transport, active preset assembly, reasoning display, assistant-message
display, and Stop.

The exact Planner request is owned by
[Planner Request Contract](planner-request-contract.md). The exact handoff is
owned by [Response Request Contract](response-request-contract.md). RP-01 and
AGAPE Lite's old CHATTER path are superseded because both exclude the ordinary
active SillyTavern Response prompt.

# Excluded architecture

No phase scaffold, EGO system, mode system, lore injection, Summaryception,
planning store, swipe lineage, renderer constitution, closed-world audit,
privacy firewall, or structured Planning protocol enters the clean core unless
David later directs a separately bounded addition.

[^david-direction]: [David's simple Planner and Response direction](../sources/david-simple-planner-response-direction-2026-08-19.md)
