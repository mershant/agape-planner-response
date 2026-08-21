import assert from 'node:assert/strict';
import test from 'node:test';

import { runPlannerResponse } from '../src/operation.mjs';

test('one Send visibly completes Planning before Response in the same message', async () => {
  const events = [];
  const nativeMessage = {
    async setPlanning(text) { events.push(['planning', text]); },
    async completePlanning(text) { events.push(['planning-complete', text]); },
    async setResponse(text) { events.push(['response', text]); },
    async commitResponse(text) { events.push(['response-complete', text]); },
    async failResponse() { events.push(['response-failed']); },
    async rollback() { events.push(['rollback']); },
    async commitStoppedResponse() { events.push(['response-stopped']); },
  };
  const normalMessages = [{ role: 'system', content: 'Active preset last block' }];
  const filledPlanning = '# Reasoning Protocol\n\nGATE 1. Gamestate:\n- Filled from current turn.';
  let plannerRequest;
  let responseRequest;

  const result = await runPlannerResponse({
    settings: {
      plannerPrompt: '{{getvar::state}}',
      planner: { source: 'profile' },
      response: { source: 'profile' },
    },
    substituteParams(prompt) {
      events.push(['expand', prompt]);
      return 'expanded state';
    },
    collectPlannerContext: async () => ({
      history: [{ role: 'user', name: 'Eloise', content: 'Current turn' }],
    }),
    createMessage: async () => nativeMessage,
    requestPlanner: async ({ messages, onText }) => {
      plannerRequest = messages;
      events.push(['planner-request', messages]);
      await onText('Plan');
      await onText(filledPlanning);
      return filledPlanning;
    },
    captureResponseMessages: async () => {
      events.push(['capture-normal-response']);
      return normalMessages;
    },
    requestResponse: async ({ messages, onText }) => {
      responseRequest = messages;
      events.push(['response-request']);
      await onText('Reply');
      return 'Reply complete';
    },
    cleanResponse: (text) => text,
    signal: new AbortController().signal,
  });

  assert.equal(result.planning, filledPlanning);
  assert.equal(result.response, 'Reply complete');
  assert.equal(plannerRequest.length, 6);
  assert.equal(plannerRequest[1].role, 'user');
  assert.match(plannerRequest[1].content, /<message name="Eloise">\nCurrent turn\n<\/message>/);
  assert.match(plannerRequest[4].content, /<planner_template>\nexpanded state\n<\/planner_template>/);
  const eventNames = events.map(([name]) => name);
  assert.equal(eventNames.indexOf('expand'), 0);
  assert.ok(eventNames.indexOf('planning') < eventNames.indexOf('planner-request'));
  assert.ok(eventNames.indexOf('capture-normal-response') > eventNames.indexOf('planning-complete'));
  assert.deepEqual(responseRequest, [
    { role: 'system', content: 'Active preset last block' },
    { role: 'system', content: filledPlanning },
  ]);
  assert.deepEqual(eventNames, [
    'expand',
    'planning',
    'planner-request',
    'planning',
    'planning-complete',
    'capture-normal-response',
    'response-request',
    'response',
    'response-complete',
  ]);
});

test('Planner and Response requests retain their separate stage settings', async () => {
  const seen = [];
  const planner = { source: 'profile', profileId: 'planner-profile', model: 'planner-model' };
  const response = { source: 'profile', profileId: 'response-profile', model: 'response-model' };
  await runPlannerResponse({
    settings: { plannerPrompt: 'Template', planner, response },
    substituteParams: (text) => text,
    createMessage: async () => ({
      async setPlanning() {},
      async completePlanning() {},
      async setResponse() {},
      async commitResponse() {},
    }),
    requestPlanner: async ({ stage }) => {
      seen.push(['planner', stage]);
      return 'Planning';
    },
    captureResponseMessages: async () => [],
    requestResponse: async ({ stage }) => {
      seen.push(['response', stage]);
      return 'Response';
    },
    cleanResponse: (text) => text,
    signal: new AbortController().signal,
  });
  assert.deepEqual(seen, [
    ['planner', planner],
    ['response', response],
  ]);
});

test('Stop during Planner removes the provisional message and never starts Response', async () => {
  const controller = new AbortController();
  let responseStarted = false;
  let rolledBack = false;

  const result = await runPlannerResponse({
    settings: {
      plannerPrompt: 'Prompt',
      planner: { source: 'profile' },
      response: { source: 'profile' },
    },
    substituteParams: (text) => text,
    createMessage: async () => ({
      async setPlanning() {},
      async completePlanning() {},
      async rollback() { rolledBack = true; },
    }),
    requestPlanner: async () => {
      controller.abort();
      throw controller.signal.reason;
    },
    captureResponseMessages: async () => [],
    requestResponse: async () => { responseStarted = true; },
    cleanResponse: (text) => text,
    signal: controller.signal,
  });

  assert.equal(rolledBack, true);
  assert.equal(responseStarted, false);
  assert.equal(result.stopped, true);
});

test('Stop during Planner packet construction ends as stopped before creating a shell', async () => {
  const controller = new AbortController();
  let shellCreated = false;

  const result = await runPlannerResponse({
    settings: {
      plannerPrompt: 'Prompt',
      planner: { source: 'profile' },
      response: { source: 'profile' },
    },
    substituteParams: (text) => text,
    collectPlannerContext: async () => {
      controller.abort();
      return {};
    },
    createMessage: async () => { shellCreated = true; },
    requestPlanner: async () => '',
    captureResponseMessages: async () => [],
    requestResponse: async () => '',
    cleanResponse: (text) => text,
    signal: controller.signal,
  });

  assert.equal(result.stopped, true);
  assert.equal(shellCreated, false);
});

test('chat-switch interruption after Planning does not commit into the old chat', async () => {
  const controller = new AbortController();
  let stoppedCommit = false;
  const result = await runPlannerResponse({
    settings: {
      plannerPrompt: 'Prompt',
      planner: { source: 'profile' },
      response: { source: 'profile' },
    },
    substituteParams: (text) => text,
    createMessage: async () => ({
      async setPlanning() {},
      async completePlanning() {},
      async setResponse() {},
      async commitStoppedResponse() { stoppedCommit = true; },
      async commitInterruptedResponse() { return false; },
      async rollback() {},
    }),
    requestPlanner: async () => 'Planning',
    captureResponseMessages: async () => [],
    requestResponse: async () => {
      controller.abort('interrupted');
      throw controller.signal.reason;
    },
    cleanResponse: (text) => text,
    signal: controller.signal,
  });
  assert.equal(result.interrupted, true);
  assert.equal(stoppedCommit, false);
});

test('replacement interruption after Planning closes before the next queued run', async () => {
  const controller = new AbortController();
  let interruptedCommit = 0;
  const result = await runPlannerResponse({
    settings: {
      plannerPrompt: 'Prompt',
      planner: { source: 'profile' },
      response: { source: 'profile' },
    },
    substituteParams: (text) => text,
    createMessage: async () => ({
      async setPlanning() {},
      async completePlanning() {},
      async setResponse() {},
      async commitInterruptedResponse() { interruptedCommit += 1; return true; },
      async rollback() {},
    }),
    requestPlanner: async () => 'Planning',
    captureResponseMessages: async () => [],
    requestResponse: async () => {
      controller.abort('interrupted');
      throw controller.signal.reason;
    },
    cleanResponse: (text) => text,
    signal: controller.signal,
  });
  assert.equal(result.interrupted, true);
  assert.equal(interruptedCommit, 1);
});

test('provider cancellation wording is a Response failure unless Stop aborted the signal', async () => {
  const events = [];
  await assert.rejects(() => runPlannerResponse({
    settings: {
      plannerPrompt: 'Prompt',
      planner: { source: 'profile' },
      response: { source: 'profile' },
    },
    substituteParams: (text) => text,
    createMessage: async () => ({
      async setPlanning() {},
      async completePlanning() {},
      async failResponse(text) { events.push(text); },
      async rollback() {},
    }),
    requestPlanner: async () => 'Planning',
    captureResponseMessages: async () => [],
    requestResponse: async () => { throw new Error('Provider cancelled its request'); },
    cleanResponse: (text) => text,
    signal: new AbortController().signal,
  }), /provider cancelled/i);

  assert.deepEqual(events, ['Response failed.']);
});

test('Response failure keeps completed Planning and writes the fixed failure text', async () => {
  const events = [];

  await assert.rejects(() => runPlannerResponse({
    settings: {
      plannerPrompt: 'Prompt',
      planner: { source: 'profile' },
      response: { source: 'profile' },
    },
    substituteParams: (text) => text,
    createMessage: async () => ({
      async setPlanning() {},
      async completePlanning() { events.push('planning-complete'); },
      async failResponse(text) { events.push(text); },
      async rollback() { events.push('rollback'); },
    }),
    requestPlanner: async () => 'Planning',
    captureResponseMessages: async () => [],
    requestResponse: async () => { throw new Error('provider failed'); },
    cleanResponse: (text) => text,
    signal: new AbortController().signal,
  }), /provider failed/);

  assert.deepEqual(events, ['planning-complete', 'Response failed.']);
});

test('blank Planner output removes its shell and never starts Response', async () => {
  let responseStarted = false;
  let rolledBack = false;

  await assert.rejects(() => runPlannerResponse({
    settings: {
      plannerPrompt: 'Prompt',
      planner: { source: 'profile' },
      response: { source: 'profile' },
    },
    substituteParams: (text) => text,
    captureResponseMessages: async () => [],
    createMessage: async () => ({
      async setPlanning() {},
      async completePlanning() {},
      async rollback() { rolledBack = true; },
    }),
    requestPlanner: async () => ' \n ',
    requestResponse: async () => { responseStarted = true; },
    cleanResponse: (text) => text,
    signal: new AbortController().signal,
  }), /blank visible content/i);

  assert.equal(rolledBack, true);
  assert.equal(responseStarted, false);
});
