import assert from 'node:assert/strict';
import test from 'node:test';

import { consumeVisibleResponse, requestStage } from '../src/transport.mjs';

test('streaming transport exposes only cumulative visible content', async () => {
  const seen = [];
  const result = await consumeVisibleResponse(() => (async function* frames() {
    yield { text: 'Plan', state: { reasoning: 'hidden one' } };
    yield { text: 'Planning', state: { reasoning: 'hidden two' } };
  }()), (text) => seen.push(text));

  assert.equal(result, 'Planning');
  assert.deepEqual(seen, ['Plan', 'Planning']);
});

test('provider error envelopes returned as visible stream text remain failures', async () => {
  const visible = [];
  await assert.rejects(() => consumeVisibleResponse(() => (async function* frames() {
    yield { text: 'ScyllaProxy Error' };
    yield { text: 'ScyllaProxy Error\nStatus Code: 400\nModel: test\nToken: redacted\nTime: now\n\n{"error":{"message":"bad request"}}' };
  }()), (text) => visible.push(text)), /provider transport error.*400/i);

  assert.deepEqual(visible, []);
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
    messages: [{ role: 'system', content: 'Prompt' }],
    maxTokens: 700,
    includePreset: false,
    signal: new AbortController().signal,
  });

  assert.equal(text, 'Planning');
  assert.deepEqual(calls, [[
    'active-profile',
    [{ role: 'system', content: 'Prompt' }],
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
    messages: [{ role: 'system', content: 'Prompt' }],
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

test('Response profile uses its connection with the preset already active on screen', async () => {
  const calls = [];
  const profile = {
    id: 'response-profile',
    api: 'custom',
    model: 'profile-model',
    preset: 'Profile preset that must not replace active',
    'api-url': 'https://response.example/v1',
    'secret-id': 'response-secret',
    proxy: 'Response proxy',
    'prompt-post-processing': 'none',
  };
  const context = {
    extensionSettings: {
      connectionManager: { selectedProfile: 'active-profile', profiles: [profile] },
    },
    ConnectionManagerRequestService: {
      getProfile: () => profile,
      validateProfile: () => ({ selected: 'openai', source: 'custom' }),
    },
    ChatCompletionService: {
      async processRequest(...args) {
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
    proxies: [{ name: 'Response proxy', url: 'https://proxy.example', password: 'proxy-password' }],
    signal: new AbortController().signal,
  });

  assert.equal(calls[0][0].model, 'profile-model');
  assert.equal(calls[0][0].custom_url, 'https://response.example/v1');
  assert.equal(calls[0][0].secret_id, 'response-secret');
  assert.equal(calls[0][0].reverse_proxy, 'https://proxy.example');
  assert.deepEqual(calls[0][1], { presetName: 'Preset active on screen' });
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
    messages: [{ role: 'system', content: 'Planner' }],
    maxTokens: 300,
    includePreset: false,
    signal: new AbortController().signal,
  });

  assert.equal(calls[0][0].model, 'current-model');
  assert.equal(calls[0][0].custom_url, 'https://current.example/v1');
  assert.deepEqual(calls[0][1], { presetName: undefined });
});
