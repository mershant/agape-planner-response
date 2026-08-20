export function clonePromptCollection(value) {
  if (Array.isArray(value)) return value.map(clonePromptCollection);
  if (!value || typeof value !== 'object') return value;

  const clone = Object.create(Object.getPrototypeOf(value));
  for (const key of Reflect.ownKeys(value)) {
    clone[key] = clonePromptCollection(value[key]);
  }
  return clone;
}
