export function validateNativeUserTurn(runContext, pending, hostChat = null) {
  const terminalIndex = runContext.chat.length - 1;
  const terminalMessage = runContext.chat[terminalIndex];
  return Boolean(
    pending
    && pending.chatIdentity === (runContext.getCurrentChatId?.() ?? null)
    && pending.messageIndex === terminalIndex
    && pending.message === terminalMessage
    && terminalMessage?.is_user === true
    && typeof terminalMessage.mes === 'string'
    && terminalMessage.mes.trim()
    && (!Array.isArray(hostChat) || hostChat.at(-1)?.is_user === true)
  );
}

export function createRuntimeKernel({ contextProvider, runCandidate }) {
  let pendingUserTurn = null;
  let activeController = null;
  let latestRequest = 0;
  let runTail = Promise.resolve();
  let destroyed = false;

  const context = () => contextProvider();
  const chatIdentity = () => context().getCurrentChatId?.() ?? null;

  function captureUserTurn(messageIndex) {
    const runContext = context();
    const message = Number.isInteger(messageIndex) ? runContext.chat?.[messageIndex] : null;
    pendingUserTurn = message?.is_user === true
      ? { chatIdentity: chatIdentity(), messageIndex, message }
      : null;
  }

  function consumeUserTurn(hostChat) {
    const runContext = context();
    const pending = pendingUserTurn;
    pendingUserTurn = null;
    return validateNativeUserTurn(runContext, pending, hostChat) ? pending : null;
  }

  function cancel(reason) {
    latestRequest += 1;
    pendingUserTurn = null;
    activeController?.abort(reason);
  }

  function enqueue(options) {
    const requestId = ++latestRequest;
    activeController?.abort('interrupted');
    const previous = runTail;
    const scheduled = (async () => {
      await previous;
      if (destroyed || requestId !== latestRequest) return { stopped: true, interrupted: true };
      const controller = new AbortController();
      activeController = controller;
      try {
        return await runCandidate({ ...options, signal: controller.signal });
      } finally {
        if (activeController === controller) activeController = null;
      }
    })();
    runTail = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }

  return {
    captureUserTurn,
    consumeUserTurn,
    enqueue,
    stop: () => cancel('cancelled'),
    chatChanged: () => cancel('interrupted'),
    isBusy: () => activeController !== null,
    destroy() {
      destroyed = true;
      cancel('interrupted');
    },
  };
}
