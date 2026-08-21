const clone = (value) => structuredClone(value);

function restoreObject(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, clone(source));
}

function previousSwipeSnapshot(message) {
  const snapshot = clone(message);
  if (!Array.isArray(snapshot.swipes) || snapshot.swipes.length === 0) return snapshot;
  const swipeId = Math.min(
    Math.max(0, Number(snapshot.swipe_id) - 1),
    snapshot.swipes.length - 1,
  );
  snapshot.swipe_id = swipeId;
  snapshot.mes = snapshot.swipes[swipeId];
  const info = snapshot.swipe_info?.[swipeId];
  if (info) {
    snapshot.extra = clone(info.extra ?? {});
    snapshot.send_date = info.send_date;
    snapshot.gen_started = info.gen_started;
    snapshot.gen_finished = info.gen_finished;
  }
  return snapshot;
}

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

function markPlanningMessage(messageId) {
  globalThis.document?.querySelector?.(`#chat .mes[mesid="${messageId}"]`)?.classList?.add('agape-planning');
}

function currentChatIdentity(context) {
  return context.getCurrentChatId?.() ?? null;
}

export function refreshPlanningHeaders(context) {
  for (const [messageId, message] of context.chat.entries()) {
    if (message?.extra?.agapePlannerResponsePlanning === true) {
      markPlanningMessage(messageId);
    }
  }
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
  if (last.extra.agapePlannerResponseCandidateType === 'swipe') {
    if (!Array.isArray(last.swipes) || last.swipes.length < 2) return false;
    const pendingId = Number(last.swipe_id);
    if (!Number.isInteger(pendingId) || pendingId < 0 || pendingId >= last.swipes.length) return false;
    last.swipes.splice(pendingId, 1);
    last.swipe_info?.splice?.(pendingId, 1);
    const restoredId = Math.max(0, Math.min(pendingId - 1, last.swipes.length - 1));
    last.swipe_id = restoredId;
    last.mes = last.swipes[restoredId];
    const info = last.swipe_info?.[restoredId];
    if (info) last.extra = clone(info.extra ?? {});
    context.updateMessageBlock?.(context.chat.length - 1, last);
    await context.saveChat?.();
    return 'swipe-removed';
  }
  await context.deleteLastMessage();
  await context.saveChat?.();
  return 'planning-removed';
}

export async function createNativeMessage({
  context,
  type = 'normal',
  previousCandidate = null,
  loadReasoning = () => import('/scripts/reasoning.js'),
  now = () => new Date(),
}) {
  const chatIdentity = currentChatIdentity(context);
  const startedAt = new Date(now());
  const previousSwipe = type === 'swipe' && context.chat.at(-1)?.is_user === false
    ? previousSwipeSnapshot(context.chat.at(-1))
    : null;
  const previousRegenerate = type === 'regenerate'
    ? clone(previousCandidate ?? (context.chat.at(-1)?.is_user === false ? context.chat.at(-1) : null))
    : null;
  if (previousRegenerate && context.chat.at(-1)?.is_user === false) {
    await context.deleteLastMessage();
  }
  await context.saveReply({
    type,
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
  message.extra.agapePlannerResponseCandidateType = type;
  message.extra.type = 'agape-planning';
  message.gen_started = startedAt;

  let planningText = '';
  let firstPlanningAt = null;
  let rolledBack = false;
  let handler = null;
  let ReasoningState = null;
  let ReasoningType = null;

  function ownedMessage() {
    if (rolledBack) {
      throw new Error('The active assistant message is no longer owned by Planner Response');
    }
    if (currentChatIdentity(context) !== chatIdentity) {
      throw new Error('The active assistant message is no longer owned by Planner Response');
    }
    if (messageId !== context.chat.length - 1) {
      throw new Error('The active assistant message is no longer owned by Planner Response');
    }
    const current = context.chat[messageId];
    if (!current || current.is_user || current.extra?.agapePlannerResponsePending !== true) {
      throw new Error('The active assistant message is no longer owned by Planner Response');
    }
    current.extra ??= {};
    return current;
  }

  function firstTokenMs() {
    return firstPlanningAt === null
      ? null
      : Math.max(0, Number(firstPlanningAt) - Number(startedAt));
  }

  function persistPlanning(text) {
    const current = ownedMessage();
    const value = String(text ?? '');
    planningText = value;
    if (value.trim() && firstPlanningAt === null) firstPlanningAt = now();
    handler.state = ReasoningState.Thinking;
    handler.type = ReasoningType?.Model ?? 'model';
    handler.updateReasoning(messageId, value, { persist: true, allowReset: true });
    current.extra.reasoning = value;
    current.extra.time_to_first_token = firstTokenMs();
    current.gen_started = startedAt;
    handler.updateDom(messageId);
    markPlanningMessage(messageId);
  }

  async function rollbackOwned() {
    if (rolledBack) return;
    rolledBack = true;
    if (currentChatIdentity(context) !== chatIdentity) return;
    if (messageId !== context.chat.length - 1) return;
    const current = context.chat[messageId];
    if (current?.extra?.agapePlannerResponsePending !== true) return;
    if (current.extra.agapePlannerResponsePhase === 'response') return;
    const previous = previousSwipe ?? previousRegenerate;
    if (previous) {
      restoreObject(current, previous);
      context.updateMessageBlock?.(messageId, current);
      await context.saveChat?.();
      return;
    }
    await context.deleteLastMessage();
    await context.saveChat?.();
  }

  async function commitFinal(text) {
    ownedMessage();
    const finishedAt = new Date(now());
    const value = String(text ?? '');
    await context.saveReply({
      type: 'appendFinal',
      getMessage: value,
      reasoning: '',
    });
    const committed = ownedMessage();
    committed.mes = value;
    committed.extra.reasoning = planningText;
    committed.gen_started = startedAt;
    committed.gen_finished = finishedAt;
    committed.extra.time_to_first_token = firstTokenMs();
    delete committed.extra.agapePlannerResponsePending;
    delete committed.extra.agapePlannerResponsePhase;
    delete committed.extra.agapePlannerResponseCandidateType;
    syncCurrentSwipe(committed);
    context.addOneMessage?.(committed, {
      type: 'swipe',
      forceId: messageId,
      scroll: false,
      showSwipes: true,
    });
    markPlanningMessage(messageId);
    await context.saveChat?.();
  }

  try {
    const reasoningModule = await loadReasoning();
    const ReasoningHandler = reasoningModule?.ReasoningHandler;
    ReasoningState = reasoningModule?.ReasoningState;
    ReasoningType = reasoningModule?.ReasoningType;
    if (typeof ReasoningHandler !== 'function' || !ReasoningState) {
      throw new Error('SillyTavern native ReasoningHandler is unavailable');
    }
    handler = new ReasoningHandler(startedAt);
    handler.initHandleMessage(messageId, { reset: true });
    handler.state = ReasoningState.Thinking;
    handler.type = ReasoningType?.Model ?? 'model';
    handler.startTime = startedAt;
    handler.endTime = null;
    handler.updateDom(messageId);
    markPlanningMessage(messageId);
    await context.saveChat?.();
  } catch (error) {
    await rollbackOwned();
    throw error;
  }

  return {
    messageId,

    async setPlanning(text) {
      persistPlanning(text);
    },

    async completePlanning(text, metrics = null) {
      persistPlanning(text);
      handler.endTime = new Date(now());
      await handler.finish(messageId);
      const current = ownedMessage();
      current.extra.reasoning = planningText;
      current.extra.agapePlannerResponsePhase = 'response';
      current.extra.reasoning_duration = handler.getDuration?.()
        ?? Math.max(0, Number(now()) - Number(startedAt));
      current.extra.time_to_first_token = firstTokenMs();
      current.extra.agapePlannerResponseMetrics = {
        ...(current.extra.agapePlannerResponseMetrics ?? {}),
        planner: metrics && typeof metrics === 'object'
          ? {
            firstDeltaMs: Number.isFinite(metrics.firstDeltaMs) ? metrics.firstDeltaMs : null,
            totalMs: Number.isFinite(metrics.totalMs) ? metrics.totalMs : null,
          }
          : null,
      };
      syncCurrentSwipe(current);
      markPlanningMessage(messageId);
      await context.saveChat?.();
    },

    async setResponse(text) {
      const current = ownedMessage();
      current.mes = String(text ?? '');
      current.gen_started = startedAt;
      current.gen_finished = new Date(now());
      syncCurrentSwipe(current);
      context.updateMessageBlock?.(messageId, current);
      markPlanningMessage(messageId);
    },

    async withoutCandidate(callback) {
      const current = ownedMessage();
      const previous = current.is_system;
      current.is_system = true;
      try {
        return await callback();
      } finally {
        if (previous === undefined) delete current.is_system;
        else current.is_system = previous;
      }
    },

    async commitResponse(text, metrics = null) {
      const current = ownedMessage();
      current.extra.agapePlannerResponseMetrics = {
        ...(current.extra.agapePlannerResponseMetrics ?? {}),
        response: metrics && typeof metrics === 'object'
          ? {
            firstDeltaMs: Number.isFinite(metrics.firstDeltaMs) ? metrics.firstDeltaMs : null,
            totalMs: Number.isFinite(metrics.totalMs) ? metrics.totalMs : null,
          }
          : null,
      };
      await commitFinal(text);
    },

    async commitStoppedResponse(text) {
      await commitFinal(text);
    },

    async commitInterruptedResponse(text) {
      try {
        await commitFinal(String(text ?? '').trim() ? text : 'Response failed.');
        return true;
      } catch {
        return false;
      }
    },

    async failResponse(text) {
      await commitFinal(text);
    },

    async rollback() {
      await rollbackOwned();
    },
  };
}
