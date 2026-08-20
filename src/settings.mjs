const CONNECTION_SOURCE = new Set(['profile', 'custom']);

const DEFAULT_STAGE = Object.freeze({
  source: 'profile',
  profileId: '',
  customUrl: '',
  secretId: '',
  model: '',
});

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  plannerPrompt: '',
  planner: DEFAULT_STAGE,
  response: DEFAULT_STAGE,
});

const stringValue = (value) => typeof value === 'string' ? value : '';

function normalizeStage(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};

  return {
    source: CONNECTION_SOURCE.has(source.source) ? source.source : 'profile',
    profileId: stringValue(source.profileId),
    customUrl: stringValue(source.customUrl).trim(),
    secretId: stringValue(source.secretId),
    model: stringValue(source.model).trim(),
  };
}

export function normalizeSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : false,
    plannerPrompt: stringValue(source.plannerPrompt),
    planner: normalizeStage(source.planner),
    response: normalizeStage(source.response),
  };
}
