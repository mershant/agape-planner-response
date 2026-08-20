# AGAPE Planner Response

This repository is the clean transfer target for a small SillyTavern extension:

```text
native SillyTavern Send
-> custom Planner template
-> Planner output in native Planning
-> normal active preset and chat with Planning last
-> selected Response connection
-> visible assistant response
```

It does not inherit AGAPE Lite's abandoned Planner architecture.

The Planner can use Minimal context or copy the enabled prompts from the current
active preset into one `<preset>` block. History can be full or depth-limited.
Summaryception can be included only with full history.

## Install

In SillyTavern, open **Extensions**, choose **Install Extension**, and enter:

```text
https://github.com/mershant/agape-planner-response
```

After installation, reload SillyTavern and configure **AGAPE Planner Response**
in the Extensions settings drawer. The extension starts disabled until it has
a Planner template and connections configured.

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
