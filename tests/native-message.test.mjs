import assert from 'node:assert/strict';
import test from 'node:test';

import { createNativeMessage, recoverStalePendingMessage } from '../src/native-message.mjs';

let lastReasoningHandler;
class FakeReasoningHandler {
  constructor(started) {
    this.initialTime = started;
    this.domUpdates = 0;
    lastReasoningHandler = this;
  }
  initHandleMessage() {}
  updateDom() { this.domUpdates += 1; }
}

const reasoningModule = {
  ReasoningHandler: FakeReasoningHandler,
  ReasoningState: { Thinking: 'thinking', Done: 'done' },
  ReasoningType: { Model: 'model' },
};

function fakeContext() {
  const context = {
    chat: [{ is_user: true, mes: 'Turn' }],
    eventTypes: { STREAM_REASONING_DONE: 'reasoning-done' },
    eventSource: { async emit() {} },
    async saveReply({ type, getMessage, fromStreaming }) {
      if (type === 'normal') {
        context.chat.push({
          is_user: false,
          mes: getMessage,
          extra: {},
          swipe_id: 0,
          swipes: [getMessage],
          swipe_info: [{ extra: {} }],
        });
      } else if (type === 'swipe') {
        const message = context.chat.at(-1);
        message.swipes.push(getMessage);
        message.swipe_info.push({ extra: {} });
        message.swipe_id = message.swipes.length - 1;
        message.mes = getMessage;
        message.extra = {};
      } else if (type === 'appendFinal') {
        context.chat.at(-1).mes = getMessage;
      }
      context.lastSave = { type, getMessage, fromStreaming };
    },
    async deleteLastMessage() { context.chat.pop(); },
    async saveChat() { context.saved = true; },
    updateMessageBlock() {},
    messageFormatting(text) { return `<strong>${text}</strong>`; },
  };
  return context;
}

test('native message keeps exact Planning and Response in one assistant message', async () => {
  const context = fakeContext();
  let time = 1_000;
  const message = await createNativeMessage({
    context,
    loadReasoning: async () => reasoningModule,
    now: () => new Date(time += 10),
  });

  await message.setPlanning(' exact {{literal}} ');
  await message.completePlanning(' exact {{literal}} ');
  await message.setResponse('partial');
  await message.commitResponse('final response');

  assert.equal(context.chat.length, 2);
  assert.equal(context.chat[1].mes, 'final response');
  assert.equal(context.chat[1].extra.reasoning, ' exact {{literal}} ');
  assert.equal(context.chat[1].extra.agapePlannerResponsePlanning, true);
  assert.equal(context.chat[1].extra.agapePlannerResponsePending, undefined);
  assert.equal(context.chat[1].swipes[0], 'final response');
  assert.ok(Number(context.chat[1].gen_finished) > Number(context.chat[1].gen_started));
  assert.ok(context.chat[1].extra.time_to_first_token >= 0);
});

test('streaming uses SillyTavern renderers instead of raw textContent', async () => {
  const context = fakeContext();
  const responseElement = { innerHTML: '', textContent: '' };
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector(selector) {
      if (selector.endsWith('.mes_text')) return responseElement;
      return null;
    },
  };
  try {
    const message = await createNativeMessage({
      context,
      loadReasoning: async () => reasoningModule,
      now: () => new Date(1_000),
    });
    await message.setPlanning('# Planning\n\n- **Bold**');
    await message.setResponse('**Bold Response**');

    assert.ok(lastReasoningHandler.domUpdates >= 2);
    assert.equal(responseElement.innerHTML, '<strong>**Bold Response**</strong>');
    assert.equal(responseElement.textContent, '');
  } finally {
    globalThis.document = previousDocument;
  }
});

test('operation timer advances while waiting for model output', async () => {
  const context = fakeContext();
  let tick;
  let nowMs = 1_000;
  const timerElement = { textContent: '', title: '' };
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector(selector) {
      if (selector.endsWith('.mes_timer')) return timerElement;
      return null;
    },
  };
  try {
    const message = await createNativeMessage({
      context,
      loadReasoning: async () => reasoningModule,
      now: () => new Date(nowMs),
      setInterval: (callback) => { tick = callback; return 1; },
      clearInterval: () => {},
    });
    nowMs = 3_500;
    tick();
    assert.equal(timerElement.textContent, '2.5s');
    await message.rollback();
  } finally {
    globalThis.document = previousDocument;
  }
});

test('swipe Planning and Response stay in one new swipe slot', async () => {
  const context = fakeContext();
  context.chat.push({
    is_user: false,
    mes: 'First response',
    extra: { reasoning: 'First Planning' },
    swipe_id: 1,
    swipes: ['First response'],
    swipe_info: [{ extra: { reasoning: 'First Planning' } }],
  });
  const message = await createNativeMessage({
    context,
    type: 'swipe',
    loadReasoning: async () => reasoningModule,
    now: () => new Date(1_000),
  });

  await message.setPlanning('Second Planning');
  await message.completePlanning('Second Planning');
  await message.commitResponse('Second response');

  assert.equal(context.chat.length, 2);
  assert.equal(context.chat[1].swipe_id, 1);
  assert.deepEqual(context.chat[1].swipes, ['First response', 'Second response']);
  assert.equal(context.chat[1].swipe_info[1].extra.reasoning, 'Second Planning');
});

test('failed swipe Planning restores the previous swipe candidate', async () => {
  const context = fakeContext();
  const original = {
    is_user: false,
    mes: 'First response',
    extra: { reasoning: 'First Planning' },
    swipe_id: 1,
    swipes: ['First response'],
    swipe_info: [{ extra: { reasoning: 'First Planning' } }],
  };
  context.chat.push(structuredClone(original));
  const message = await createNativeMessage({
    context,
    type: 'swipe',
    loadReasoning: async () => reasoningModule,
    now: () => new Date(1_000),
  });

  await message.rollback();

  assert.equal(context.chat[1].swipe_id, 0);
  assert.equal(context.chat[1].mes, 'First response');
  assert.equal(context.chat[1].extra.reasoning, 'First Planning');
});

test('regenerate replaces the last assistant candidate without growing chat', async () => {
  const context = fakeContext();
  context.chat.push({
    is_user: false,
    mes: 'Old response',
    extra: { reasoning: 'Old Planning' },
    swipe_id: 0,
    swipes: ['Old response'],
    swipe_info: [{ extra: { reasoning: 'Old Planning' } }],
  });
  const message = await createNativeMessage({
    context,
    type: 'regenerate',
    loadReasoning: async () => reasoningModule,
    now: () => new Date(1_000),
  });

  await message.completePlanning('New Planning');
  await message.commitResponse('New response');

  assert.equal(context.chat.length, 2);
  assert.equal(context.chat[1].mes, 'New response');
  assert.equal(context.chat[1].extra.reasoning, 'New Planning');
});

test('failed regenerate restores the replaced assistant candidate', async () => {
  const context = fakeContext();
  const original = {
    is_user: false,
    mes: 'Old response',
    extra: { reasoning: 'Old Planning' },
    swipe_id: 0,
    swipes: ['Old response'],
    swipe_info: [{ extra: { reasoning: 'Old Planning' } }],
  };
  context.chat.push(structuredClone(original));
  const message = await createNativeMessage({
    context,
    type: 'regenerate',
    loadReasoning: async () => reasoningModule,
    now: () => new Date(1_000),
  });

  await message.rollback();

  assert.deepEqual(context.chat[1], original);
});

test('Planner failure removes only the owned provisional assistant message', async () => {
  const context = fakeContext();
  const message = await createNativeMessage({
    context,
    loadReasoning: async () => reasoningModule,
    now: () => new Date(1_000),
  });

  await message.rollback();

  assert.deepEqual(context.chat, [{ is_user: true, mes: 'Turn' }]);
});

test('extension startup removes a provisional assistant left by an interrupted tab', async () => {
  const context = fakeContext();
  context.chat.push({
    is_user: false,
    mes: '...',
    extra: { agapePlannerResponsePending: true, reasoning: 'partial' },
  });

  assert.equal(await recoverStalePendingMessage(context), 'planning-removed');
  assert.deepEqual(context.chat, [{ is_user: true, mes: 'Turn' }]);
  assert.equal(context.saved, true);
});

test('extension startup preserves completed Planning and marks its interrupted Response failed', async () => {
  const context = fakeContext();
  context.chat.push({
    is_user: false,
    mes: '...',
    extra: {
      agapePlannerResponsePending: true,
      agapePlannerResponsePhase: 'response',
      reasoning: 'Completed Planning',
    },
    swipe_id: 0,
    swipes: ['...'],
    swipe_info: [{ extra: {} }],
  });

  assert.equal(await recoverStalePendingMessage(context), 'response-failed');
  assert.equal(context.chat.length, 2);
  assert.equal(context.chat[1].mes, 'Response failed.');
  assert.equal(context.chat[1].extra.reasoning, 'Completed Planning');
  assert.equal(context.chat[1].extra.agapePlannerResponsePending, undefined);
});

test('extension startup removes only an interrupted swipe slot', async () => {
  const context = fakeContext();
  context.chat.push({
    is_user: false,
    mes: '...',
    extra: {
      agapePlannerResponsePending: true,
      agapePlannerResponsePhase: 'planning',
      agapePlannerResponseCandidateType: 'swipe',
    },
    swipe_id: 1,
    swipes: ['First response', '...'],
    swipe_info: [
      { extra: { reasoning: 'First Planning' } },
      { extra: { agapePlannerResponsePending: true } },
    ],
  });

  assert.equal(await recoverStalePendingMessage(context), 'swipe-removed');
  assert.equal(context.chat.length, 2);
  assert.equal(context.chat[1].swipe_id, 0);
  assert.equal(context.chat[1].mes, 'First response');
  assert.equal(context.chat[1].extra.reasoning, 'First Planning');
});
