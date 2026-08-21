#!/usr/bin/env python3

import json
import os
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


URL = "http://127.0.0.1:8001"
STORAGE_STATE = "/home/opc/.local/share/openchamber/playwright/std-storage-state.json"
EXTENSION = "third-party/agape-planner-response"
PROFILE = "ff5 micro"
PLANNER_MODEL = os.environ.get("AGAPE_PLANNER_MODEL", "gemini-3.7-flash")
RESPONSE_MODEL = os.environ.get("AGAPE_RESPONSE_MODEL", "gemini-3.7-flash")
CHARACTER = "Caius"


def structure_markers(text):
    markers = []
    for source_line in text.splitlines():
        line = source_line.strip()
        heading = re.match(r"^#{1,6}\s+(.+)$", line)
        phase = re.match(r"^PHASE\s+([A-Z0-9]+)", line, re.IGNORECASE)
        gate = re.match(r"^GATE\s+(\d+)", line, re.IGNORECASE)
        if heading and not markers:
            markers.append(heading.group(1).strip().casefold())
        elif phase:
            markers.append(f"phase {phase.group(1).upper()}")
        elif gate:
            markers.append(f"gate {gate.group(1)}")
    return markers


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(storage_state=STORAGE_STATE)
        page = context.new_page()
        page.add_init_script(
            """(() => {
                const nativeFetch = window.fetch.bind(window);
                window.__agapeRawFetches = [];
                window.fetch = async (...args) => {
                    const input = args[0];
                    const url = typeof input === 'string' ? input : input?.url ?? '';
                    const started = performance.now();
                    const response = await nativeFetch(...args);
                    if (!url.includes('/api/backends/chat-completions/generate') || !response.body) {
                        return response;
                    }
                    const trace = {
                        responseMs: performance.now() - started,
                        chunks: [],
                        completeMs: null,
                    };
                    window.__agapeRawFetches.push(trace);
                    const [applicationBody, traceBody] = response.body.tee();
                    void (async () => {
                        const reader = traceBody.getReader();
                        while (true) {
                            const { value, done } = await reader.read();
                            if (done) break;
                            trace.chunks.push({
                                atMs: performance.now() - started,
                                bytes: value?.byteLength ?? 0,
                                text: new TextDecoder().decode(value ?? new Uint8Array()).slice(0, 500),
                            });
                        }
                        trace.completeMs = performance.now() - started;
                    })();
                    return new Response(applicationBody, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers,
                    });
                };
            })()"""
        )
        requests = []
        page.on(
            "request",
            lambda request: requests.append(request.post_data_json)
            if request.method == "POST"
            and "/api/backends/chat-completions/generate" in request.url
            and request.post_data
            else None,
        )

        page.goto(URL)
        page.wait_for_selector("#send_textarea", state="visible", timeout=120_000)
        page.wait_for_timeout(5_000)
        page.evaluate(
            """async extension => {
                const { enableExtension } = await import('/scripts/extensions.js');
                await enableExtension(extension, false);
            }""",
            EXTENSION,
        )
        page.reload()
        page.wait_for_selector("#send_textarea", state="visible", timeout=120_000)
        page.wait_for_timeout(2_000)
        if page.locator("#agape-planner-response-status").count() == 0:
            page.evaluate(
                """() => import(
                    '/scripts/extensions/third-party/agape-planner-response/index.js?live-acceptance'
                )"""
            )
        page.wait_for_selector(
            "#agape-planner-response-status",
            state="attached",
            timeout=120_000,
        )
        page.wait_for_timeout(5_000)
        configured = page.evaluate(
            """async ({ profileName, plannerModel, responseModel, character }) => {
                const context = window.SillyTavern.getContext();
                if (context.chat.length === 0) {
                    await context.SlashCommandParser.commands.go.callback({}, character);
                    const deadline = Date.now() + 30000;
                    while (context.chat.length === 0 && Date.now() < deadline) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
                await context.SlashCommandParser.commands.profile.callback(
                    { await: 'true', timeout: '15000' },
                    profileName,
                );
                const profile = context.extensionSettings.connectionManager.profiles
                    .find(candidate => candidate.name === profileName);
                const template = context.chatCompletionSettings.prompts
                    .find(prompt => prompt.name?.includes('MAX Chain of Thought'));
                if (!profile || !template?.content) throw new Error('Live FF5 inputs are unavailable');
                const settings = context.extensionSettings.agapePlannerResponse;
                settings.enabled = true;
                settings.plannerPrompt = template.content;
                settings.planner = {
                    source: 'profile',
                    profileId: profile.id,
                    customUrl: '',
                    secretId: '',
                    model: plannerModel,
                    contextMode: 'preset',
                    historyMode: 'full',
                    historyDepth: 5,
                    includeSummaryception: true,
                };
                settings.response = {
                    source: 'profile',
                    profileId: profile.id,
                    customUrl: '',
                    secretId: '',
                    model: responseModel,
                };
                context.saveSettingsDebounced();
                const message = context.chat.at(-1);
                while (Array.isArray(message?.swipes)
                    && message.swipe_id < message.swipes.length - 1) {
                    await context.swipe.right(null, { source: 'agape-live-acceptance-setup' });
                }
                return {
                    template: template.content,
                    chatLength: context.chat.length,
                    swipe: context.chat.at(-1)?.swipe_id ?? 0,
                };
            }""",
            {
                "profileName": PROFILE,
                "plannerModel": PLANNER_MODEL,
                "responseModel": RESPONSE_MODEL,
                "character": CHARACTER,
            },
        )
        page.wait_for_timeout(1_000)

        if configured["chatLength"] == 0:
            raise RuntimeError("The active STD snapshot has no assistant candidate to swipe")

        requests.clear()
        started = time.monotonic()
        page.evaluate(
            """() => void window.SillyTavern.getContext().swipe.right(
                null,
                { source: 'agape-live-acceptance' },
            )"""
        )
        page.wait_for_function(
            "() => window.SillyTavern.getContext().chat.at(-1)?.extra?.agapePlannerResponsePending === true",
            timeout=30_000,
        )

        first_visible = None
        lengths = []
        deadline = started + 300
        while time.monotonic() < deadline:
            state = page.evaluate(
                """() => {
                    const context = window.SillyTavern.getContext();
                    const message = context.chat.at(-1);
                    return {
                        planning: message?.extra?.reasoning ?? '',
                        status: document.querySelector('#agape-planner-response-status')?.textContent ?? '',
                    };
                }"""
            )
            planning_length = len(state["planning"])
            if planning_length and (not lengths or lengths[-1] != planning_length):
                lengths.append(planning_length)
                if first_visible is None:
                    first_visible = time.monotonic() - started
            if state["status"] in {"Complete", "Failed", "Stopped"}:
                break
            page.wait_for_timeout(50)

        finished = time.monotonic() - started
        result = page.evaluate(
            """() => {
                const context = window.SillyTavern.getContext();
                const message = context.chat.at(-1);
                return {
                    chatLength: context.chat.length,
                    swipe: message?.swipe_id ?? 0,
                    status: document.querySelector('#agape-planner-response-status')?.textContent ?? '',
                    planning: message?.extra?.reasoning ?? '',
                    response: message?.mes ?? '',
                    metrics: message?.extra?.agapePlannerResponseMetrics ?? null,
                };
            }"""
        )
        template_markers = structure_markers(configured["template"])
        planning_markers = structure_markers(result["planning"])
        failures = []
        if first_visible is None or first_visible > 30:
            failures.append("Planning did not become visible within thirty seconds")
        if len(lengths) < 2:
            failures.append("Planning appeared as one final block instead of incrementally")
        if not template_markers or planning_markers[:len(template_markers)] != template_markers:
            failures.append("Planning did not preserve the Planner template structure")
        if len(requests) != 2:
            failures.append("Swipe did not make exactly two model requests")
        if requests and requests[0].get("model") != PLANNER_MODEL:
            failures.append("Planner request did not use the selected Planner model")
        if len(requests) > 1 and requests[1].get("model") != RESPONSE_MODEL:
            failures.append("Response request did not use the selected Response model")
        if len(requests) > 1 and not RESPONSE_MODEL.lower().startswith("gemini"):
            response_body = requests[1]
            if response_body.get("custom_include_body"):
                failures.append("Non-Gemini Response retained a Gemini-only custom body")
            if RESPONSE_MODEL.lower().startswith("gpt-5"):
                excluded = response_body.get("custom_exclude_body", "")
                for field in ("thinking", "temperature", "top_p", "frequency_penalty",
                              "presence_penalty", "logit_bias", "stop"):
                    if field not in excluded:
                        failures.append(f"GPT Response did not exclude {field}")
        if result["status"] != "Complete":
            failures.append("Swipe did not complete")

        report = {
            "passed": not failures,
            "failures": failures,
            "firstVisibleSeconds": None if first_visible is None else round(first_visible, 3),
            "visiblePlanningUpdates": len(lengths),
            "visiblePlanningLengths": lengths,
            "totalSeconds": round(finished, 3),
            "templateMarkers": template_markers,
            "planningMarkers": planning_markers,
            "planningLength": len(result["planning"]),
            "responseLength": len(result["response"]),
            "requests": len(requests),
            "plannerRequest": {
                key: requests[0].get(key)
                for key in (
                    "model",
                    "max_tokens",
                    "custom_include_body",
                    "custom_exclude_body",
                    "temperature",
                    "top_p",
                    "custom_prompt_post_processing",
                )
            } if requests else None,
            "responseRequest": {
                key: requests[1].get(key)
                for key in (
                    "model",
                    "max_tokens",
                    "custom_include_body",
                    "custom_exclude_body",
                    "temperature",
                    "top_p",
                    "custom_prompt_post_processing",
                )
            } if len(requests) > 1 else None,
            "before": {
                "chatLength": configured["chatLength"],
                "swipe": configured["swipe"],
            },
            "after": {
                "chatLength": result["chatLength"],
                "swipe": result["swipe"],
                "status": result["status"],
            },
            "metrics": result["metrics"],
            "rawFetches": page.evaluate(
                """(window.__agapeRawFetches ?? []).map(trace => ({
                    responseMs: trace.responseMs,
                    completeMs: trace.completeMs,
                    chunkCount: trace.chunks.length,
                    firstChunkMs: trace.chunks[0]?.atMs ?? null,
                    firstContentChunkMs: trace.chunks.find(chunk =>
                        !chunk.text.includes('"delta":{}')
                    )?.atMs ?? null,
                }))"""
            ),
        }
        Path("/tmp/opencode/agape-live-planning.json").write_text(
            json.dumps({
                "template": configured["template"],
                "planning": result["planning"],
                "report": report,
            }, indent=2),
            encoding="utf-8",
        )
        print(json.dumps(report, indent=2))
        context.close()
        browser.close()
        if failures:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
