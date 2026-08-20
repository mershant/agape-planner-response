export async function captureNormalResponseMessages(
  context,
  squashMessages,
  generationType = 'normal',
) {
  if (context.mainApi !== 'openai') {
    throw new Error('Planner Response currently supports Chat Completion only');
  }
  let captured = null;
  const capture = (eventData) => {
    if (eventData?.dryRun && Array.isArray(eventData.chat)) {
      captured = structuredClone(eventData.chat);
    }
  };

  context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY, capture);
  try {
    await context.generate(generationType, {}, true);
  } finally {
    context.eventSource.removeListener(context.eventTypes.CHAT_COMPLETION_PROMPT_READY, capture);
  }

  if (!captured) throw new Error('SillyTavern did not assemble a Chat Completion prompt');
  if (!context.chatCompletionSettings?.squash_system_messages) return captured;
  if (typeof squashMessages !== 'function') {
    throw new Error('SillyTavern system-message squashing is unavailable');
  }
  return squashMessages();
}
