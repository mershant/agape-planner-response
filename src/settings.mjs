const CONNECTION_SOURCE = new Set(['profile', 'custom']);

const DEFAULT_STAGE = Object.freeze({
  source: 'profile',
  profileId: '',
  customUrl: '',
  secretId: '',
  model: '',
});

const DEFAULT_PLANNER = Object.freeze({
  ...DEFAULT_STAGE,
  contextMode: 'minimal',
  historyMode: 'full',
  historyDepth: 5,
  includeSummaryception: true,
});

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  plannerPrompt: '',
  planner: DEFAULT_PLANNER,
  response: DEFAULT_STAGE,
});

const stringValue = (value) => typeof value === 'string' ? value : '';

function normalizeStage(value, planner = false) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};

  const normalized = {
    source: CONNECTION_SOURCE.has(source.source) ? source.source : 'profile',
    profileId: stringValue(source.profileId),
    customUrl: stringValue(source.customUrl).trim(),
    secretId: stringValue(source.secretId),
    model: stringValue(source.model).trim(),
  };
  if (!planner) return normalized;

  normalized.contextMode = source.contextMode === 'preset' ? 'preset' : 'minimal';
  normalized.historyMode = source.historyMode === 'depth' ? 'depth' : 'full';
  const depth = Number(source.historyDepth);
  normalized.historyDepth = Number.isFinite(depth)
    ? Math.min(100, Math.max(0, Math.trunc(depth)))
    : DEFAULT_PLANNER.historyDepth;
  normalized.includeSummaryception = normalized.historyMode === 'full'
    && (typeof source.includeSummaryception === 'boolean'
      ? source.includeSummaryception
      : DEFAULT_PLANNER.includeSummaryception);
  return normalized;
}

export function normalizeSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : false,
    plannerPrompt: stringValue(source.plannerPrompt),
    planner: normalizeStage(source.planner, true),
    response: normalizeStage(source.response),
  };
}
