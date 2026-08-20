import { buildPlannerContextMessage } from './planner-context.mjs';

export function requireVisibleText(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Model returned blank visible content');
  }
  return value;
}

export function buildPlannerMessages(prompt, substituteParams, plannerContext = {}) {
  if (typeof substituteParams !== 'function') {
    throw new TypeError('SillyTavern substituteParams is required');
  }
  const expanded = substituteParams(String(prompt ?? ''));
  return [buildPlannerContextMessage({
    ...plannerContext,
    plannerTemplate: requireVisibleText(expanded),
  })];
}

export function appendPlanningToResponse(messages, planning) {
  if (!Array.isArray(messages)) {
    throw new TypeError('Normal SillyTavern Response messages are required');
  }
  return [
    ...structuredClone(messages),
    { role: 'system', content: requireVisibleText(planning) },
  ];
}
