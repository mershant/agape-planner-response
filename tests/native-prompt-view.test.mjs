import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNativePromptContent,
  collectNativeInjectionSlices,
  hostInjectionKind,
} from '../src/native-prompt-view.mjs';

const message = (identifier, role, content) => ({ identifier, role, content });
const collection = (identifier, ...items) => ({ identifier, collection: items });

test('native prompt content keeps SillyTavern placement, roles, and bytes', () => {
  const promptCollection = collection(
    'root',
    collection('worldInfoBefore', message('worldInfoBefore', 'system', 'Lore before history.')),
    collection('main', message('authorsNote', 'user', 'Lore above.\nAuthor note.\nLore below.')),
    collection(
      'chatHistory',
      message('chatHistory-4', 'assistant', 'Opening scene.'),
      message('chatHistory-3', 'system', 'Depth lore.\nInjected exchange.\nDepth note.'),
      message('chatHistory-2', 'user', 'Current turn.'),
    ),
    collection('worldInfoAfter', message('worldInfoAfter', 'assistant', 'Lore after history.')),
  );

  assert.deepEqual(buildNativePromptContent({
    promptCollection,
    authorsNoteContent: 'Author note.',
    injectionSlices: [
      { kind: 'authors-note', anchorDepth: 0, role: 'system', content: 'Depth note.' },
      { kind: 'extension-injection', anchorDepth: 1, role: 'system', content: 'Injected exchange.' },
      { kind: 'lorebook', anchorDepth: 1, role: 'system', content: 'Depth lore.' },
      { kind: 'lorebook', anchorDepth: 8, role: 'system', content: 'Not assembled.' },
    ],
  }), {
    unanchored: [
      { kind: 'lorebook', placement: 'before-history', role: 'system', content: 'Lore before history.' },
      { kind: 'lorebook', placement: 'before-history', role: 'user', content: 'Lore above.' },
      { kind: 'authors-note', placement: 'before-history', role: 'user', content: 'Author note.' },
      { kind: 'lorebook', placement: 'before-history', role: 'user', content: 'Lore below.' },
      { kind: 'lorebook', placement: 'after-history', role: 'assistant', content: 'Lore after history.' },
    ],
    anchored: [
      { kind: 'lorebook', anchorDepth: 1, role: 'system', content: 'Depth lore.' },
      { kind: 'extension-injection', anchorDepth: 1, role: 'system', content: 'Injected exchange.' },
      { kind: 'authors-note', anchorDepth: 0, role: 'system', content: 'Depth note.' },
    ],
  });
});

test('host in-chat keys classify lorebook, author’s note, extensions, and native depth notes', () => {
  const ids = {
    authorsNoteKey: '2_floating_prompt',
    lorebookPrefix: 'customDepthWI',
    excludedPrefixes: ['DEPTH_PROMPT', 'QUIET_PROMPT', '__STORY_STRING__'],
  };

  assert.equal(hostInjectionKind('2_floating_prompt', ids), 'authors-note');
  assert.equal(hostInjectionKind('customDepthWI_3_0', ids), 'lorebook');
  assert.equal(hostInjectionKind('generic-in-chat-key', ids), 'extension-injection');
  assert.equal(hostInjectionKind('DEPTH_PROMPT', ids), null);
  assert.equal(hostInjectionKind('DEPTH_PROMPT_1', ids), null);
});

test('native content omitted by SillyTavern token assembly is omitted from Planner content', () => {
  const promptCollection = collection(
    'root',
    collection('chatHistory', message('chatHistory-1', 'user', 'Current turn.')),
  );

  assert.deepEqual(buildNativePromptContent({
    promptCollection,
    injectionSlices: [
      { kind: 'extension-injection', anchorDepth: 0, role: 'system', content: 'Pruned injection.' },
    ],
  }), { unanchored: [], anchored: [] });
});

test('assembled conversation text is not treated as native injection content', () => {
  const promptCollection = collection(
    'root',
    collection(
      'chatHistory',
      message('chatHistory-2', 'assistant', 'Pruned injection.'),
      message('chatHistory-1', 'user', 'Current turn.'),
    ),
  );

  assert.deepEqual(buildNativePromptContent({
    promptCollection,
    conversationContents: ['Pruned injection.', 'Current turn.'],
    injectionSlices: [
      { kind: 'extension-injection', anchorDepth: 0, role: 'assistant', content: 'Pruned injection.' },
    ],
  }), { unanchored: [], anchored: [] });
});

test('native injection collection delegates rendering and restores the host registry', async () => {
  const prompts = {
    author: { value: 'Lore top.\nAuthor note.\nLore bottom.', position: 1, depth: 0, role: 0 },
    'lore-2-0': { value: 'Depth lore.', position: 1, depth: 2, role: 0 },
    exchange: { value: 'Injected exchange.', position: 1, depth: 2, role: 0 },
    elsewhere: { value: 'Not in chat.', position: 0, depth: 0, role: 0 },
  };
  const original = structuredClone(prompts);
  const calls = [];
  const render = async (_position, depth, _separator, role) => {
    calls.push([depth, role]);
    return Object.keys(prompts)
      .sort()
      .map((key) => prompts[key])
      .filter((prompt) => prompt.position === 1
        && prompt.depth === depth
        && prompt.role === role
        && prompt.value)
      .map((prompt) => prompt.value)
      .join('\n');
  };

  const slices = await collectNativeInjectionSlices({
    prompts,
    inChatPosition: 1,
    authorsNoteKey: 'author',
    authorsNoteSource: 'Author note.',
    kindForKey(key) {
      if (key === 'author') return 'authors-note';
      if (key.startsWith('lore-')) return 'lorebook';
      return 'extension-injection';
    },
    render,
    roleName: () => 'system',
  });

  assert.deepEqual(slices, [
    { kind: 'lorebook', anchorDepth: 0, role: 'system', content: 'Lore top.' },
    { kind: 'authors-note', anchorDepth: 0, role: 'system', content: 'Author note.' },
    { kind: 'lorebook', anchorDepth: 0, role: 'system', content: 'Lore bottom.' },
    { kind: 'lorebook', anchorDepth: 2, role: 'system', content: 'Depth lore.' },
    { kind: 'extension-injection', anchorDepth: 2, role: 'system', content: 'Injected exchange.' },
  ]);
  assert.deepEqual(prompts, original);
  assert.ok(calls.length >= 4);
});
