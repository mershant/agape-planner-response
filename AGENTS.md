# AGAPE Planner Response agent instructions

## Start here

Before planning or implementation work, read `okf/index.md`, then follow only
the concepts relevant to the task.

David's current words are the highest authority. A source note, old repository,
test result, plan, or unfinished idea cannot authorize work by itself.

## Product and status ownership

`okf/concepts/product-identity.md` is the single owner of product scope and
implementation status. Do not copy its status into this file or infer later
status from files that happen to exist.

`okf/concepts/response-request-contract.md` is the single owner of the exact
Planner-to-Response packet. Its current candidate is not approved. Do not add
runtime code until David approves that complete contract or supplies a
replacement and then separately directs runtime implementation. A contract
decision is not an implementation command.

## Canonical workspace

The canonical repository is:

```text
/home/opc/projects/st-extensions/agape-planner-response
```

Develop on `main` unless David directs otherwise.

The older `/home/opc/agape-lite` repository is read-only reference material for
this project. Never modify it on behalf of this project, import it at runtime,
or copy its abandoned Planner architecture into this repository.

## Development isolation

Never develop or test against David's main SillyTavern.

Use only the separate development environment defined by
`okf/concepts/sillytavern-integration.md`.

Do not create a development mount or start a service until runtime work is
authorized.

## Working rules

- Build the smallest direct `Planner -> Response` extension described by the
  current concepts.
- Preserve SillyTavern ownership of native macros, profile requests, reasoning
  display, assistant messages, Stop, and ordinary Send behavior.
- Add no context, prompt, history, preset, validator, mode, skill, memory, or
  retry behavior unless its current concept explicitly requires it.
- Reimplement the small proven behaviors listed in `docs/REUSE_MAP.md`; do not
  copy old source files wholesale.
- Keep one concept in one authoritative document. Other files link to it.
- Work begins only from a clear directive with a target and scope.
- Completing one stage does not authorize the next stage.

## Completion language

Use the evidence states defined in `okf/concepts/acceptance-contract.md` and
report only the strongest state supported by direct evidence.
