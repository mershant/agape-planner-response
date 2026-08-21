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

Normal, swipe, and regenerate each run their own two-request operation: one
Planner request followed by one Response request. A swipe stores its own
Planning with that swipe. Continue remains native SillyTavern behavior.

It does not inherit AGAPE Lite's abandoned Planner architecture.

The Planner can use Minimal context or copy the enabled prompts from the current
active preset as separate native-role messages inside one `<preset>` block.
History can be full or depth-limited.
Summaryception can be included only with full history.

The preset block is reference material for the later roleplay response. A
separate task after history tells the Planner to fill the user's template. The
Planner and Response profile/model choices remain separate through their two
HTTP requests, including model-specific request-body cleanup when the active
preset was configured for a different model family.

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
