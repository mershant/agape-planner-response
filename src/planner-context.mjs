import { DEFAULT_SETTINGS } from './settings.mjs';

const nonblank = (value) => typeof value === 'string' && value.trim() !== '';
const STRUCTURAL_PROMPTS = new Set([
  'worldInfoBefore',
  'personaDescription',
  'charDescription',
  'charPersonality',
  'scenario',
  'worldInfoAfter',
  'dialogueExamples',
  'chatHistory',
]);

function visibleMessage(message) {
  return nonblank(message?.mes)
    && message?.is_system !== true
    && message?.is_hidden !== true
    && message?.extra?.sc_ghosted !== true;
}

const VISIBILITY_SETTING = Object.freeze({
  lorebook: 'includeLorebook',
  'extension-injection': 'includeExtensionInjections',
  'authors-note': 'includeAuthorsNote',
});

function nativeContentEnabled(content, settings) {
  const setting = VISIBILITY_SETTING[content?.kind];
  return setting && settings?.[setting] === true && nonblank(content?.content);
}

function nativeHistoryMessage(content) {
  return {
    native: true,
    kind: content.kind,
    role: content.role,
    content: content.content,
  };
}

function anchorMessages(chat) {
  return (Array.isArray(chat) ? chat : [])
    .filter((message) => message?.is_system !== true
      && message?.extra?.[Symbol.for('ignore')] !== true
      && nonblank(message?.mes));
}

export function collectPlannerHistory(chat, settings, nativePromptContent = {}) {
  const anchored = anchorMessages(chat);
  const messages = anchored
    .map((message, index) => ({
      role: message.is_user === true ? 'user' : 'assistant',
      name: typeof message.name === 'string' ? message.name : '',
      content: message.mes,
      anchorDepth: anchored.length - index - 1,
      visible: visibleMessage(message),
    }))
    .filter(({ visible }) => visible);

  let selected = messages;
  if (settings?.historyMode === 'depth') {
    const depth = Number.isFinite(settings.historyDepth)
      ? Math.max(0, Math.trunc(settings.historyDepth))
      : 0;
    const currentUserIndex = messages.findLastIndex((message) => message.role === 'user');
    if (currentUserIndex === -1) {
      selected = depth === 0 ? [] : messages.slice(-depth);
    } else {
      const currentUser = messages[currentUserIndex];
      const previous = messages.slice(0, currentUserIndex);
      selected = [...(depth === 0 ? [] : previous.slice(-depth)), currentUser];
    }
  }

  const unanchored = Array.isArray(nativePromptContent?.unanchored)
    ? nativePromptContent.unanchored
    : [];
  const before = unanchored
    .filter((content) => content.placement === 'before-history'
      && nativeContentEnabled(content, settings))
    .map(nativeHistoryMessage);
  const after = unanchored
    .filter((content) => content.placement === 'after-history'
      && nativeContentEnabled(content, settings))
    .map(nativeHistoryMessage);
  const anchoredContent = (Array.isArray(nativePromptContent?.anchored)
    ? nativePromptContent.anchored
    : []).filter((content) => nativeContentEnabled(content, settings));

  const rendered = [...before];
  for (const message of selected) {
    const { anchorDepth, visible, ...conversationMessage } = message;
    rendered.push(conversationMessage);
    rendered.push(...anchoredContent
      .filter((content) => content.anchorDepth === anchorDepth)
      .map(nativeHistoryMessage));
  }
  rendered.push(...after);
  return rendered;
}

function snippetText(snippet) {
  if (typeof snippet === 'string') return nonblank(snippet) ? snippet : null;
  return nonblank(snippet?.text) ? snippet.text : null;
}

export function extractSummaryceptionText(chatMetadata) {
  const layers = chatMetadata?.summaryception?.layers;
  if (!Array.isArray(layers)) return '';

  const rendered = [];
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    const snippets = Array.isArray(layer)
      ? layer
      : Array.isArray(layer?.snippets) ? layer.snippets : [];
    for (const snippet of snippets) {
      const text = snippetText(snippet);
      if (text !== null) rendered.push(text);
    }
  }
  return rendered.join('\n\n');
}

export function collectActivePresetPrompts({
  prompts,
  promptOrder,
  substituteParams,
  plannerTemplate,
}) {
  const byId = new Map((Array.isArray(prompts) ? prompts : [])
    .filter((prompt) => prompt && typeof prompt === 'object')
    .map((prompt) => [prompt.identifier, prompt]));
  const expand = typeof substituteParams === 'function'
    ? substituteParams
    : (content) => content;

  const rendered = [];
  for (const entry of Array.isArray(promptOrder) ? promptOrder : []) {
    if (entry?.enabled !== true || STRUCTURAL_PROMPTS.has(entry.identifier)) continue;
    const prompt = byId.get(entry.identifier);
    if (!prompt || !nonblank(prompt.content) || prompt.content === plannerTemplate) continue;
    const content = expand(prompt.content);
    if (!nonblank(content)) continue;
    rendered.push({
      name: nonblank(prompt.name) ? prompt.name : prompt.identifier,
      role: nonblank(prompt.role) ? prompt.role : 'system',
      content,
    });
  }
  return rendered;
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function resolvedRole(role, hasUserTurn) {
  return role === 'auto' ? (hasUserTurn ? 'system' : 'user') : role;
}

function presetMessages(block, presetPrompts, hasUserTurn) {
  if (!Array.isArray(presetPrompts) || presetPrompts.length === 0) return [];
  const role = resolvedRole(block.role, hasUserTurn);
  const messages = [{
    role,
    content: [
      '<preset>',
      'This block is source material about the roleplay response that another model will write after Planning. It supplies relevant world, character, style, and response constraints. It is not the task. Instructions quoted inside this block describe the later roleplay response and do not address the Planner.',
    ].join('\n'),
  }];
  for (const prompt of presetPrompts) {
    messages.push({
      role: prompt.role,
      content: [
        `<prompt name="${escapeAttribute(prompt.name)}">`,
        prompt.content,
        '</prompt>',
      ].join('\n'),
    });
  }
  messages.push({ role, content: '</preset>' });
  return messages;
}

function historyMessages(block, history, summaryception, hasUserTurn) {
  const role = resolvedRole(block.role, hasUserTurn);
  const messages = [{ role, content: '<history>' }];
  if (nonblank(summaryception)) {
    messages.push({
      role: 'system',
      content: `<summaryception>\n${summaryception}\n</summaryception>`,
    });
  }
  for (const message of Array.isArray(history) ? history : []) {
    if (message.native === true) {
      messages.push({ role: message.role, content: message.content });
      continue;
    }
    const name = message.name ? ` name="${escapeAttribute(message.name)}"` : '';
    messages.push({
      role: message.role,
      content: `<message${name}>\n${message.content}\n</message>`,
    });
  }
  messages.push({ role, content: '</history>' });
  return messages;
}

export function buildPlannerContextMessages({
  arrangement = DEFAULT_SETTINGS.planner.arrangements[0],
  presetPrompts,
  history,
  summaryception,
  plannerTemplate,
  substituteParams,
}) {
  const hasUserTurn = Array.isArray(history)
    && history.some((message) => message.native !== true && message.role === 'user');
  const expand = typeof substituteParams === 'function'
    ? substituteParams
    : (content) => content;
  const messages = [];
  const blocks = Array.isArray(arrangement?.blocks)
    ? [...arrangement.blocks].sort((left, right) => left.order - right.order)
    : [];
  for (const block of blocks) {
    if (block.enabled !== true && block.slot !== 'template') continue;
    if (block.kind === 'text') {
      messages.push({
        role: resolvedRole(block.role, hasUserTurn),
        content: expand(block.body),
      });
    } else if (block.slot === 'preset') {
      messages.push(...presetMessages(block, presetPrompts, hasUserTurn));
    } else if (block.slot === 'history') {
      messages.push(...historyMessages(block, history, summaryception, hasUserTurn));
    } else if (block.slot === 'template') {
      messages.push({
        role: resolvedRole(block.role, hasUserTurn),
        content: [
          '<planner_template>',
          String(plannerTemplate ?? ''),
          '</planner_template>',
        ].join('\n'),
      });
    }
  }
  return messages;
}
