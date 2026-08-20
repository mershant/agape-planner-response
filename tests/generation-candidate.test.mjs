import assert from 'node:assert/strict';
import test from 'node:test';

import { historyForGeneration, isPlannedGeneration } from '../src/generation-candidate.mjs';

test('normal, swipe, and regenerate each create a planned assistant candidate', () => {
  assert.equal(isPlannedGeneration('normal'), true);
  assert.equal(isPlannedGeneration('swipe'), true);
  assert.equal(isPlannedGeneration('regenerate'), true);
  assert.equal(isPlannedGeneration('continue'), false);
  assert.equal(isPlannedGeneration('quiet'), false);
});

test('swipe Planning excludes the assistant candidate being replaced from history', () => {
  const chat = [
    { is_user: true, mes: 'Current turn' },
    { is_user: false, mes: 'Old assistant candidate' },
  ];
  assert.deepEqual(historyForGeneration(chat, 'swipe'), [chat[0]]);
  assert.deepEqual(historyForGeneration(chat, 'regenerate'), [chat[0]]);
  assert.deepEqual(historyForGeneration(chat, 'normal'), chat);
  const normalHistory = historyForGeneration(chat, 'normal');
  chat.push({ is_user: false, mes: 'New shell' });
  assert.equal(normalHistory.length, 2);
});
