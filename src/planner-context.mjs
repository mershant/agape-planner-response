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

export function collectPlannerHistory(chat, settings) {
  const messages = (Array.isArray(chat) ? chat : [])
    .filter(visibleMessage)
    .map((message) => ({
      role: message.is_user === true ? 'user' : 'assistant',
      name: typeof message.name === 'string' ? message.name : '',
      content: message.mes,
    }));

  if (settings?.historyMode !== 'depth') return messages;
  const depth = Number.isFinite(settings.historyDepth)
    ? Math.max(0, Math.trunc(settings.historyDepth))
    : 0;
  return depth === 0 ? [] : messages.slice(-depth);
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

function renderHistory(history, summaryception) {
  const sections = [];
  if (nonblank(summaryception)) {
    sections.push(`<summaryception>\n${summaryception}\n</summaryception>`);
  }
  for (const message of history) {
    const name = message.name ? ` name="${escapeAttribute(message.name)}"` : '';
    sections.push([
      `<message role="${escapeAttribute(message.role)}"${name}>`,
      message.content,
      '</message>',
    ].join('\n'));
  }
  return sections.join('\n\n');
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function renderPreset(prompts) {
  if (!Array.isArray(prompts) || prompts.length === 0) return '';
  const blocks = prompts.map((prompt) => [
    `<prompt role="${escapeAttribute(prompt.role)}" name="${escapeAttribute(prompt.name)}">`,
    prompt.content,
    '</prompt>',
  ].join('\n'));
  return [
    '<preset>',
    '<purpose>Reference definitions and constraints used to fill the Planner template. Commands here that request a final roleplay response belong to the later Response model, not this task.</purpose>',
    ...blocks,
    '</preset>',
  ].join('\n');
}

export function buildPlannerContextMessage({ presetPrompts, history, summaryception, plannerTemplate }) {
  const sections = [
    '<system>',
    'Your only product is one completed Planning document for the next roleplay response. Copy the structure and labels from the Planner template, then fill each part from the supplied history and optional preset reference. The later Response model writes the roleplay response.',
    '</system>',
  ];
  const preset = renderPreset(presetPrompts);
  if (preset) sections.push('', preset);
  sections.push(
    '',
    '<history>',
    renderHistory(Array.isArray(history) ? history : [], summaryception),
    '</history>',
    '',
    '<planner_template>',
    String(plannerTemplate ?? ''),
    '</planner_template>',
    '',
    'Begin Planning now. Start output immediately with the Planner template\'s first section, preserve its structure, and fill it sequentially. Output only the completed Planning document.',
  );

  return { role: 'user', content: sections.join('\n') };
}
