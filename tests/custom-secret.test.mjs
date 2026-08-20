import assert from 'node:assert/strict';
import test from 'node:test';

import { saveCustomSecret } from '../src/custom-secret.mjs';

test('saving a stage key restores the Custom key that was active before it', async () => {
  const calls = [];
  const secretState = {
    api_key_custom: [
      { id: 'existing', active: true },
      { id: 'other', active: false },
    ],
  };
  const id = await saveCustomSecret({
    secretKey: 'api_key_custom',
    getSecretState: () => secretState,
    value: 'unpersisted raw value',
    label: 'AGAPE Planner',
    writeSecret: async (...args) => {
      calls.push(['write', ...args]);
      return 'new-stage-key';
    },
    rotateSecret: async (...args) => {
      calls.push(['rotate', ...args]);
      for (const item of secretState.api_key_custom) item.active = item.id === args[1];
    },
  });

  assert.equal(id, 'new-stage-key');
  assert.deepEqual(calls, [
    ['write', 'api_key_custom', 'unpersisted raw value', 'AGAPE Planner'],
    ['rotate', 'api_key_custom', 'existing'],
  ]);
});

test('key save reports failure when SillyTavern cannot restore the prior active key', async () => {
  const secretState = {
    api_key_custom: [{ id: 'existing', active: true }],
  };

  await assert.rejects(() => saveCustomSecret({
    secretKey: 'api_key_custom',
    getSecretState: () => secretState,
    value: 'raw value',
    label: 'AGAPE Response',
    writeSecret: async () => {
      secretState.api_key_custom[0].active = false;
      return 'new';
    },
    rotateSecret: async () => {},
  }), /did not restore/i);
});
