import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlannerContextMessages,
  collectActivePresetPrompts,
  collectPlannerHistory,
  extractSummaryceptionText,
} from '../src/planner-context.mjs';
import { DEFAULT_SETTINGS } from '../src/settings.mjs';

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
  const arrangement = structuredClone(DEFAULT_SETTINGS.planner.arrangements[0]);
  arrangement.blocks.find((block) => block.slot === 'preset').enabled = true;
  const messages = buildPlannerContextMessages({
    arrangement,
    presetPrompts: [
      { name: 'Rules', role: 'system', content: '<rules>Apply.</rules>' },
      { name: 'Example', role: 'assistant', content: 'Example response.' },
      { name: 'Direction', role: 'user', content: 'Follow this direction.' },
    ],
    history: [{ role: 'user', name: 'Eloise', content: 'Current turn.' }],
    plannerTemplate: '# Planning\nGATE 1. Scene:',
  });

  assert.deepEqual(messages.map((message) => message.role), [
    'system', 'system', 'assistant', 'user', 'system', 'system',
    'user', 'system', 'system', 'system', 'system',
  ]);
  assert.match(messages[0].content, /^<preset>/);
  assert.match(messages[0].content, /source material about the roleplay response/i);
  assert.match(messages[0].content, /not the task/i);
  assert.match(messages[1].content, /^<prompt name="Rules">/);
  assert.match(messages[2].content, /^<prompt name="Example">/);
  assert.match(messages[3].content, /^<prompt name="Direction">/);
  assert.equal(messages[4].content, '</preset>');
  assert.equal(messages[5].content, '<history>');
  assert.match(messages[6].content, /^<message name="Eloise">/);
  assert.equal(messages[7].content, '</history>');
  assert.match(messages[8].content, /^<task>/);
  assert.match(messages[8].content, /template is a form/i);
  assert.match(messages[8].content, /or write the roleplay response/i);
  assert.match(messages[9].content, /^<planner_template>/);
  assert.match(messages[10].content, /^Begin Planning now\./);
  assert.equal(messages.filter((message) => message.content.startsWith('<preset>')).length, 1);
  assert.equal(messages.filter((message) => message.content === '</preset>').length, 1);
  assert.equal(messages.some((message) => message.content.includes('Apply.</rules>\n</prompt>\n<prompt')), false);
});

test('Default arrangement produces the proven Planner packet byte for byte', () => {
  const arrangement = DEFAULT_SETTINGS.planner.arrangements[0];
  const messages = buildPlannerContextMessages({
    arrangement,
    history: [{ role: 'user', name: 'Eloise', content: 'Current turn.' }],
    summaryception: 'Earlier events.',
    plannerTemplate: '# Planning\nGATE 1. Scene:',
    substituteParams: (text) => text,
  });

  assert.deepEqual(messages, [
    { role: 'system', content: '<history>' },
    { role: 'system', content: '<summaryception>\nEarlier events.\n</summaryception>' },
    { role: 'user', content: '<message name="Eloise">\nCurrent turn.\n</message>' },
    { role: 'system', content: '</history>' },
    {
      role: 'system',
      content: '<task>\nFill the supplied Planner template for the next roleplay response. Use the conversation history and any relevant facts or constraints from the preset reference. The template is a form to complete, not a command to perform another hidden process. Its wording about internal processing and a final response describes how the later Response model will use this Planning document. Fill the form directly. Your output is the filled Planner template itself. Preserve every phase, gate, and requested item in order. Fill each item with concrete conclusions for this scene. Do not copy the questions, explain your work outside the template, or write the roleplay response.\n</task>',
    },
    { role: 'system', content: '<planner_template>\n# Planning\nGATE 1. Scene:\n</planner_template>' },
    {
      role: 'system',
      content: 'Begin Planning now. Start immediately with the Planner template\'s first section. Preserve its complete structure and fill it sequentially. Output only the completed Planning document.',
    },
  ]);
});

test('arrangement order, disabled blocks, added text, and fixed roles control assembly', () => {
  const arrangement = {
    name: 'Custom',
    blocks: [
      { kind: 'text', name: 'Disabled', enabled: false, order: 0, role: 'system', body: 'omit me' },
      { kind: 'slot', slot: 'template', name: 'Template', enabled: false, order: 1, role: 'assistant' },
      { kind: 'text', name: 'Reminder', enabled: true, order: 2, role: 'user', body: 'State: {{getvar::state}}' },
      { kind: 'slot', slot: 'history', name: 'History', enabled: true, order: 3, role: 'assistant' },
      { kind: 'slot', slot: 'preset', name: 'Preset', enabled: false, order: 4, role: 'system' },
    ],
  };

  const messages = buildPlannerContextMessages({
    arrangement,
    history: [{ role: 'user', name: 'Eloise', content: 'Current turn.' }],
    summaryception: 'Earlier events.',
    plannerTemplate: 'Template',
    substituteParams: (text) => text.replace('{{getvar::state}}', 'active'),
  });

  assert.deepEqual(messages, [
    { role: 'assistant', content: '<planner_template>\nTemplate\n</planner_template>' },
    { role: 'user', content: 'State: active' },
    { role: 'assistant', content: '<history>' },
    { role: 'system', content: '<summaryception>\nEarlier events.\n</summaryception>' },
    { role: 'user', content: '<message name="Eloise">\nCurrent turn.\n</message>' },
    { role: 'assistant', content: '</history>' },
  ]);
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

const nativePromptContent = {
  unanchored: [
    { kind: 'lorebook', placement: 'before-history', role: 'system', content: 'Before-character lore.' },
    { kind: 'authors-note', placement: 'after-history', role: 'system', content: 'Author note.' },
  ],
  anchored: [
    { kind: 'extension-injection', anchorDepth: 1, role: 'system', content: 'Injected exchange.' },
    { kind: 'lorebook', anchorDepth: 3, role: 'user', content: 'Depth lore.' },
    { kind: 'authors-note', anchorDepth: 0, role: 'assistant', content: 'Depth author note.' },
  ],
};

test('all-off Default packet stays byte-identical when native content is available', () => {
  const history = collectPlannerHistory(
    [{ is_user: true, name: 'Eloise', mes: 'Current turn.' }],
    {
      historyMode: 'full',
      includeLorebook: false,
      includeExtensionInjections: false,
      includeAuthorsNote: false,
    },
    nativePromptContent,
  );
  const messages = buildPlannerContextMessages({
    arrangement: DEFAULT_SETTINGS.planner.arrangements[0],
    history,
    summaryception: 'Earlier events.',
    plannerTemplate: '# Planning\nGATE 1. Scene:',
    substituteParams: (text) => text,
  });

  assert.deepEqual(messages, [
    { role: 'system', content: '<history>' },
    { role: 'system', content: '<summaryception>\nEarlier events.\n</summaryception>' },
    { role: 'user', content: '<message name="Eloise">\nCurrent turn.\n</message>' },
    { role: 'system', content: '</history>' },
    {
      role: 'system',
      content: '<task>\nFill the supplied Planner template for the next roleplay response. Use the conversation history and any relevant facts or constraints from the preset reference. The template is a form to complete, not a command to perform another hidden process. Its wording about internal processing and a final response describes how the later Response model will use this Planning document. Fill the form directly. Your output is the filled Planner template itself. Preserve every phase, gate, and requested item in order. Fill each item with concrete conclusions for this scene. Do not copy the questions, explain your work outside the template, or write the roleplay response.\n</task>',
    },
    { role: 'system', content: '<planner_template>\n# Planning\nGATE 1. Scene:\n</planner_template>' },
    {
      role: 'system',
      content: 'Begin Planning now. Start immediately with the Planner template\'s first section. Preserve its complete structure and fill it sequentially. Output only the completed Planning document.',
    },
  ]);
});

test('all native visibility options off preserve Planner history bytes', () => {
  const settings = {
    historyMode: 'full',
    includeLorebook: false,
    includeExtensionInjections: false,
    includeAuthorsNote: false,
  };

  assert.deepEqual(collectPlannerHistory(chat, settings, nativePromptContent), [
    { role: 'assistant', name: 'Narrator', content: 'Opening scene.' },
    { role: 'user', name: 'Eloise', content: 'I inspect the sign.' },
    { role: 'assistant', name: 'Narrator', content: 'The attendant answers.' },
    { role: 'user', name: 'Eloise', content: 'I look down.' },
  ]);
});

test('each native visibility option adds only its own assembled content', () => {
  const only = (setting) => collectPlannerHistory(chat, {
    historyMode: 'full',
    includeLorebook: false,
    includeExtensionInjections: false,
    includeAuthorsNote: false,
    [setting]: true,
  }, nativePromptContent);

  const lorebook = only('includeLorebook');
  assert.deepEqual(lorebook.filter(({ native }) => native).map(({ kind, content }) => [kind, content]), [
    ['lorebook', 'Before-character lore.'],
    ['lorebook', 'Depth lore.'],
  ]);

  const injections = only('includeExtensionInjections');
  assert.deepEqual(injections.filter(({ native }) => native).map(({ kind, content }) => [kind, content]), [
    ['extension-injection', 'Injected exchange.'],
  ]);
  assert.equal(
    injections.findIndex(({ content }) => content === 'Injected exchange.'),
    injections.findIndex(({ content }) => content === 'The attendant answers.') + 1,
  );

  const authorsNote = only('includeAuthorsNote');
  assert.deepEqual(authorsNote.filter(({ native }) => native).map(({ kind, content }) => [kind, content]), [
    ['authors-note', 'Depth author note.'],
    ['authors-note', 'Author note.'],
  ]);
});

test('history depth excludes native content whose anchor is outside the visible slice', () => {
  const history = collectPlannerHistory(chat, {
    historyMode: 'depth',
    historyDepth: 2,
    includeLorebook: true,
    includeExtensionInjections: true,
    includeAuthorsNote: true,
  }, nativePromptContent);

  assert.equal(history.some(({ content }) => content === 'Depth lore.'), false);
  assert.equal(history.some(({ content }) => content === 'Injected exchange.'), true);
  assert.equal(history.some(({ content }) => content === 'Depth author note.'), true);
  assert.equal(history.some(({ content }) => content === 'Before-character lore.'), true);
});

test('native content anchored to a hidden message stays hidden', () => {
  const hiddenChat = [
    { is_user: false, name: 'Narrator', mes: 'Visible prior.' },
    { is_user: false, is_hidden: true, name: 'Narrator', mes: 'Hidden anchor.' },
    { is_user: true, name: 'Eloise', mes: 'Current turn.' },
  ];
  const history = collectPlannerHistory(hiddenChat, {
    historyMode: 'full',
    includeExtensionInjections: true,
  }, {
    anchored: [
      { kind: 'extension-injection', anchorDepth: 1, role: 'system', content: 'Hidden injection.' },
      { kind: 'extension-injection', anchorDepth: 2, role: 'system', content: 'Visible injection.' },
    ],
  });

  assert.equal(history.some(({ content }) => content === 'Hidden injection.'), false);
  assert.equal(history.some(({ content }) => content === 'Visible injection.'), true);
});

test('assembled native content keeps its exact role and bytes inside History', () => {
  const messages = buildPlannerContextMessages({
    history: [
      { role: 'user', name: 'Eloise', content: 'Current turn.' },
      { native: true, kind: 'extension-injection', role: 'system', content: '  exact\nnative bytes  ' },
    ],
    plannerTemplate: 'Template',
  });

  assert.deepEqual(messages.slice(0, 4), [
    { role: 'system', content: '<history>' },
    { role: 'user', content: '<message name="Eloise">\nCurrent turn.\n</message>' },
    { role: 'system', content: '  exact\nnative bytes  ' },
    { role: 'system', content: '</history>' },
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
