export async function saveCustomSecret({
  secretKey,
  getSecretState,
  value,
  label,
  writeSecret,
  rotateSecret,
}) {
  const secretState = getSecretState();
  const previousId = Array.isArray(secretState[secretKey])
    ? secretState[secretKey].find((item) => item.active)?.id
    : null;
  const id = await writeSecret(secretKey, value, label);
  if (id && previousId) {
    await rotateSecret(secretKey, previousId);
    const restoredState = getSecretState();
    const restored = Array.isArray(restoredState[secretKey])
      && restoredState[secretKey].some((item) => item.id === previousId && item.active);
    if (!restored) {
      await rotateSecret(secretKey, previousId);
      const retriedState = getSecretState();
      const retried = Array.isArray(retriedState[secretKey])
        && retriedState[secretKey].some((item) => item.id === previousId && item.active);
      if (!retried) throw new Error('SillyTavern did not restore the previously active Custom API key');
    }
  }
  return id;
}
