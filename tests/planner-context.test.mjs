import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlannerContextMessages,
  collectActivePresetPrompts,
  collectPlannerHistory,
  extractSummaryceptionText,
} from '../src/planner-context.mjs';

const chat = [
  { is_user: false, name: 'Narrator', mes: 'Opening scene.' },
  { is_user: true, name: 'Eloise', mes: 'I inspect the sign.' },
  { is_user: false, name: 'Narrator', mes: 'The attendant answers.' },
  { is_user: false, is_system: true, name: 'System', mes: 'Hidden system row.' },
  { is_user: true, name: 'Eloise', mes: 'I look down.' },
  { is_user: false, name: 'Narrator', mes: '   ' },
];

test('full Planner history preserves every visible conversation message in order', () => {
  assert.deepEqual(collectPlannerHistory(chat, { historyMode: 'full' }), [
    { role: 'assistant', name: 'Narrator', content: 'Opening scene.' },
    { role: 'user', name: 'Eloise', content: 'I inspect the sign.' },
    { role: 'assistant', name: 'Narrator', content: 'The attendant answers.' },
    { role: 'user', name: 'Eloise', content: 'I look down.' },
  ]);
});

test('native Planner packet separates task, preset, history, template, and start by role', () => {
  const messages = buildPlannerContextMessages({
    presetPrompts: [
      { name: 'Rules', role: 'system', content: '<rules>Apply.</rules>' },
      { name: 'Example', role: 'assistant', content: 'Example response.' },
      { name: 'Direction', role: 'user', content: 'Follow this direction.' },
    ],
    history: [{ role: 'user', name: 'Eloise', content: 'Current turn.' }],
    plannerTemplate: '# Planning\nGATE 1. Scene:',
  });

  assert.deepEqual(messages.map((message) => message.role), [
    'system', 'system', 'system', 'assistant', 'user', 'system',
    'system', 'user', 'system', 'system', 'system',
  ]);
  assert.match(messages[0].content, /^<system>/);
  assert.match(messages[1].content, /^<preset>/);
  assert.match(messages[2].content, /^<prompt name="Rules">/);
  assert.match(messages[3].content, /^<prompt name="Example">/);
  assert.match(messages[4].content, /^<prompt name="Direction">/);
  assert.equal(messages[5].content, '</preset>');
  assert.equal(messages[6].content, '<history>');
  assert.match(messages[7].content, /^<message name="Eloise">/);
  assert.equal(messages[8].content, '</history>');
  assert.match(messages[9].content, /^<planner_template>/);
  assert.match(messages[10].content, /^Begin Planning now\./);
  assert.equal(messages.filter((message) => message.content.startsWith('<preset>')).length, 1);
  assert.equal(messages.filter((message) => message.content === '</preset>').length, 1);
  assert.equal(messages.some((message) => message.content.includes('Apply.</rules>\n</prompt>\n<prompt')), false);
});

test('greeting Planning uses only the start command as Gemini user contents', () => {
  const messages = buildPlannerContextMessages({
    history: [],
    plannerTemplate: '# Planning\nGATE 1. Greeting:',
  });
  assert.deepEqual(messages.map((message) => message.role), [
    'system', 'system', 'system', 'system', 'user',
  ]);
  assert.match(messages.at(-1).content, /^Begin Planning now\./);
});

test('depth-limited Planner history takes only the requested recent visible messages', () => {
  assert.deepEqual(collectPlannerHistory(chat, { historyMode: 'depth', historyDepth: 2 }), [
    { role: 'user', name: 'Eloise', content: 'I inspect the sign.' },
    { role: 'assistant', name: 'Narrator', content: 'The attendant answers.' },
    { role: 'user', name: 'Eloise', content: 'I look down.' },
  ]);
  assert.deepEqual(collectPlannerHistory(chat, { historyMode: 'depth', historyDepth: 0 }), [
    { role: 'user', name: 'Eloise', content: 'I look down.' },
  ]);
});

test('Summaryception renders oldest promoted layer first and live layer last', () => {
  const metadata = {
    summaryception: {
      layers: [
        [{ text: 'Live summary.' }],
        [{ text: 'Older summary A.' }, { text: 'Older summary B.' }],
      ],
    },
  };

  assert.equal(
    extractSummaryceptionText(metadata),
    'Older summary A.\n\nOlder summary B.\n\nLive summary.',
  );
  assert.equal(extractSummaryceptionText({ summaryception: { layers: [] } }), '');
});

test('preset context includes enabled active-preset prompts with variables expanded', () => {
  const prompts = [
    { identifier: 'voice', name: 'NPC Voice', role: 'system', content: '<npc_voice>{{getvar::voice}}</npc_voice>' },
    { identifier: 'max', name: 'MAX Chain of Thought', role: 'user', content: 'Template copy' },
    { identifier: 'disabled', name: 'Disabled', role: 'system', content: 'Never included' },
    { identifier: 'chatHistory', name: 'Chat History', role: 'system', content: '' },
  ];
  const promptOrder = [
    { identifier: 'voice', enabled: true },
    { identifier: 'max', enabled: true },
    { identifier: 'disabled', enabled: false },
    { identifier: 'chatHistory', enabled: true },
  ];

  assert.deepEqual(collectActivePresetPrompts({
    prompts,
    promptOrder,
    substituteParams: (content) => content.replace('{{getvar::voice}}', 'legato'),
    plannerTemplate: 'Template copy',
  }), [
    { name: 'NPC Voice', role: 'system', content: '<npc_voice>legato</npc_voice>' },
  ]);
});
