# AGAPE Planner Response

This repository is the clean transfer target for a small SillyTavern extension:

```text
native SillyTavern Send
-> custom Planner prompt
-> Planner output in native reasoning
-> normal active preset and chat with Planning last
-> selected Response connection
-> visible assistant response
```

It does not inherit AGAPE Lite's abandoned Planner architecture.

## Read first

1. [`AGENTS.md`](AGENTS.md) defines how work is performed.
2. [`okf/index.md`](okf/index.md) is the current knowledge map.
3. [`okf/concepts/product-identity.md`](okf/concepts/product-identity.md) owns
   product scope and implementation status.
4. [`okf/concepts/response-request-contract.md`](okf/concepts/response-request-contract.md)
   owns the accepted Planner-to-Response handoff.
5. [`docs/BUILD_MAP.md`](docs/BUILD_MAP.md) gives the implementation order.
6. [`docs/REUSE_MAP.md`](docs/REUSE_MAP.md) identifies the useful old pieces
   without treating the old codebase as the new foundation.

The current implementation state is recorded only in the product identity
concept. Do not infer it from this README.

## Development

Run the deterministic suite with:

```bash
npm test
```

Live development uses only `/home/opc/SillyTavern-Dev`. The extension source is
mounted there from this repository as `agape-planner-response`; main
SillyTavern is not a development target.
