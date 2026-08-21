import { balanceStreamingMarkdown } from './streaming-markdown.mjs';

const clone = (value) => structuredClone(value);

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

function setPlanningHeader(messageId, done) {
  const message = globalThis.document?.querySelector?.(`#chat .mes[mesid="${messageId}"]`);
  message?.classList?.add('agape-planning');
  const header = globalThis.document?.querySelector?.(
    `#chat .mes[mesid="${messageId}"] .mes_reasoning_header_title`,
  );
  const label = done ? 'Planning' : 'Planning...';
  if (header && header.textContent !== label) header.textContent = label;
}

function updateOperationTimer(messageId, startedAt, finishedAt) {
  const timer = globalThis.document?.querySelector?.(
    `#chat .mes[mesid="${messageId}"] .mes_timer`,
  );
  if (!timer) return;
  const seconds = Math.max(0, (Number(finishedAt) - Number(startedAt)) / 1000);
  timer.textContent = `${seconds.toFixed(1)}s`;
  timer.title = `Planner Response operation: ${seconds} seconds`;
}

export function refreshPlanningHeaders(context) {
  for (const [messageId, message] of context.chat.entries()) {
    if (message?.extra?.agapePlannerResponsePlanning === true) {
      setPlanningHeader(messageId, true);
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
  setInterval = globalThis.setInterval,
  clearInterval = globalThis.clearInterval,
}) {
  const startedAt = now();
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
    type: type === 'swipe' ? 'swipe' : 'normal',
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

  const { ReasoningHandler, ReasoningState, ReasoningType } = await loadReasoning();
  const handler = new ReasoningHandler(startedAt);
  handler.initHandleMessage(messageId, { reset: true });
  handler.state = ReasoningState.Thinking;
  handler.type = ReasoningType.Model;
  handler.startTime = startedAt;
  setPlanningHeader(messageId, false);
  handler.updateDom(messageId);
  setPlanningHeader(messageId, false);
  message.gen_started = startedAt;
  let firstPlanningAt = null;
  const timerInterval = setInterval(() => {
    if (context.chat[messageId]?.extra?.agapePlannerResponsePending === true) {
      updateOperationTimer(messageId, startedAt, now());
    }
  }, 100);
  timerInterval?.unref?.();

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
    if (value.trim() && firstPlanningAt === null) firstPlanningAt = now();
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
    current.extra.time_to_first_token = firstPlanningAt === null
      ? null
      : Math.max(0, Number(firstPlanningAt) - Number(startedAt));
    current.gen_started = startedAt;
    if (done) syncCurrentSwipe(current);
    handler.updateDom(messageId);
    setPlanningHeader(messageId, done);
  }

  async function finalizeVisibleText(text) {
    const current = ownedMessage();
    const finishedAt = now();
    clearInterval(timerInterval);
    current.mes = String(text ?? '');
    current.extra ??= {};
    delete current.extra.agapePlannerResponsePending;
    delete current.extra.agapePlannerResponsePhase;
    delete current.extra.agapePlannerResponseCandidateType;
    current.gen_started = startedAt;
    current.gen_finished = finishedAt;
    syncCurrentSwipe(current);
    context.updateMessageBlock?.(messageId, current);
    setPlanningHeader(messageId, true);
    updateOperationTimer(messageId, startedAt, finishedAt);
    await context.eventSource?.emit?.(
      context.eventTypes.MESSAGE_RECEIVED,
      messageId,
      type,
    );
    await context.eventSource?.emit?.(
      context.eventTypes.CHARACTER_MESSAGE_RENDERED,
      messageId,
      type,
    );
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
      const content = globalThis.document?.querySelector?.(
        `#chat .mes[mesid="${messageId}"] .mes_text`,
      );
      if (content) {
        const formatted = context.messageFormatting?.(
          balanceStreamingMarkdown(current.mes),
          current.name,
          current.is_system,
          current.is_user,
          messageId,
          {},
          false,
        );
        if (typeof formatted === 'string') content.innerHTML = formatted;
        else content.textContent = current.mes;
      }
      setPlanningHeader(messageId, true);
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
      clearInterval(timerInterval);
      const current = context.chat[messageId];
      if (messageId !== context.chat.length - 1 || current?.extra?.agapePlannerResponsePending !== true) return;
      const previousCandidate = previousSwipe ?? previousRegenerate;
      if (previousCandidate) {
        for (const key of Object.keys(current)) delete current[key];
        Object.assign(current, clone(previousCandidate));
        context.updateMessageBlock?.(messageId, current);
        await context.saveChat?.();
        return;
      }
      await context.deleteLastMessage();
      await context.saveChat?.();
    },
  };
}
