export function createThrottledUpdater(update, {
  waitMs = 50,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  let timer = null;
  let latest;
  let hasLatest = false;
  let running = Promise.resolve();

  const applyLatest = async () => {
    timer = null;
    if (!hasLatest) return;
    const value = latest;
    hasLatest = false;
    running = running.then(() => update(value));
    await running;
    if (hasLatest && timer === null) timer = setTimer(applyLatest, waitMs);
  };

  return {
    schedule(value) {
      latest = value;
      hasLatest = true;
      if (timer === null) timer = setTimer(applyLatest, waitMs);
    },

    async flush(value) {
      if (arguments.length > 0) {
        latest = value;
        hasLatest = true;
      }
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      await applyLatest();
      await running;
    },

    async cancel() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      hasLatest = false;
      await running;
    },
  };
}
