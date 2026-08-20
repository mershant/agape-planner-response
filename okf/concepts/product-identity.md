---
type: Product Definition
title: AGAPE Planner Response Product Identity
description: Defines the clean two-model SillyTavern extension and owns implementation status.
tags: [agape, sillytavern, planner, response]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-20T17:34:35Z }
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
  - id: david-gemini-failure
    resource: /sources/david-gemini-planner-failure-2026-08-20.md
    title: David's Gemini Planner failure report
    author: human:david
    last_modified: 2026-08-20
  - id: david-planner-context
    resource: /sources/david-planner-context-contract-2026-08-20.md
    title: David's Planner context contract
    author: human:david
    last_modified: 2026-08-20
  - id: david-generation-candidate
    resource: /sources/david-generation-candidate-performance-2026-08-20.md
    title: David's generation candidate and performance correction
    author: human:david
    last_modified: 2026-08-20
---

# Product

AGAPE Planner Response is a new, clean SillyTavern extension built around one
inspectable relationship:[^david-direction]

```text
native SillyTavern Send
-> user-authored custom Planner template
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
  live as one contextual user message. The exact FF5 MAX prompt produced filled
  Planning through Gemini 3.7 Flash on Scylla in both Minimal and preset context.
- **Exact Response packet:** implemented, deterministically tested, and observed
  live as the normal preset/chat request followed by exact Planning as its final
  system message.
- **Runtime extension:** written and loaded from the canonical repository into
  isolated SillyTavern Dev.
- **Automated tests:** 50 deterministic tests pass.
- **Live SillyTavern Dev proof:** ordinary Send completed through selected-profile
  and direct-custom transports; one assistant message retained Planning and
  Response; both Stop phases, failure text, settings persistence, message
  persistence, packet ordering, profile preservation, and desktop/mobile drawer
  layout were observed. The latest main-chat capsule could not be activated
  during initial proof because Dev's active API did not match its existing
  Scylla credential. After aligning the Dev-owned binding, the snapshot tool
  activated the latest `Slave Market` chat and the exact FF5 MAX + Gemini 3.7
  Flash path completed live.
- **Candidate and responsiveness proof:** normal, swipe, and regenerate each made
  exactly one Planner request and one Response request. Normal opened its
  candidate in 342 ms, first Planning arrived after 8.67 seconds of provider
  latency, and the browser heartbeat's largest observed gap was 247 ms during a
  full MAX run. Swipe added one swipe slot without adding a chat message;
  regenerate replaced the candidate without changing chat length.
- **Repeated Gemini output proof:** three consecutive Gemini 3.7 Flash
  preset-context runs each produced a filled MAX artifact and then a Response,
  with exactly two model requests per candidate. Scene prose that does not
  preserve a structured Planner template is rejected before Response.
- **Latency boundary:** the candidate appeared in about 0.4 seconds. A
  candidate-specific preset-context measurement reached first visible Planning
  at 12.9 seconds. Scylla overrides for no reasoning, disabled thinking, and a
  lower token allowance did not improve first output. The remaining delay is
  upstream processing of the large FF5/MAX packet, not local Response assembly
  or per-token DOM rendering.
- **Acceptance:** not granted.
- **Release:** published as a public SillyTavern extension at
  `https://github.com/mershant/agape-planner-response` after David directed
  publication for installation on main.

Only this section owns changing implementation and acceptance status.

# Current boundary

This concept owns the extension's one enable switch, literal Planner template,
and two model connections:

- enable or disable;
- Planner connection: current or selected SillyTavern profile, or direct custom
  Chat Completion API;
- Planner context: Minimal or current active preset;
- Planner history: full or a configured recent-message depth;
- optional Summaryception when full history is selected;
- Response connection: current or selected SillyTavern profile, or direct
  custom Chat Completion API;
- literal custom Planner template.

Each connection has one optional model override. When it is blank, a selected
profile's own model is used. Direct custom API keys remain in SillyTavern's key
store rather than extension settings.

Each normal, swipe, or regenerate assistant candidate starts one operation.
Continue and quiet generations remain native and are not intercepted. A
separate manual run path is not part of the current boundary. SillyTavern owns native macro expansion, profile
and API transport, active preset assembly, Planning display, assistant-message
display, and Stop.

The exact Planner request is owned by
[Planner Request Contract](planner-request-contract.md). The exact handoff is
owned by [Response Request Contract](response-request-contract.md). RP-01 and
AGAPE Lite's old CHATTER path are superseded because both exclude the ordinary
active SillyTavern Response prompt.

# Excluded architecture

No phase scaffold, EGO system, mode system, independent lore injection,
planning store, swipe lineage, renderer constitution, closed-world audit,
privacy firewall, or structured Planning protocol enters the clean core unless
David later directs a separately bounded addition. The current bounded preset
context and read-only Summaryception options are part of the Planner context
contract; they do not revive AGAPE Lite's old compilation architecture.

[^david-direction]: [David's simple Planner and Response direction](../sources/david-simple-planner-response-direction-2026-08-19.md)
