import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlannerContextMessage,
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

test('depth-limited Planner history takes only the requested recent visible messages', () => {
  assert.deepEqual(collectPlannerHistory(chat, { historyMode: 'depth', historyDepth: 2 }), [
    { role: 'assistant', name: 'Narrator', content: 'The attendant answers.' },
    { role: 'user', name: 'Eloise', content: 'I look down.' },
  ]);
  assert.deepEqual(collectPlannerHistory(chat, { historyMode: 'depth', historyDepth: 0 }), []);
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

test('Planner sees purpose, history, exact template, then the instruction to begin Planning', () => {
  const message = buildPlannerContextMessage({
    presetPrompts: [
      { name: 'NPC Voice', role: 'system', content: '<npc_voice>Legato speech.</npc_voice>' },
    ],
    history: collectPlannerHistory(chat, { historyMode: 'full' }),
    summaryception: 'Earlier events summarized here.',
    plannerTemplate: '# MAX Template\nGate 1... {{literal-output}}',
  });

  assert.equal(message.role, 'user');
  assert.match(message.content, /^<system>\nCreate Planning for the next roleplay response\./);
  assert.match(message.content, /<\/system>\n\n<preset>\n<prompt role="system" name="NPC Voice">\n<npc_voice>Legato speech\.<\/npc_voice>\n<\/prompt>\n<\/preset>/);
  assert.match(message.content, /<history>[\s\S]*<summaryception>\nEarlier events summarized here\.[\s\S]*<message role="assistant" name="Narrator">\nOpening scene\.\n<\/message>/);
  assert.match(message.content, /<planner_template>\n# MAX Template\nGate 1\.\.\. \{\{literal-output\}\}\n<\/planner_template>/);
  assert.match(message.content, /<\/planner_template>\n\nBegin Planning now\. Fill in the Planner template using the system and history above\. Output only the completed Planning\.$/);
  assert.doesNotMatch(message.content, /never call it reasoning/i);
});
