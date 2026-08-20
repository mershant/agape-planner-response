import assert from 'node:assert/strict';
import test from 'node:test';

import { captureNormalResponseMessages } from '../src/response-context.mjs';

function createEventSource() {
  const listeners = new Map();
  return {
    on(type, listener) { listeners.set(type, listener); },
    removeListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    emit(type, value) { listeners.get(type)?.(value); },
    count: () => listeners.size,
  };
}

test('normal Response prompt capture does not remove or replace live chat messages', async () => {
  const eventSource = createEventSource();
  const chat = [{ is_user: true, mes: 'Current turn' }];
  const context = {
    mainApi: 'openai',
    chat,
    chatCompletionSettings: { squash_system_messages: false },
    eventTypes: { CHAT_COMPLETION_PROMPT_READY: 'prompt' },
    eventSource,
    async generate(type, options, dryRun) {
      assert.equal(type, 'normal');
      assert.equal(dryRun, true);
      assert.equal(context.chat, chat);
      assert.equal(context.chat.length, 1);
      eventSource.emit('prompt', {
        dryRun: true,
        chat: [
          { role: 'system', content: 'Active preset' },
          { role: 'user', content: 'Current turn' },
        ],
      });
    },
  };

  const messages = await captureNormalResponseMessages(context);

  assert.deepEqual(messages, [
    { role: 'system', content: 'Active preset' },
    { role: 'user', content: 'Current turn' },
  ]);
  assert.deepEqual(chat, [{ is_user: true, mes: 'Current turn' }]);
  assert.equal(eventSource.count(), 0);
});

test('prompt capture mirrors native consecutive system-message squashing when enabled', async () => {
  const eventSource = createEventSource();
  const context = {
    mainApi: 'openai',
    chat: [],
    chatCompletionSettings: { squash_system_messages: true },
    eventTypes: { CHAT_COMPLETION_PROMPT_READY: 'prompt' },
    eventSource,
    async generate() {
      eventSource.emit('prompt', {
        dryRun: true,
        chat: [
          { role: 'system', content: 'One' },
          { role: 'system', content: 'Two' },
          { role: 'user', content: 'Turn' },
        ],
      });
    },
  };

  let called = false;
  assert.deepEqual(await captureNormalResponseMessages(context, async () => {
    called = true;
    return [
      { role: 'system', content: 'One\nTwo' },
      { role: 'user', content: 'Turn' },
    ];
  }), [
    { role: 'system', content: 'One\nTwo' },
    { role: 'user', content: 'Turn' },
  ]);
  assert.equal(called, true);
});
