import { buildPlannerContextMessages } from './planner-context.mjs';

export function requireVisibleText(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Model returned blank visible content');
  }
  return value;
}

export function buildPlannerMessages(prompt, substituteParams, plannerContext = {}) {
  return buildPlannerRequest(prompt, substituteParams, plannerContext).messages;
}

export function buildPlannerRequest(prompt, substituteParams, plannerContext = {}) {
  if (typeof substituteParams !== 'function') {
    throw new TypeError('SillyTavern substituteParams is required');
  }
  const expanded = substituteParams(String(prompt ?? ''));
  const expandedTemplate = requireVisibleText(expanded);
  return {
    expandedTemplate,
    messages: buildPlannerContextMessages({
      ...plannerContext,
      plannerTemplate: expandedTemplate,
    }),
  };
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
