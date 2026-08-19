---
type: Host Integration Contract
title: SillyTavern Integration
description: Defines native host ownership and the isolated development environment.
tags: [sillytavern, integration, development]
status: stable
generated: { by: opencode/gpt-5.6-sol, at: 2026-08-19T11:17:14Z }
sources:
  - id: david-direction
    resource: /sources/david-simple-planner-response-direction-2026-08-19.md
    title: David's simple Planner and Response direction
    author: human:david
    last_modified: 2026-08-19
---

# Extension boundary

The product is a SillyTavern third-party extension. Its eventual manifest uses
the host generation interceptor so ordinary native Send starts the approved
[operation](operation-flow.md).[^david-direction]

The settings drawer exposes only the controls owned by
[Product Identity](product-identity.md).

Changing or saving a setting never calls a model. Normal Send is the current
run trigger; no separate Plan-only or manual-run button is currently defined.

# Native ownership

Use SillyTavern's own services for:

- `substituteParams` macro expansion;
- connection-profile selection and request transport;
- native reasoning display for Planner output;
- assistant shell, streaming update, and final reply persistence;
- generation Stop and host-generation interception.

The extension must not imitate these features with a second macro parser,
standalone message store, or competing response UI.

# Development isolation

The canonical source repository is:

```text
/home/opc/projects/st-extensions/agape-planner-response
```

Development and live checks use only:

```text
/home/opc/SillyTavern-Dev
std.blenny-tet.ts.net
```

David's main SillyTavern files, process, data, and URL remain untouched. A
development mount into the isolated checkout may be created only when runtime
implementation is authorized.

# Repository independence

The extension must contain its own runtime and tests. It may not import from
`/home/opc/agape-lite`, depend on that checkout, or require its retired project
history.

[^david-direction]: [David's simple Planner and Response direction](../sources/david-simple-planner-response-direction-2026-08-19.md)
