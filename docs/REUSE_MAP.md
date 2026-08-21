# AGAPE Lite Reuse Map

The old AGAPE Lite repository proves that several required SillyTavern seams
can work. It is reference material, not a dependency or current product
authority.

Reference repository:

```text
/home/opc/agape-lite
```

Useful checkpoints:

- `c942957` - bare custom Planner prompt drawer;
- `4f99299` - native macro expansion and bare SHADOW Planning.

## Reuse behavior, not files

| Required behavior | Old reference | Transfer rule |
|---|---|---|
| Literal prompt persistence | `src/defaults.mjs`, `src/ui-controller.mjs` | Reimplement only the new settings keys and passive save behavior. |
| Native macro expansion | `collectBareTurnSnapshot()` in `src/source-snapshot.mjs` | Call `context.substituteParams(prompt)` with normal/default behavior. Do not scan chat text. |
| Planner packet | `buildBareShadowMessages()` in `src/shadow-prompt.mjs` only proves a separate request is possible | Build the accepted native role sequence. Extension-authored task, preset wrapper, boundaries, template, and start are `system`; actual conversation retains `user` and `assistant`. Do not revive the one-message blob. |
| Nonblank exact Planner output | `validateBarePlanningOutput()` in `src/planning-operation.mjs` | Recreate as a small visible-content check. |
| Ordinary profile streaming | `streamProfileText()` in `src/profile-client.mjs` | Extract only the ordinary profile request shape and cumulative text handling. |
| Native Planning display | `src/native-reasoning-bridge.mjs` | Adapt SillyTavern's disclosure integration without render-lane metadata. |
| Native assistant commit | `src/native-message-transaction.mjs` | Rebuild the shell, stream, commit, rollback, and ownership checks without anchors or legacy records. |
| Native Send interception | SillyTavern's current extension API; old `src/runtime.mjs` only as evidence that interception is possible | Design fresh around saved-user-turn ownership, host abort, active cancellation, and one operation. Do not copy the old normal-run path. |

## Do not transfer

Do not copy or revive:

- the L0-L8 Planner scaffold;
- the old EGO, skills, lore, Summaryception-retrieval instructions, or
  source-preset compiler; the new extension only reads the bounded active-preset
  and Summaryception context required by the current contract;
- `/self` and `/selfq` modes;
- `buildShadowMessages()` and its old prompt sources;
- `validatePlanningBrief()` or `extractRendererScope()`;
- CHATTER constitutions and closed-world audits;
- planning anchors, planning stores, swipe lineage, or operation receipts;
- privacy redaction, packet audits, or the final-prompt firewall;
- raw Scylla Planning contracts, tool calls, or structured Planning output;
- retry ledgers, model allowlists, or output-specific workarounds;
- render lanes and versioned render records.

## Proof to carry forward

The new tests may adapt these old test intentions, but must use new local
fixtures and names:

- `tests/settings.test.mjs`: literal prompt persistence;
- `tests/ui-controller.test.mjs`: editing does not dispatch models;
- `tests/shadow-prompt.test.mjs`: exact native Planner role sequence;
- `tests/source-snapshot.test.mjs`: native macro ownership and no chat scan;
- `tests/planning-operation.test.mjs`: nonblank exact visible output;
- `tests/profile-client.test.mjs`: ordinary profile request shape;
- `tests/native-message-transaction.test.mjs`: native shell and final commit.

Do not transplant the old normal-run runtime tests. Build a new focused harness
from the approved operation and packet contracts.

The old tests prove only the old checkpoints. The new repository must run and
own its own tests before claiming the behavior is tested.
