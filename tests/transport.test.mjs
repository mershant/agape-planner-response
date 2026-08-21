import assert from 'node:assert/strict';
import test from 'node:test';

import { consumeVisibleResponse, requestStage, requestStageDetailed } from '../src/transport.mjs';

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
