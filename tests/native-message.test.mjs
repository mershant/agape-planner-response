import assert from 'node:assert/strict';
import test from 'node:test';

import { createNativeMessage, recoverStalePendingMessage } from '../src/native-message.mjs';

let lastReasoningHandler;
class FakeReasoningHandler {
  constructor(started) {
    this.initialTime = started;
    this.startTime = started;
    this.endTime = null;
    this.reasoning = '';
    this.state = 'none';
    this.type = null;
    this.updateReasoningCalls = [];
    this.finishCalls = [];
    this.domUpdates = 0;
    lastReasoningHandler = this;
  }
  initHandleMessage() {}
  updateReasoning(_messageId, text, options) {
    this.updateReasoningCalls.push({ text, options });
    this.reasoning = text;
    return true;
  }
  updateDom() { this.domUpdates += 1; }
  async finish(messageId) {
    this.state = 'done';
    this.finishCalls.push(messageId);
  }
  getDuration() {
    if (!this.startTime || !this.endTime) return null;
    return Math.max(0, Number(this.endTime) - Number(this.startTime));
  }
}

const reasoningModule = {
  ReasoningHandler: FakeReasoningHandler,
  ReasoningState: { Thinking: 'thinking', Done: 'done' },
  ReasoningType: { Model: 'model' },
};

function fakeContext({ chatIdentity = 'chat-a' } = {}) {
  let identity = chatIdentity;
  const context = {
    chat: [{ is_user: true, mes: 'Turn' }],
    eventTypes: {
      STREAM_REASONING_DONE: 'reasoning-done',
      MESSAGE_RECEIVED: 'message-received',
      CHARACTER_MESSAGE_RENDERED: 'character-rendered',
    },
    eventSource: {
      emits: [],
      async emit(...args) { context.eventSource.emits.push(args); },
    },
    saveReplyCalls: [],
    addOneMessageCalls: [],
    updateMessageBlockCalls: [],
    getCurrentChatId: () => identity,
    setChatIdentity(value) { identity = value; },
    async saveReply(options) {
      context.saveReplyCalls.push({
        type: options.type,
        getMessage: options.getMessage,
        fromStreaming: options.fromStreaming,
        reasoning: options.reasoning,
      });
      if (options.type === 'appendFinal') {
        context.chat.at(-1).mes = options.getMessage;
        return;
      }
      if (options.type === 'swipe') {
        const message = context.chat.at(-1);
        message.swipes.push(options.getMessage);
        message.swipe_info.push({ extra: {} });
        message.swipe_id = message.swipes.length - 1;
        message.mes = options.getMessage;
        message.extra = {};
        return;
      }
      context.chat.push({
        is_user: false,
        mes: options.getMessage,
        extra: {},
        swipe_id: 0,
        swipes: [options.getMessage],
        swipe_info: [{ extra: {} }],
      });
    },
    async deleteLastMessage() { context.chat.pop(); },
    async saveChat() { context.saved = true; },
    updateMessageBlock(messageId, message) {
      context.updateMessageBlockCalls.push({ messageId, mes: message.mes });
    },
    addOneMessage(message, options) {
      context.addOneMessageCalls.push({ message, options });
    },
  };
  return context;
}

function createMessage(context, options = {}) {
  return createNativeMessage({
    context,
    loadReasoning: async () => reasoningModule,
    now: () => new Date(1_000),
    ...options,
  });
}

test('native message keeps exact Planning and Response in one assistant message', async () => {
  const context = fakeContext();
  let time = 1_000;
  const message = await createMessage(context, {
    now: () => new Date(time += 10),
  });

  await message.setPlanning(' exact {{literal}} ');
  await message.setPlanning(' exact {{literal}} more');
  await message.completePlanning(' exact {{literal}} ', { firstDeltaMs: 120, totalMs: 900 });
  await message.setResponse('partial');
  await message.commitResponse('final response', { firstDeltaMs: 80, totalMs: 500 });

  assert.equal(context.chat.length, 2);
  assert.equal(context.chat[1].mes, 'final response');
  assert.equal(context.chat[1].extra.reasoning, ' exact {{literal}} ');
  assert.equal(context.chat[1].extra.agapePlannerResponsePlanning, true);
  assert.equal(context.chat[1].extra.agapePlannerResponsePending, undefined);
  assert.equal(context.chat[1].swipes[0], 'final response');
  assert.ok(Number(context.chat[1].gen_finished) > Number(context.chat[1].gen_started));
  assert.ok(context.chat[1].extra.time_to_first_token >= 0);
  assert.deepEqual(context.chat[1].extra.agapePlannerResponseMetrics, {
    planner: { firstDeltaMs: 120, totalMs: 900 },
    response: { firstDeltaMs: 80, totalMs: 500 },
  });
  assert.deepEqual(context.saveReplyCalls[0], {
    type: 'normal',
    getMessage: '...',
    fromStreaming: true,
    reasoning: '',
  });
  assert.deepEqual(context.saveReplyCalls.at(-1), {
    type: 'appendFinal',
    getMessage: 'final response',
    fromStreaming: undefined,
    reasoning: '',
  });
  assert.deepEqual(
    lastReasoningHandler.updateReasoningCalls.map((call) => call.text),
    [' exact {{literal}} ', ' exact {{literal}} more', ' exact {{literal}} '],
  );
  assert.deepEqual(lastReasoningHandler.updateReasoningCalls[0].options, {
    persist: true,
    allowReset: true,
  });
  assert.deepEqual(lastReasoningHandler.finishCalls, [1]);
  assert.deepEqual(context.updateMessageBlockCalls.map((call) => call.mes), ['partial']);
  assert.equal(context.eventSource.emits.length, 0);
  assert.equal(context.addOneMessageCalls.length, 1);
  assert.deepEqual(context.addOneMessageCalls[0].options, {
    type: 'swipe',
    forceId: 1,
    scroll: false,
    showSwipes: true,
  });
});

test('Response streaming uses updateMessageBlock on message.mes', async () => {
  const context = fakeContext();
  const message = await createMessage(context);

  await message.setPlanning('# Planning');
  await message.setResponse('**Bold Response**');

  assert.ok(lastReasoningHandler.domUpdates >= 2);
  assert.equal(lastReasoningHandler.updateReasoningCalls.at(-1).text, '# Planning');
  assert.deepEqual(context.updateMessageBlockCalls, [{ messageId: 1, mes: '**Bold Response**' }]);
  assert.equal(context.chat[1].mes, '**Bold Response**');
});

test('swipe Planning and Response stay in one new swipe slot', async () => {
  const context = fakeContext();
  context.chat.push({
    is_user: false,
    mes: 'First response',
    extra: { reasoning: 'First Planning' },
    swipe_id: 0,
    swipes: ['First response'],
    swipe_info: [{ extra: { reasoning: 'First Planning' } }],
  });
  const message = await createMessage(context, { type: 'swipe' });

  await message.setPlanning('Second Planning');
  await message.completePlanning('Second Planning');
  await message.commitResponse('Second response');

  assert.equal(context.chat.length, 2);
  assert.equal(context.chat[1].swipe_id, 1);
  assert.deepEqual(context.chat[1].swipes, ['First response', 'Second response']);
  assert.equal(context.chat[1].swipe_info[1].extra.reasoning, 'Second Planning');
  assert.equal(context.saveReplyCalls[0].type, 'swipe');
  assert.equal(context.saveReplyCalls[0].fromStreaming, true);
  assert.equal(context.saveReplyCalls.at(-1).type, 'appendFinal');
});

test('failed swipe Planning restores the previous swipe candidate', async () => {
  const context = fakeContext();
  const original = {
    is_user: false,
    mes: 'First response',
    extra: { reasoning: 'First Planning' },
    swipe_id: 0,
    swipes: ['First response'],
    swipe_info: [{ extra: { reasoning: 'First Planning' } }],
  };
  context.chat.push(structuredClone(original));
  const message = await createMessage(context, { type: 'swipe' });

  await message.rollback();

  assert.equal(context.chat[1].swipe_id, 0);
  assert.equal(context.chat[1].mes, 'First response');
  assert.equal(context.chat[1].extra.reasoning, 'First Planning');
});

test('failed swipe rewinds SillyTavern pre-advanced swipe index', async () => {
  const context = fakeContext();
  context.chat.push({
    is_user: false,
    mes: 'First response',
    extra: { reasoning: 'First Planning' },
    swipe_id: 1,
    swipes: ['First response'],
    swipe_info: [{ extra: { reasoning: 'First Planning' } }],
  });
  const message = await createMessage(context, { type: 'swipe' });
  await message.rollback();
  assert.equal(context.chat[1].swipe_id, 0);
  assert.equal(context.chat[1].mes, 'First response');
  assert.equal(context.chat[1].extra.reasoning, 'First Planning');
});

test('replacement interruption after Planning closes the owned candidate', async () => {
  const context = fakeContext();
  const message = await createMessage(context);
  await message.completePlanning('Completed Planning');
  assert.equal(await message.commitInterruptedResponse('partial response'), true);
  assert.equal(context.chat[1].mes, 'partial response');
  assert.equal(context.chat[1].extra.agapePlannerResponsePending, undefined);
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
  const message = await createMessage(context, { type: 'regenerate' });

  await message.completePlanning('New Planning');
  await message.commitResponse('New response');

  assert.equal(context.chat.length, 2);
  assert.equal(context.chat[1].mes, 'New response');
  assert.equal(context.chat[1].extra.reasoning, 'New Planning');
  assert.equal(context.saveReplyCalls[0].type, 'regenerate');
  assert.equal(context.saveReplyCalls[0].fromStreaming, true);
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
  const message = await createMessage(context, { type: 'regenerate' });

  await message.rollback();

  assert.deepEqual(context.chat[1], original);
});

test('Planner failure removes only the owned provisional assistant message', async () => {
  const context = fakeContext();
  const message = await createMessage(context);

  await message.rollback();

  assert.deepEqual(context.chat, [{ is_user: true, mes: 'Turn' }]);
});

test('stale callbacks cannot edit or delete after a newer message appears', async () => {
  const context = fakeContext();
  const message = await createMessage(context);
  context.chat.push({ is_user: false, mes: 'Newer message', extra: {} });

  await assert.rejects(message.setPlanning('stale'), /no longer owned/);
  await message.rollback();

  assert.equal(context.chat.at(-1).mes, 'Newer message');
  assert.equal(context.chat.length, 3);
});

test('chat identity changes invalidate ownership without mutating either chat', async () => {
  const context = fakeContext();
  const message = await createMessage(context);
  context.setChatIdentity('chat-b');

  await assert.rejects(message.completePlanning('Planning'), /no longer owned/);
  await message.rollback();

  assert.equal(context.chat.length, 2);
  assert.equal(context.chat[1].extra.agapePlannerResponsePending, true);
});

test('withoutCandidate hides the shell for dry-run capture and restores it', async () => {
  const context = fakeContext();
  const message = await createMessage(context);
  let seen;

  await message.withoutCandidate(async () => {
    seen = context.chat[1].is_system;
  });

  assert.equal(seen, true);
  assert.equal(context.chat[1].is_system, undefined);
});

test('Response failure keeps exact Planning and commits through appendFinal', async () => {
  const context = fakeContext();
  const message = await createMessage(context);

  await message.completePlanning('Completed Planning');
  await message.failResponse('Response failed.');

  assert.equal(context.chat[1].mes, 'Response failed.');
  assert.equal(context.chat[1].extra.reasoning, 'Completed Planning');
  assert.equal(context.saveReplyCalls.at(-1).type, 'appendFinal');
  assert.equal(context.saveReplyCalls.at(-1).getMessage, 'Response failed.');
  assert.equal(context.saveReplyCalls.at(-1).reasoning, '');
});

test('partial Stop commits streamed Response text and keeps Planning', async () => {
  const context = fakeContext();
  const message = await createMessage(context);

  await message.completePlanning('Completed Planning');
  await message.setResponse('partial reply');
  await message.commitStoppedResponse('partial reply');

  assert.equal(context.chat[1].mes, 'partial reply');
  assert.equal(context.chat[1].extra.reasoning, 'Completed Planning');
  assert.equal(context.saveReplyCalls.at(-1).type, 'appendFinal');
  assert.equal(context.saveReplyCalls.at(-1).getMessage, 'partial reply');
  assert.deepEqual(context.updateMessageBlockCalls.at(-1), { messageId: 1, mes: 'partial reply' });
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
