# Update Log

## 2026-08-20

- **Generation correction**: Moved ownership from Send to each normal, swipe, or regenerate assistant candidate; each path now makes exactly one Planner request and one Response request.
- **Performance correction**: Opened the candidate before context assembly, moved Response assembly after Planning, throttled stream DOM writes to 50 ms, and removed the chat-wide mutation observer.
- **Candidate proof**: Live normal, swipe, and regenerate checks each made exactly two Gemini 3.7 Flash requests. Normal opened in 342 ms with a 247 ms worst browser-heartbeat gap; swipe added one planned slot and regenerate replaced without changing chat length.
- **Context correction**: Replaced the contextless Planner with David's task/history/template/start wrapper, full or depth-limited history, full-history-only Summaryception, and Minimal or one-block active-preset context.
- **Live proof**: On the latest copied FF5 chat, Minimal produced 11,200 characters of filled MAX Planning and preset context produced 5,146 characters with 36 enabled prompts inside one `<preset>` block; each completed before a normal Gemini 3.7 Flash Response.
- **Fix**: Changed the sole Planner message from `system` to `user` after reproducing Gemini 3.7 Flash's `contents is not specified` failure with the exact FF5 MAX prompt through Scylla.
- **Live proof**: Activated the latest main-chat capsule through the `rp-prompting` snapshot tool and observed MAX Planning followed by the normal FF5 Response on Gemini 3.7 Flash.
- **Release**: Published the live-proven extension at `https://github.com/mershant/agape-planner-response` for installation through SillyTavern's extension installer.

## 2026-08-19

- **Implementation**: Added the complete Chat Completion extension with profile and direct-custom connections, model overrides, native Planning, active-preset Response assembly, Stop, and one-message persistence.
- **Evidence**: Recorded 26 passing deterministic tests and isolated live Send, packet, persistence, layout, selected-profile, direct-custom, failure, and both Stop checks in [Product Identity](concepts/product-identity.md).
- **Isolation**: The latest safe chat capsule was captured read-only, but Dev activation correctly stopped because its proxy credential is absent; no main credential or configuration was copied.
- **Correction**: Replaced RP-01 with David's accepted normal SillyTavern Response request plus exact Planning as the final message.
- **Authorization**: Recorded full runtime implementation and isolated SillyTavern Dev proof as authorized work.
- **Creation**: Established the clean product boundary and implementation-status owner in [Product Identity](concepts/product-identity.md).
- **Creation**: Recorded the native two-model sequence in [Operation Flow](concepts/operation-flow.md).
- **Creation**: Separated the accepted Planner packet from the proposed Response packet in [Planner Request Contract](concepts/planner-request-contract.md) and [Response Request Contract](concepts/response-request-contract.md).
- **Creation**: Recorded isolated host integration and evidence boundaries in [SillyTavern Integration](concepts/sillytavern-integration.md) and [Acceptance Contract](concepts/acceptance-contract.md).
