import assert from 'node:assert/strict';
import test from 'node:test';

import {
  consumeVisibleResponse,
  mergeExcludedFields,
  requestStage,
  requestStageDetailed,
  scyllaStageOverride,
} from '../src/transport.mjs';

function streamFrames(...frames) {
  return async function* generateFrames() {
    yield* frames;
  };
}

function deterministicNow(...timestamps) {
  let index = 0;
  return () => {
    assert.ok(index < timestamps.length, 'now() was called more often than expected');
    return timestamps[index++];
  };
}

const SCYLLA_PROXY_FAILURE = 'ScyllaProxy Error\nStatus Code: 500\nModel: grok-4.5\nToken: SECRET\nTime: 2026-07-16T06:46:40Z\n\nStream interrupted from X.AI.';
const GENERIC_TRANSPORT_ERROR = 'Error 400: {"error":{"message":"validation failed"}}';

test('streaming transport returns exact visible text, cumulative deltas, and timing', async () => {
  const seen = [];
  const result = await consumeVisibleResponse(streamFrames(
    { text: '', state: { reasoning: 'hidden one' } },
    { text: 'Plan', state: { reasoning: 'hidden one' } },
    { text: 'Plan', state: { reasoning: 'hidden two' } },
    { text: 'Planning', state: { reasoning: 'hidden two' } },
  ), (delta, fullText) => seen.push([delta, fullText]), deterministicNow(1_000, 1_025, 1_090));

  assert.deepEqual(result, {
    text: 'Planning',
    firstDeltaMs: 25,
    totalMs: 90,
  });
  assert.deepEqual(seen, [
    ['Plan', 'Plan'],
    ['ning', 'Planning'],
  ]);
});

test('buffered provider content is visibly revealed in ordered exact slices', async () => {
  const output = 'x'.repeat(401);
  const visible = [];
  async function* frames() {
    yield { text: output };
  }
  const result = await consumeVisibleResponse(
    Promise.resolve(() => frames()),
    async (delta, fullText) => visible.push({ delta, fullText }),
    () => 0,
  );
  assert.equal(result.text, output);
  assert.deepEqual(visible.map((entry) => entry.delta.length), [160, 160, 81]);
  assert.deepEqual(visible.map((entry) => entry.fullText.length), [160, 320, 401]);
  assert.equal(visible.map((entry) => entry.delta).join(''), output);
});

test('Stop interrupts buffered-content reveal', async () => {
  const controller = new AbortController();
  async function* frames() {
    yield { text: 'x'.repeat(401) };
  }
  await assert.rejects(() => consumeVisibleResponse(
    Promise.resolve(() => frames()),
    async () => controller.abort(),
    () => 0,
    controller.signal,
  ), { name: 'AbortError' });
});

test('hidden state.reasoning never substitutes for visible text or deltas', async () => {
  const hiddenNonce = 'HIDDEN_NONCE_7f21';
  const seen = [];
  const result = await consumeVisibleResponse(streamFrames(
    {
      text: 'Public',
      state: {
        reasoning: hiddenNonce,
        reasoning_content: hiddenNonce,
      },
    },
    {
      text: 'Public answer',
      state: { reasoning: `Planning: ${hiddenNonce}` },
    },
  ), (delta, fullText) => seen.push({ delta, fullText }));

  assert.equal(result.text, 'Public answer');
  assert.deepEqual(seen, [
    { delta: 'Public', fullText: 'Public' },
    { delta: ' answer', fullText: 'Public answer' },
  ]);
  assert.doesNotMatch(JSON.stringify({ result, seen }), new RegExp(hiddenNonce));
});

test('extracted non-stream fallback returns exact text without fabricating deltas', async () => {
  const seen = [];
  const result = await consumeVisibleResponse({
    content: 'Complete fallback content',
    reasoning: 'HIDDEN_NONCE_fallback',
  }, (...args) => seen.push(args), deterministicNow(200, 245));

  assert.deepEqual(result, {
    text: 'Complete fallback content',
    firstDeltaMs: null,
    totalMs: 45,
  });
  assert.deepEqual(seen, []);
});

test('generic Error NNN and ScyllaProxy envelopes fail without being emitted', async (t) => {
  await t.test('streamed generic envelope', async () => {
    const visible = [];
    await assert.rejects(() => consumeVisibleResponse(streamFrames(
      { text: 'Error ' },
      { text: GENERIC_TRANSPORT_ERROR },
    ), (...args) => visible.push(args)), (error) => {
      assert.match(error.message, /provider transport error/i);
      assert.doesNotMatch(error.message, /validation failed|Error 400/i);
      assert.equal(error.status, 400);
      return true;
    });
    assert.deepEqual(visible, []);
  });

  await t.test('extracted generic envelope', async () => {
    await assert.rejects(
      () => consumeVisibleResponse({ content: GENERIC_TRANSPORT_ERROR }),
      (error) => {
        assert.match(error.message, /provider transport error/i);
        assert.doesNotMatch(error.message, /validation failed|Error 400/i);
        return true;
      },
    );
  });

  await t.test('ordinary prose remains valid', async () => {
    const prose = 'Error can sharpen a scene without becoming a provider failure.';
    const result = await consumeVisibleResponse({ content: prose });
    assert.equal(result.text, prose);
  });

  await t.test('streamed ScyllaProxy envelope', async () => {
    const visible = [];
    await assert.rejects(() => consumeVisibleResponse(streamFrames(
      { text: 'ScyllaProxy Error\n' },
      { text: 'ScyllaProxy Error\nStatus Code: 500\n' },
      { text: SCYLLA_PROXY_FAILURE },
    ), (...args) => visible.push(args)), (error) => {
      assert.equal(error.message, 'Provider transport error (HTTP 500)');
      assert.equal(error.status, 500);
      assert.doesNotMatch(error.message, /SECRET|grok-4\.5|ScyllaProxy|Stream interrupted/i);
      return true;
    });
    assert.deepEqual(visible, []);
  });

  await t.test('extracted ScyllaProxy envelope', async () => {
    await assert.rejects(
      () => consumeVisibleResponse({ content: SCYLLA_PROXY_FAILURE }),
      (error) => {
        assert.equal(error.message, 'Provider transport error (HTTP 500)');
        assert.doesNotMatch(error.message, /SECRET|grok-4\.5|ScyllaProxy/i);
        return true;
      },
    );
  });
});

test('blank and empty streams fail', async (t) => {
  await t.test('empty frames', async () => {
    await assert.rejects(
      () => consumeVisibleResponse(streamFrames(
        { text: '', state: { reasoning: 'hidden text is not content' } },
        { text: '' },
      )),
      /blank visible content/i,
    );
  });

  await t.test('whitespace-only frames', async () => {
    await assert.rejects(
      () => consumeVisibleResponse(streamFrames({ text: '   \n' })),
      /blank visible content/i,
    );
  });

  await t.test('empty extracted content', async () => {
    await assert.rejects(
      () => consumeVisibleResponse({ content: '' }),
      /blank visible content/i,
    );
  });
});

test('AbortError passes through unchanged', async () => {
  const abortError = new DOMException('The operation was aborted', 'AbortError');
  const hiddenNonce = 'HIDDEN_NONCE_abort';
  const seen = [];

  await assert.rejects(() => consumeVisibleResponse(async function* abortingStream() {
    yield { text: '', state: { reasoning: `Planning: ${hiddenNonce}` } };
    throw abortError;
  }, (...args) => seen.push(args)), (error) => {
    assert.strictEqual(error, abortError);
    assert.equal(error.name, 'AbortError');
    return true;
  });

  assert.deepEqual(seen, []);
});

test('profile Planner uses one selected profile request without preset or instruct', async () => {
  const calls = [];
  const context = {
    extensionSettings: {
      connectionManager: {
        selectedProfile: 'active-profile',
        profiles: [{ id: 'active-profile', model: 'profile-model' }],
      },
    },
    ConnectionManagerRequestService: {
      async sendRequest(...args) {
        calls.push(args);
        return { content: 'Planning' };
      },
    },
  };

  const text = await requestStage({
    context,
    stage: { source: 'profile', profileId: '', model: '' },
    messages: [{ role: 'user', content: 'Prompt' }],
    maxTokens: 700,
    includePreset: false,
    signal: new AbortController().signal,
  });

  assert.equal(text, 'Planning');
  assert.deepEqual(calls, [[
    'active-profile',
    [{ role: 'user', content: 'Prompt' }],
    700,
    {
      stream: true,
      extractData: true,
      includePreset: false,
      includeInstruct: false,
      signal: calls[0][3].signal,
    },
    {},
  ]]);
});

test('selected profile uses host sendRequest with exact includePreset and includeInstruct flags', async () => {
  const calls = [];
  const context = {
    extensionSettings: {
      connectionManager: { selectedProfile: 'active-profile' },
    },
    ConnectionManagerRequestService: {
      async sendRequest(...args) {
        calls.push(args);
        return { content: 'Response' };
      },
    },
  };

  await requestStage({
    context,
    stage: { source: 'profile', profileId: 'response-profile', model: '' },
    messages: [{ role: 'system', content: 'Normal active prompt' }],
    maxTokens: 500,
    includePreset: true,
    presetName: 'Preset active on screen',
    signal: new AbortController().signal,
  });

  assert.deepEqual(calls, [[
    'response-profile',
    [{ role: 'system', content: 'Normal active prompt' }],
    500,
    {
      stream: true,
      extractData: true,
      includePreset: true,
      includeInstruct: false,
      signal: calls[0][3].signal,
    },
    {},
  ]]);
});

test('profile model override is the sendRequest override payload', async () => {
  const calls = [];
  const context = {
    extensionSettings: {
      connectionManager: { selectedProfile: 'active-profile' },
    },
    ConnectionManagerRequestService: {
      async sendRequest(...args) {
        calls.push(args);
        return { content: 'Planning' };
      },
    },
  };

  await requestStage({
    context,
    stage: { source: 'profile', profileId: 'planner-profile', model: 'override-model' },
    messages: [{ role: 'user', content: 'Prompt' }],
    maxTokens: 128,
    includePreset: false,
    signal: new AbortController().signal,
  });

  assert.equal(calls[0][0], 'planner-profile');
  assert.equal(calls[0][3].includePreset, false);
  assert.equal(calls[0][3].includeInstruct, false);
  assert.deepEqual(calls[0][4], { model: 'override-model' });
});

test('stage transport combines model and request-specific payload overrides', async () => {
  const calls = [];
  const context = {
    extensionSettings: { connectionManager: { selectedProfile: 'planner' } },
    ConnectionManagerRequestService: {
      async sendRequest(...args) {
        calls.push(args);
        return { content: 'Planning' };
      },
    },
  };
  await requestStageDetailed({
    context,
    stage: { source: 'profile', profileId: 'planner', model: 'gemini-3.7-flash' },
    messages: [{ role: 'system', content: 'Plan' }],
    maxTokens: 100,
    overridePayload: { custom_include_body: '{"thinking":{"type":"disabled"}}' },
  });
  assert.deepEqual(calls[0][4], {
    model: 'gemini-3.7-flash',
    custom_include_body: '{"thinking":{"type":"disabled"}}',
  });
});

test('Scylla stage override isolates model-specific custom body settings', () => {
  assert.deepEqual(
    scyllaStageOverride('gemini-3.7-flash', 'https://proxy.scylla.love/v1', { planner: true }),
    {
      custom_include_body: '{"thinking":{"type":"disabled"},"thinking_config":{"thinking_budget":0}}',
    },
  );
  assert.equal(
    scyllaStageOverride('gemini-3.7-flash', 'https://proxy.scylla.love/v1'),
    undefined,
  );
  assert.deepEqual(
    scyllaStageOverride('gpt-5.6-sol', 'https://proxy.scylla.love/v1'),
    {
      custom_include_body: '',
      custom_exclude_body: '["thinking","temperature","top_p","frequency_penalty","presence_penalty","logit_bias","stop"]',
    },
  );
  assert.equal(scyllaStageOverride('gpt-5.6-sol', 'https://example.com/v1'), undefined);
});

test('model compatibility exclusions preserve existing preset exclusions', () => {
  assert.equal(
    mergeExcludedFields('["seed","temperature"]', ['thinking', 'temperature']),
    '["seed","temperature","thinking"]',
  );
  assert.equal(
    mergeExcludedFields('- seed\n- top_k', ['thinking']),
    '["seed","top_k","thinking"]',
  );
});

test('detailed stage request exposes visible first-delta and total metrics', async () => {
  const context = {
    extensionSettings: { connectionManager: { selectedProfile: 'planner' } },
    ConnectionManagerRequestService: {
      async sendRequest() {
        return streamFrames({ text: 'Plan' }, { text: 'Planning' });
      },
    },
  };
  const result = await requestStageDetailed({
    context,
    stage: { source: 'profile', profileId: 'planner', model: '' },
    messages: [{ role: 'user', content: 'Prompt' }],
    maxTokens: 100,
    includePreset: false,
  });
  assert.equal(result.text, 'Planning');
  assert.ok(Number.isFinite(result.firstDeltaMs));
  assert.ok(Number.isFinite(result.totalMs));
});

test('direct custom API uses its URL, stored key id, and model', async () => {
  const calls = [];
  const context = {
    ChatCompletionService: {
      async processRequest(...args) {
        calls.push(args);
        return { content: 'Custom output' };
      },
    },
  };

  const text = await requestStage({
    context,
    stage: {
      source: 'custom',
      customUrl: 'https://custom.example/v1',
      secretId: 'stored-key-id',
      model: 'custom-model',
    },
    messages: [{ role: 'user', content: 'Prompt' }],
    maxTokens: 900,
    includePreset: false,
    presetName: 'Active RP',
    signal: new AbortController().signal,
  });

  assert.equal(text, 'Custom output');
  assert.equal(calls[0][0].custom_url, 'https://custom.example/v1');
  assert.equal(calls[0][0].secret_id, 'stored-key-id');
  assert.equal(calls[0][0].model, 'custom-model');
  assert.deepEqual(calls[0][1], { presetName: undefined });
});

test('current Chat Completion connection works without a saved Connection Manager profile', async () => {
  const calls = [];
  const context = {
    mainApi: 'openai',
    chatCompletionSettings: {
      chat_completion_source: 'custom',
      custom_url: 'https://current.example/v1',
    },
    extensionSettings: {
      connectionManager: { selectedProfile: '', profiles: [] },
    },
    getChatCompletionModel: () => 'current-model',
    ChatCompletionService: {
      async processRequest(...args) {
        calls.push(args);
        return { content: 'Current connection output' };
      },
    },
  };

  await requestStage({
    context,
    stage: { source: 'profile', profileId: '', model: '' },
    messages: [{ role: 'user', content: 'Planner' }],
    maxTokens: 300,
    includePreset: false,
    signal: new AbortController().signal,
  });

  assert.equal(calls[0][0].model, 'current-model');
  assert.equal(calls[0][0].custom_url, 'https://current.example/v1');
  assert.deepEqual(calls[0][1], { presetName: undefined });
});

test('current connection receives request-specific compatibility overrides', async () => {
  const calls = [];
  const context = {
    mainApi: 'openai',
    extensionSettings: { connectionManager: { selectedProfile: '' } },
    chatCompletionSettings: {
      chat_completion_source: 'custom',
      custom_url: 'https://proxy.scylla.love/v1',
    },
    getChatCompletionModel: () => 'gpt-5.6-sol',
    ChatCompletionService: {
      async processRequest(...args) {
        calls.push(args);
        return { content: 'Response' };
      },
    },
  };
  const override = scyllaStageOverride(
    'gpt-5.6-sol',
    context.chatCompletionSettings.custom_url,
  );
  const result = await requestStageDetailed({
    context,
    stage: { source: 'profile', profileId: '', model: 'gpt-5.6-sol' },
    messages: [{ role: 'system', content: 'Prompt' }],
    maxTokens: 100,
    overridePayload: override,
  });
  assert.equal(result.text, 'Response');
  assert.equal(calls[0][0].custom_include_body, '');
  assert.match(calls[0][0].custom_exclude_body, /"thinking"/u);
  assert.match(calls[0][0].custom_exclude_body, /"top_p"/u);
});
