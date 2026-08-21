import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeKernel, validateNativeUserTurn } from '../src/runtime-kernel.mjs';

function contextFixture() {
  return {
    id: 'chat-a',
    chat: [{ is_user: true, mes: 'Turn' }],
    getCurrentChatId() { return this.id; },
  };
}

test('normal interception consumes only the exact newly saved terminal user turn', () => {
  const context = contextFixture();
  const kernel = createRuntimeKernel({ contextProvider: () => context, runCandidate: async () => ({}) });
  kernel.captureUserTurn(0);
  const turn = kernel.consumeUserTurn(context.chat.slice());
  assert.equal(turn.message, context.chat[0]);
  assert.equal(kernel.consumeUserTurn(context.chat), null);
});

test('user-turn ownership fails after chat or terminal-message changes', () => {
  const context = contextFixture();
  const kernel = createRuntimeKernel({ contextProvider: () => context, runCandidate: async () => ({}) });
  kernel.captureUserTurn(0);
  context.chat.push({ is_user: false, mes: 'Unexpected' });
  assert.equal(kernel.consumeUserTurn(context.chat), null);
  context.chat.pop();
  kernel.captureUserTurn(0);
  context.id = 'chat-b';
  assert.equal(kernel.consumeUserTurn(context.chat), null);
});

test('queued normal run revalidates the exact saved user object before Planning', () => {
  const context = contextFixture();
  const pending = {
    chatIdentity: 'chat-a',
    messageIndex: 0,
    message: context.chat[0],
  };
  assert.equal(validateNativeUserTurn(context, pending), true);
  context.chat[0] = { is_user: true, mes: 'Replacement object' };
  assert.equal(validateNativeUserTurn(context, pending), false);
});

test('a replacement run aborts the active candidate and waits for its cleanup', async () => {
  const context = contextFixture();
  const events = [];
  let releaseFirst;
  const firstFinished = new Promise((resolve) => { releaseFirst = resolve; });
  const kernel = createRuntimeKernel({
    contextProvider: () => context,
    runCandidate: async ({ name, signal }) => {
      events.push(`${name}:start`);
      if (name === 'first') {
        await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
        events.push(`first:${signal.reason}`);
        releaseFirst();
      }
      events.push(`${name}:finish`);
      return { name };
    },
  });

  const first = kernel.enqueue({ name: 'first' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = kernel.enqueue({ name: 'second' });
  await firstFinished;
  await Promise.all([first, second]);

  assert.deepEqual(events, [
    'first:start',
    'first:interrupted',
    'first:finish',
    'second:start',
    'second:finish',
  ]);
});

test('Stop and chat change cancel the active operation', async () => {
  for (const [method, reason] of [['stop', 'cancelled'], ['chatChanged', 'interrupted']]) {
    const context = contextFixture();
    let observed;
    const kernel = createRuntimeKernel({
      contextProvider: () => context,
      runCandidate: async ({ signal }) => {
        await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
        observed = signal.reason;
      },
    });
    const run = kernel.enqueue({});
    await new Promise((resolve) => setTimeout(resolve, 0));
    kernel[method]();
    await run;
    assert.equal(observed, reason);
  }
});
