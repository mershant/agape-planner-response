import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendPlanningToResponse,
  buildPlannerMessages,
  requireVisibleText,
} from '../src/contracts.mjs';

test('Planner receives one native-expanded system message', () => {
  const calls = [];
  const messages = buildPlannerMessages('State: {{getvar::state}}', (prompt) => {
    calls.push(prompt);
    return 'State: active';
  });

  assert.deepEqual(calls, ['State: {{getvar::state}}']);
  assert.deepEqual(messages, [{ role: 'system', content: 'State: active' }]);
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
