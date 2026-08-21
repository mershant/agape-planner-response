import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendPlanningToResponse,
  buildPlannerMessages,
  requireVisibleText,
} from '../src/contracts.mjs';

test('Planner receives a native contextual message sequence with its expanded template last', () => {
  const calls = [];
  const messages = buildPlannerMessages('State: {{getvar::state}}', (prompt) => {
    calls.push(prompt);
    return 'State: active';
  });

  assert.deepEqual(calls, ['State: {{getvar::state}}']);
  assert.equal(messages.length, 5);
  assert.deepEqual(messages.map((message) => message.role), ['system', 'system', 'system', 'system', 'user']);
  assert.match(messages[3].content, /<planner_template>\nState: active\n<\/planner_template>/);
  assert.match(messages[4].content, /^Begin Planning now\./);
});

test('Response keeps normal SillyTavern messages and receives exact Planning last', () => {
  const normal = [
    { role: 'system', content: 'Active preset' },
    { role: 'user', content: 'Current turn' },
    { role: 'system', content: 'Post-history instruction' },
  ];
  const planning = 'Use {{getvar::literal}} exactly.\n- Do not expand again.';

  const result = appendPlanningToResponse(normal, planning);

  assert.deepEqual(result, [
    ...normal,
    { role: 'system', content: planning },
  ]);
  assert.notEqual(result, normal);
  assert.deepEqual(normal, [
    { role: 'system', content: 'Active preset' },
    { role: 'user', content: 'Current turn' },
    { role: 'system', content: 'Post-history instruction' },
  ]);
});

test('blank visible model content is rejected without rewriting nonblank bytes', () => {
  assert.equal(requireVisibleText('  exact\n'), '  exact\n');
  assert.throws(() => requireVisibleText(' \n\t'), /blank visible content/i);
});
