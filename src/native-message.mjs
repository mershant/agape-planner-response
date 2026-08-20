const clone = (value) => structuredClone(value);

function syncCurrentSwipe(message) {
  const swipeId = message?.swipe_id;
  if (!Number.isInteger(swipeId) || swipeId < 0) return;
  if (!Array.isArray(message.swipes) || !Array.isArray(message.swipe_info)) return;
  if (!message.swipe_info[swipeId]) return;
  message.swipes[swipeId] = message.mes;
  message.swipe_info[swipeId] = {
    send_date: message.send_date,
    gen_started: message.gen_started,
    gen_finished: message.gen_finished,
    extra: clone(message.extra ?? {}),
  };
}

function setPlanningHeader(messageId, done) {
  const header = globalThis.document?.querySelector?.(
    `#chat .mes[mesid="${messageId}"] .mes_reasoning_header_title`,
  );
  const label = done ? 'Planning' : 'Planning...';
  if (header && header.textContent !== label) header.textContent = label;
}

export function refreshPlanningHeaders(context) {
  for (const [messageId, message] of context.chat.entries()) {
    if (message?.extra?.agapePlannerResponsePlanning === true) {
      setPlanningHeader(messageId, true);
    }
  }
}

export function installPlanningHeaderObserver(context) {
  const chat = globalThis.document?.querySelector?.('#chat');
  if (!chat || typeof globalThis.MutationObserver !== 'function') return null;
  if (chat.__agapePlanningObserver) return chat.__agapePlanningObserver;

  const observer = new globalThis.MutationObserver((mutations) => {
    const messageIds = new Set();
    const addMessage = (node) => {
      const element = node?.nodeType === 1 ? node : node?.parentElement;
      const message = element?.closest?.('.mes');
      const messageId = Number(message?.getAttribute?.('mesid'));
      if (Number.isInteger(messageId)) messageIds.add(messageId);
      for (const nested of element?.querySelectorAll?.('.mes[mesid]') ?? []) {
        const nestedId = Number(nested.getAttribute('mesid'));
        if (Number.isInteger(nestedId)) messageIds.add(nestedId);
      }
    };
    for (const mutation of mutations) {
      addMessage(mutation.target);
      for (const node of mutation.addedNodes ?? []) addMessage(node);
    }
    for (const messageId of messageIds) {
      if (context.chat[messageId]?.extra?.agapePlannerResponsePlanning === true) {
        setPlanningHeader(messageId, true);
      }
    }
  });
  observer.observe(chat, { childList: true, subtree: true, characterData: true });
  chat.__agapePlanningObserver = observer;
  return observer;
}

export async function recoverStalePendingMessage(context) {
  const last = context.chat.at(-1);
  if (last?.is_user !== false || last.extra?.agapePlannerResponsePending !== true) return false;
  if (last.extra.agapePlannerResponsePhase === 'response' && last.extra.reasoning?.trim()) {
    last.mes = 'Response failed.';
    delete last.extra.agapePlannerResponsePending;
    delete last.extra.agapePlannerResponsePhase;
    syncCurrentSwipe(last);
    context.updateMessageBlock?.(context.chat.length - 1, last);
    await context.saveChat?.();
    return 'response-failed';
  }
  await context.deleteLastMessage();
  await context.saveChat?.();
  return 'planning-removed';
}

export async function createNativeMessage({
  context,
  loadReasoning = () => import('/scripts/reasoning.js'),
  now = () => new Date(),
}) {
  const startedAt = now();
  await context.saveReply({
    type: 'normal',
    getMessage: '...',
    fromStreaming: true,
    reasoning: '',
  });

  const messageId = context.chat.length - 1;
  const message = context.chat[messageId];
  if (!message || message.is_user) {
    throw new Error('SillyTavern did not create the assistant message');
  }
  message.extra ??= {};
  message.extra.agapePlannerResponsePending = true;
  message.extra.agapePlannerResponsePhase = 'planning';
  message.extra.agapePlannerResponsePlanning = true;

  const { ReasoningHandler, ReasoningState, ReasoningType } = await loadReasoning();
  const handler = new ReasoningHandler(startedAt);
  handler.initHandleMessage(messageId, { reset: true });
  handler.state = ReasoningState.Thinking;
  handler.type = ReasoningType.Model;
  handler.startTime = startedAt;
  handler.updateDom(messageId);

  function ownedMessage() {
    const current = context.chat[messageId];
    if (!current || current.is_user || current.extra?.agapePlannerResponsePending !== true) {
      throw new Error('The active assistant message is no longer owned by Planner Response');
    }
    current.extra ??= {};
    return current;
  }

  function persistPlanning(text, done) {
    const current = ownedMessage();
    const value = String(text ?? '');
    const endedAt = done ? now() : null;
    handler.reasoning = value;
    handler.state = done ? ReasoningState.Done : ReasoningState.Thinking;
    handler.type = ReasoningType.Model;
    handler.endTime = endedAt;
    current.extra.reasoning = value;
    current.extra.reasoning_type = ReasoningType.Model;
    current.extra.reasoning_duration = Math.max(
      0,
      Number(endedAt ?? now()) - Number(startedAt),
    );
    syncCurrentSwipe(current);
    handler.updateDom(messageId);
    setPlanningHeader(messageId, done);
  }

  async function finalizeVisibleText(text) {
    const current = ownedMessage();
    await context.saveReply({
      type: 'appendFinal',
      getMessage: String(text ?? ''),
      reasoning: '',
    });
    const finalized = context.chat[messageId];
    finalized.extra ??= {};
    delete finalized.extra.agapePlannerResponsePending;
    delete finalized.extra.agapePlannerResponsePhase;
    syncCurrentSwipe(finalized);
    setPlanningHeader(messageId, true);
    await context.saveChat?.();
  }

  return {
    messageId,

    async setPlanning(text) {
      persistPlanning(text, false);
    },

    async completePlanning(text) {
      persistPlanning(text, true);
      ownedMessage().extra.agapePlannerResponsePhase = 'response';
      await context.eventSource?.emit?.(
        context.eventTypes.STREAM_REASONING_DONE,
        String(text),
        ownedMessage().extra.reasoning_duration,
        messageId,
        ReasoningState.Done,
      );
      await context.saveChat?.();
    },

    async setResponse(text) {
      const current = ownedMessage();
      current.mes = String(text ?? '');
      current.gen_finished = now();
      syncCurrentSwipe(current);
      context.updateMessageBlock?.(messageId, current);
      setPlanningHeader(messageId, true);
    },

    async commitResponse(text) {
      await finalizeVisibleText(text);
    },

    async commitStoppedResponse(text) {
      await finalizeVisibleText(text);
    },

    async failResponse(text) {
      await finalizeVisibleText(text);
    },

    async rollback() {
      const current = context.chat[messageId];
      if (messageId !== context.chat.length - 1
        || current?.extra?.agapePlannerResponsePending !== true) return;
      await context.deleteLastMessage();
      await context.saveChat?.();
    },
  };
}
