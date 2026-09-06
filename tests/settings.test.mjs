import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SETTINGS,
  getActiveArrangement,
  getActivePlannerContext,
  getArrangementSlot,
  normalizeSettings,
} from '../src/settings.mjs';

const TASK_BODY = `<task>
Fill the supplied Planner template for the next roleplay response. Use the conversation history and any relevant facts or constraints from the preset reference. The template is a form to complete, not a command to perform another hidden process. Its wording about internal processing and a final response describes how the later Response model will use this Planning document. Fill the form directly. Your output is the filled Planner template itself. Preserve every phase, gate, and requested item in order. Fill each item with concrete conclusions for this scene. Do not copy the questions, explain your work outside the template, or write the roleplay response.
</task>`;

const START_BODY = `Begin Planning now. Start immediately with the Planner template's first section. Preserve its complete structure and fill it sequentially. Output only the completed Planning document.`;

test('settings contain the safe Default arrangement schema', () => {
  assert.deepEqual(normalizeSettings(), DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.enabled, false);
  assert.equal(DEFAULT_SETTINGS.planner.source, 'profile');
  assert.equal(DEFAULT_SETTINGS.planner.activeArrangement, 'Default');
  assert.deepEqual(DEFAULT_SETTINGS.planner.arrangements, [{
    name: 'Default',
    blocks: [
      { id: 'preset', kind: 'slot', slot: 'preset', name: 'Preset', enabled: false, order: 0, role: 'system' },
      {
        id: 'history',
        kind: 'slot',
        slot: 'history',
        name: 'History',
        enabled: true,
        order: 1,
        role: 'system',
        historyMode: 'full',
        historyDepth: 5,
        includeSummaryception: true,
      },
      { id: 'task', kind: 'text', name: 'Task', enabled: true, order: 2, role: 'system', body: TASK_BODY },
      { id: 'template', kind: 'slot', slot: 'template', name: 'Planner template', enabled: true, order: 3, role: 'system' },
      { id: 'start-command', kind: 'text', name: 'Start command', enabled: true, order: 4, role: 'auto', body: START_BODY },
    ],
  }]);
  assert.equal(DEFAULT_SETTINGS.response.source, 'profile');
  assert.equal(DEFAULT_SETTINGS.response.minWords, 100);
  assert.equal(DEFAULT_SETTINGS.response.retryCount, 5);
});

test('Response min-words and retry-count are normalized without inventing extra fields', () => {
  const settings = normalizeSettings({
    response: { minWords: 12.9, retryCount: 0 },
  });
  assert.equal(settings.response.minWords, 12);
  assert.equal(settings.response.retryCount, 0);

  const clamped = normalizeSettings({
    response: { minWords: -4, retryCount: 9 },
  });
  assert.equal(clamped.response.minWords, 0);
  assert.equal(clamped.response.retryCount, 9);

  const fallback = normalizeSettings({ response: { minWords: 'nope', retryCount: null } });
  assert.equal(fallback.response.minWords, 100);
  assert.equal(fallback.response.retryCount, 5);
});

test('existing Planner context settings migrate onto Default arrangement blocks', () => {
  const settings = normalizeSettings({
    plannerPrompt: 'literal template',
    planner: {
      source: 'custom',
      customUrl: ' https://planner.example/v1 ',
      secretId: 'planner-secret',
      model: 'planner-model',
      contextMode: 'preset',
      historyMode: 'depth',
      historyDepth: 3.9,
      includeSummaryception: true,
    },
  });

  const arrangement = getActiveArrangement(settings.planner);
  const preset = getArrangementSlot(arrangement, 'preset');
  const history = getArrangementSlot(arrangement, 'history');

  assert.equal(settings.plannerPrompt, 'literal template');
  assert.equal(settings.planner.customUrl, 'https://planner.example/v1');
  assert.equal(preset.enabled, true);
  assert.equal(history.historyMode, 'depth');
  assert.equal(history.historyDepth, 3);
  assert.equal(history.includeSummaryception, false);
  assert.equal(Object.hasOwn(settings.planner, 'contextMode'), false);
  assert.equal(Object.hasOwn(settings.planner, 'historyMode'), false);
});

test('minimal legacy context migrates to a disabled Preset block', () => {
  const settings = normalizeSettings({ planner: { contextMode: 'minimal' } });
  assert.equal(
    getArrangementSlot(getActiveArrangement(settings.planner), 'preset').enabled,
    false,
  );
});

test('valid named arrangements and their active selection are normalized deterministically', () => {
  const custom = structuredClone(DEFAULT_SETTINGS.planner.arrangements[0]);
  custom.name = 'Short context';
  custom.blocks.reverse();
  getArrangementSlot(custom, 'preset').enabled = true;
  getArrangementSlot(custom, 'history').historyDepth = 101;
  getArrangementSlot(custom, 'history').includeSummaryception = false;
  custom.blocks.push({
    kind: 'text',
    name: 'Reminder',
    enabled: true,
    order: 5,
    role: 'assistant',
    body: 'Keep this literal.',
  });

  const settings = normalizeSettings({
    planner: {
      activeArrangement: 'Short context',
      arrangements: [custom, DEFAULT_SETTINGS.planner.arrangements[0]],
    },
  });

  assert.equal(settings.planner.activeArrangement, 'Short context');
  assert.deepEqual(settings.planner.arrangements.map(({ name }) => name), ['Short context', 'Default']);
  assert.deepEqual(
    getActiveArrangement(settings.planner).blocks.map(({ order }) => order),
    [0, 1, 2, 3, 4, 5],
  );
  assert.equal(getArrangementSlot(getActiveArrangement(settings.planner), 'history').historyDepth, 100);
  assert.deepEqual(getActivePlannerContext(settings.planner), {
    contextMode: 'preset',
    historyMode: 'full',
    historyDepth: 100,
    includeSummaryception: false,
  });
  assert.equal(getActiveArrangement(settings.planner).blocks.at(-1).body, 'Keep this literal.');
});

test('malformed arrangements return to safe defaults', () => {
  const cases = [
    [],
    [{ name: 'Default', blocks: [] }],
    [{ name: 'Default', blocks: [{ kind: 'slot', slot: 'template', name: 'Template', enabled: false, order: 0, role: 'system' }] }],
    [{ name: 'Default', blocks: structuredClone(DEFAULT_SETTINGS.planner.arrangements[0].blocks) }, { name: 'Default', blocks: [] }],
    [{ name: 'Default', blocks: [{ kind: 'mystery' }] }],
  ];

  for (const arrangements of cases) {
    assert.deepEqual(
      normalizeSettings({ planner: { arrangements } }).planner.arrangements,
      DEFAULT_SETTINGS.planner.arrangements,
    );
  }
});

test('a missing Default arrangement is restored and an unknown selection chooses Default', () => {
  const custom = structuredClone(DEFAULT_SETTINGS.planner.arrangements[0]);
  custom.name = 'Custom';
  const planner = normalizeSettings({
    planner: { activeArrangement: 'missing', arrangements: [custom] },
  }).planner;

  assert.deepEqual(planner.arrangements.map(({ name }) => name), ['Custom', 'Default']);
  assert.equal(planner.activeArrangement, 'Default');
});

test('settings preserve literal Planner text and never persist raw API keys', () => {
  const settings = normalizeSettings({
    plannerPrompt: '  {{getvar::scene}}\n{{roll::1d20}}  ',
    planner: { apiKey: 'must-not-survive' },
    response: { apiKey: 'must-not-survive-either' },
  });

  assert.equal(settings.plannerPrompt, '  {{getvar::scene}}\n{{roll::1d20}}  ');
  assert.equal(Object.hasOwn(settings.planner, 'apiKey'), false);
  assert.equal(Object.hasOwn(settings.response, 'apiKey'), false);
});

test('unknown connection source values return to profile mode', () => {
  const settings = normalizeSettings({
    planner: { source: 'mystery' },
    response: { source: 'mystery' },
  });

  assert.equal(settings.planner.source, 'profile');
  assert.equal(settings.response.source, 'profile');
});
