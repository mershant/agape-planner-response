# Update Log

## 2026-08-20

- **Release**: Published the live-proven extension at `https://github.com/mershant/agape-planner-response` for installation through SillyTavern's extension installer.

## 2026-08-19

- **Implementation**: Added the complete Chat Completion extension with profile and direct-custom connections, model overrides, native reasoning, active-preset Response assembly, Stop, and one-message persistence.
- **Evidence**: Recorded 26 passing deterministic tests and isolated live Send, packet, persistence, layout, selected-profile, direct-custom, failure, and both Stop checks in [Product Identity](concepts/product-identity.md).
- **Isolation**: The latest safe chat capsule was captured read-only, but Dev activation correctly stopped because its proxy credential is absent; no main credential or configuration was copied.
- **Correction**: Replaced RP-01 with David's accepted normal SillyTavern Response request plus exact Planning as the final message.
- **Authorization**: Recorded full runtime implementation and isolated SillyTavern Dev proof as authorized work.
- **Creation**: Established the clean product boundary and implementation-status owner in [Product Identity](concepts/product-identity.md).
- **Creation**: Recorded the native two-model sequence in [Operation Flow](concepts/operation-flow.md).
- **Creation**: Separated the accepted Planner packet from the proposed Response packet in [Planner Request Contract](concepts/planner-request-contract.md) and [Response Request Contract](concepts/response-request-contract.md).
- **Creation**: Recorded isolated host integration and evidence boundaries in [SillyTavern Integration](concepts/sillytavern-integration.md) and [Acceptance Contract](concepts/acceptance-contract.md).
