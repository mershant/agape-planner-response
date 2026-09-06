import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addTextBlock,
  createArrangement,
  deleteActiveArrangement,
  moveBlock,
  removeBlock,
  renameActiveArrangement,
  resetActiveArrangement,
  switchArrangement,
  updateBlock,
} from '../src/arrangement-editor.mjs';
import { DEFAULT_SETTINGS, getActiveArrangement, getArrangementSlot } from '../src/settings.mjs';

const freshPlanner = () => structuredClone(DEFAULT_SETTINGS.planner);

test('arrangements can be created, renamed, switched, reset, and deleted without changing Default', () => {
  let planner = createArrangement(freshPlanner(), 'Focused');
  assert.equal(planner.activeArrangement, 'Focused');
  assert.deepEqual(getActiveArrangement(planner).blocks, DEFAULT_SETTINGS.planner.arrangements[0].blocks);

  planner = renameActiveArrangement(planner, 'Compact');
  assert.equal(planner.activeArrangement, 'Compact');
  assert.deepEqual(planner.arrangements.map(({ name }) => name), ['Default', 'Compact']);

  planner = switchArrangement(planner, 'Default');
  assert.equal(planner.activeArrangement, 'Default');
  planner = switchArrangement(planner, 'Compact');

  planner = updateBlock(planner, 'preset', { enabled: true });
  planner = resetActiveArrangement(planner);
  assert.equal(planner.activeArrangement, 'Compact');
  assert.equal(getArrangementSlot(getActiveArrangement(planner), 'preset').enabled, false);

  planner = deleteActiveArrangement(planner);
  assert.equal(planner.activeArrangement, 'Default');
  assert.deepEqual(planner.arrangements, DEFAULT_SETTINGS.planner.arrangements);
});

test('arrangement names are required and unique, and Default cannot be deleted', () => {
  let planner = freshPlanner();
  assert.throws(() => createArrangement(planner, '  '), /name/i);
  assert.throws(() => createArrangement(planner, 'Default'), /exists/i);
  assert.throws(() => deleteActiveArrangement(planner), /Default/);

  planner = createArrangement(planner, 'Focused');
  assert.throws(() => renameActiveArrangement(planner, 'Default'), /exists/i);
});

test('text blocks can be added, edited, reordered, disabled, and removed', () => {
  let planner = createArrangement(freshPlanner(), 'Custom');
  planner = addTextBlock(planner, 'Reminder');
  let arrangement = getActiveArrangement(planner);
  const reminder = arrangement.blocks.at(-1);
  assert.equal(reminder.kind, 'text');
  assert.equal(reminder.name, 'Reminder');

  planner = updateBlock(planner, reminder.id, {
    name: 'Style note',
    body: 'Keep {{char}} concise.',
    role: 'assistant',
    enabled: false,
  });
  planner = moveBlock(planner, reminder.id, -2);
  arrangement = getActiveArrangement(planner);
  const edited = arrangement.blocks.find(({ id }) => id === reminder.id);
  assert.deepEqual(
    { name: edited.name, body: edited.body, role: edited.role, enabled: edited.enabled, order: edited.order },
    { name: 'Style note', body: 'Keep {{char}} concise.', role: 'assistant', enabled: false, order: 3 },
  );

  planner = removeBlock(planner, reminder.id);
  assert.equal(getActiveArrangement(planner).blocks.some(({ id }) => id === reminder.id), false);
});

test('template protection and History options are enforced by editor operations', () => {
  let planner = createArrangement(freshPlanner(), 'Custom');
  assert.throws(() => updateBlock(planner, 'template', { enabled: false }), /template/i);
  assert.throws(() => removeBlock(planner, 'template'), /template/i);

  planner = updateBlock(planner, 'history', {
    historyMode: 'depth',
    historyDepth: 12,
    includeSummaryception: true,
    includeLorebook: true,
    includeExtensionInjections: true,
    includeAuthorsNote: true,
    role: 'user',
  });
  const history = getArrangementSlot(getActiveArrangement(planner), 'history');
  assert.equal(history.historyMode, 'depth');
  assert.equal(history.historyDepth, 12);
  assert.equal(history.includeSummaryception, false);
  assert.equal(history.includeLorebook, true);
  assert.equal(history.includeExtensionInjections, true);
  assert.equal(history.includeAuthorsNote, true);
  assert.equal(history.role, 'user');
});
