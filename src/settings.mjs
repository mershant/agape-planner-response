const CONNECTION_SOURCE = new Set(['profile', 'custom']);
export const BLOCK_ROLES = Object.freeze(['system', 'user', 'assistant', 'auto']);
const BLOCK_ROLE_SET = new Set(BLOCK_ROLES);
const SLOT_NAMES = new Set(['preset', 'history', 'template']);

const TASK_BODY = `<task>
Fill the supplied Planner template for the next roleplay response. Use the conversation history and any relevant facts or constraints from the preset reference. The template is a form to complete, not a command to perform another hidden process. Its wording about internal processing and a final response describes how the later Response model will use this Planning document. Fill the form directly. Your output is the filled Planner template itself. Preserve every phase, gate, and requested item in order. Fill each item with concrete conclusions for this scene. Do not copy the questions, explain your work outside the template, or write the roleplay response.
</task>`;

const START_BODY = `Begin Planning now. Start immediately with the Planner template's first section. Preserve its complete structure and fill it sequentially. Output only the completed Planning document.`;

const DEFAULT_STAGE = {
  source: 'profile',
  profileId: '',
  customUrl: '',
  secretId: '',
  model: '',
};

function defaultArrangement({
  presetEnabled = false,
  historyMode = 'full',
  historyDepth = 5,
  includeSummaryception = true,
} = {}) {
  return {
    name: 'Default',
    blocks: [
      { id: 'preset', kind: 'slot', slot: 'preset', name: 'Preset', enabled: presetEnabled, order: 0, role: 'system' },
      {
        id: 'history',
        kind: 'slot',
        slot: 'history',
        name: 'History',
        enabled: true,
        order: 1,
        role: 'system',
        historyMode,
        historyDepth,
        includeSummaryception,
      },
      { id: 'task', kind: 'text', name: 'Task', enabled: true, order: 2, role: 'system', body: TASK_BODY },
      { id: 'template', kind: 'slot', slot: 'template', name: 'Planner template', enabled: true, order: 3, role: 'system' },
      { id: 'start-command', kind: 'text', name: 'Start command', enabled: true, order: 4, role: 'auto', body: START_BODY },
    ],
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const DEFAULT_SETTINGS = deepFreeze({
  enabled: false,
  plannerPrompt: '',
  planner: {
    ...DEFAULT_STAGE,
    activeArrangement: 'Default',
    arrangements: [defaultArrangement()],
  },
  response: { ...DEFAULT_STAGE },
});

const stringValue = (value) => typeof value === 'string' ? value : '';
const objectValue = (value) => value && typeof value === 'object' && !Array.isArray(value)
  ? value
  : {};

function normalizeDepth(value) {
  const depth = Number(value);
  return Number.isFinite(depth)
    ? Math.min(100, Math.max(0, Math.trunc(depth)))
    : 5;
}

function normalizeHistoryOptions(source) {
  const historyMode = source.historyMode === 'depth' ? 'depth' : 'full';
  return {
    historyMode,
    historyDepth: normalizeDepth(source.historyDepth),
    includeSummaryception: historyMode === 'full'
      && (typeof source.includeSummaryception === 'boolean'
        ? source.includeSummaryception
        : true),
  };
}

function normalizeStage(value) {
  const source = objectValue(value);
  return {
    source: CONNECTION_SOURCE.has(source.source) ? source.source : 'profile',
    profileId: stringValue(source.profileId),
    customUrl: stringValue(source.customUrl).trim(),
    secretId: stringValue(source.secretId),
    model: stringValue(source.model).trim(),
  };
}

function normalizeBlock(value, fallbackId) {
  const source = objectValue(value);
  const name = stringValue(source.name).trim();
  const validCommon = name
    && typeof source.enabled === 'boolean'
    && Number.isInteger(source.order)
    && source.order >= 0
    && BLOCK_ROLE_SET.has(source.role);
  if (!validCommon) return null;

  const common = {
    id: stringValue(source.id).trim() || fallbackId,
    kind: source.kind,
    name,
    enabled: source.enabled,
    order: source.order,
    role: source.role,
  };

  if (source.kind === 'text') {
    if (typeof source.body !== 'string') return null;
    return { ...common, body: source.body };
  }

  if (source.kind !== 'slot' || !SLOT_NAMES.has(source.slot)) return null;
  if (source.slot === 'template' && !source.enabled) return null;
  const block = { ...common, slot: source.slot };
  if (source.slot === 'history') Object.assign(block, normalizeHistoryOptions(source));
  return block;
}

function normalizeArrangement(value) {
  const source = objectValue(value);
  const name = stringValue(source.name).trim();
  if (!name || !Array.isArray(source.blocks)) return null;

  const blocks = source.blocks.map((block, index) => normalizeBlock(
    block,
    block?.kind === 'slot' && SLOT_NAMES.has(block.slot)
      ? block.slot
      : `text-${index + 1}`,
  ));
  if (blocks.some((block) => block === null)) return null;
  if (new Set(blocks.map(({ id }) => id)).size !== blocks.length) return null;
  const slotNames = blocks
    .filter((block) => block.kind === 'slot')
    .map((block) => block.slot);
  if (slotNames.filter((slot) => slot === 'template').length !== 1) return null;
  if (new Set(slotNames).size !== slotNames.length) return null;

  blocks.sort((left, right) => left.order - right.order);
  blocks.forEach((block, order) => { block.order = order; });
  return { name, blocks };
}

function migratedArrangements(source) {
  const history = normalizeHistoryOptions(source);
  return [defaultArrangement({
    presetEnabled: source.contextMode === 'preset',
    ...history,
  })];
}

function normalizeArrangements(source) {
  const hasStoredArrangements = Object.hasOwn(source, 'arrangements');
  if (!hasStoredArrangements) return migratedArrangements(source);
  if (!Array.isArray(source.arrangements) || source.arrangements.length === 0) {
    return [defaultArrangement()];
  }

  const arrangements = source.arrangements.map(normalizeArrangement);
  const names = arrangements.filter(Boolean).map(({ name }) => name);
  if (arrangements.some((arrangement) => arrangement === null)
    || new Set(names).size !== names.length) {
    return [defaultArrangement()];
  }
  if (!names.includes('Default')) arrangements.push(defaultArrangement());
  return arrangements;
}

function normalizePlanner(value) {
  const source = objectValue(value);
  const arrangements = normalizeArrangements(source);
  const requestedActive = stringValue(source.activeArrangement);
  return {
    ...normalizeStage(source),
    activeArrangement: arrangements.some(({ name }) => name === requestedActive)
      ? requestedActive
      : 'Default',
    arrangements,
  };
}

export function getActiveArrangement(planner) {
  const source = objectValue(planner);
  return source.arrangements?.find(({ name }) => name === source.activeArrangement)
    ?? source.arrangements?.find(({ name }) => name === 'Default');
}

export function getArrangementSlot(arrangement, slot) {
  return arrangement?.blocks?.find((block) => block.kind === 'slot' && block.slot === slot);
}

export function getActivePlannerContext(planner) {
  const arrangement = getActiveArrangement(planner);
  const preset = getArrangementSlot(arrangement, 'preset');
  const history = getArrangementSlot(arrangement, 'history');
  return {
    contextMode: preset?.enabled ? 'preset' : 'minimal',
    historyMode: history?.historyMode ?? 'full',
    historyDepth: history?.historyDepth ?? 5,
    includeSummaryception: history?.includeSummaryception ?? false,
  };
}

export function normalizeSettings(value) {
  const source = objectValue(value);
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : false,
    plannerPrompt: stringValue(source.plannerPrompt),
    planner: normalizePlanner(source.planner),
    response: normalizeStage(source.response),
  };
}
