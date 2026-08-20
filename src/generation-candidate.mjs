export const PLANNED_GENERATION_TYPES = Object.freeze(['normal', 'swipe', 'regenerate']);

export function isPlannedGeneration(type) {
  return PLANNED_GENERATION_TYPES.includes(type);
}

export function historyForGeneration(chat, type) {
  const messages = Array.isArray(chat) ? chat : [];
  const last = messages.at(-1);
  return ['swipe', 'regenerate'].includes(type) && last?.is_user === false
    ? messages.slice(0, -1)
    : messages.slice();
}
