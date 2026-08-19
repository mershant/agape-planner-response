# Build Map

This document describes implementation order. It does not authorize a stage or
own implementation status. See
[`product-identity.md`](../okf/concepts/product-identity.md) for current status.

## Intended responsibilities

The implementation needs narrow owners for settings, the Planner packet, the
Response packet, selected-profile transport, native message ownership, and the
single operation. File names follow those responsibilities when work begins;
they are not fixed before the smallest correct seams are known.

## Stage 1: Contract decision

1. Show David the exact proposed Response request in
   [`response-request-contract.md`](../okf/concepts/response-request-contract.md).
2. Record approval or replacement wording in a source note.
3. Update that concept so there is one accepted packet and no competing copy.
4. Update the product identity's implementation state.

No runtime file is created before this stage is accepted. Contract approval
does not start Stage 2; David must separately direct runtime implementation.

## Stage 2: Pure packet and settings code

Write deterministic code with no browser or SillyTavern dependency for:

- literal setting normalization;
- one native-expanded Planner message;
- the approved Response packet;
- nonblank visible-output checks.

Write tests first around exact input and output bytes. Saving a setting must not
dispatch a model call.

## Stage 3: Profile transport

Add one narrow adapter over SillyTavern's selected connection-profile request
service. It must:

- make one request for the supplied profile and messages;
- use the exact approved preset and instruct flags;
- stream ordinary visible content when the contract requires streaming;
- expose cancellation through one `AbortSignal`;
- never replace normal content with provider-hidden reasoning.

Do not copy AGAPE Lite's raw Scylla Planning protocol, tool schema, retry
ledger, rate-limit receipts, or model-name routing.

## Stage 4: Native message ownership

Add the smallest native transaction that:

- starts only after the saved terminal user message is identified;
- opens one assistant message shell;
- shows Planner output in SillyTavern's native reasoning display;
- streams Response text into the same assistant message;
- commits the final Response once;
- removes the provisional shell if Planner fails before handoff;
- follows the approved behavior if Response fails after Planning exists.

Failure behavior that remains undecided must return to David rather than being
invented during implementation.

## Stage 5: Native Send runtime

Wire the operation to the normal SillyTavern Send path:

```text
saved user message
-> intercept host generation
-> Planner request
-> approved Response request
-> native assistant commit
```

The host's duplicate generation must be stopped exactly once. Native Stop must
cancel whichever model request is active.

## Stage 6: Verification

Run focused tests during each stage, the full test suite at the end, and then a
live check only in the isolated environment defined by
[`SillyTavern Integration`](../okf/concepts/sillytavern-integration.md).

[`Acceptance Contract`](../okf/concepts/acceptance-contract.md) is the single
owner of deterministic and live evidence requirements. Automated tests are not
a substitute for live observation.
