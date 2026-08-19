# AGAPE Planner Response

This repository is the clean transfer target for a small SillyTavern extension:

```text
native SillyTavern Send
-> custom Planner prompt
-> Planner output
-> Response model
-> visible assistant response
```

It does not inherit AGAPE Lite's abandoned Planner architecture.

## Read first

1. [`AGENTS.md`](AGENTS.md) defines how work is performed.
2. [`okf/index.md`](okf/index.md) is the current knowledge map.
3. [`okf/concepts/product-identity.md`](okf/concepts/product-identity.md) owns
   product scope and implementation status.
4. [`okf/concepts/response-request-contract.md`](okf/concepts/response-request-contract.md)
   contains the exact packet that must be reviewed before runtime work.
5. [`docs/BUILD_MAP.md`](docs/BUILD_MAP.md) gives the implementation order.
6. [`docs/REUSE_MAP.md`](docs/REUSE_MAP.md) identifies the useful old pieces
   without treating the old codebase as the new foundation.

The current implementation state is recorded only in the product identity
concept. Do not infer it from this README.
