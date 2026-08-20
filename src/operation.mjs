import {
  appendPlanningToResponse,
  buildPlannerMessages,
  requireVisibleText,
} from './contracts.mjs';

export async function runPlannerResponse({
  settings,
  substituteParams,
  createMessage,
  requestPlanner,
  captureResponseMessages,
  requestResponse,
  cleanResponse,
  signal,
}) {
  const plannerMessages = buildPlannerMessages(settings.plannerPrompt, substituteParams);
  const normalMessages = await captureResponseMessages(settings.response, signal);
  signal?.throwIfAborted?.();
  const nativeMessage = await createMessage();
  let planningComplete = false;
  let planningText = '';
  let responseText = '';

  try {
    await nativeMessage.setPlanning('');
    const planning = await requestPlanner({
      stage: settings.planner,
      messages: plannerMessages,
      signal,
      onText: async (text) => {
        planningText = text;
        await nativeMessage.setPlanning(text);
      },
    });
    planningText = requireVisibleText(planning);
    await nativeMessage.completePlanning(planningText);
    planningComplete = true;

    const responseMessages = appendPlanningToResponse(normalMessages, planningText);
    const response = await requestResponse({
      stage: settings.response,
      messages: responseMessages,
      signal,
      onText: async (text) => {
        responseText = cleanResponse(text, false);
        await nativeMessage.setResponse(responseText);
      },
    });
    responseText = requireVisibleText(cleanResponse(response, true));
    await nativeMessage.commitResponse(responseText);
    return { planning: planningText, response: responseText, stopped: false };
  } catch (error) {
    if (!planningComplete) {
      await nativeMessage.rollback();
      if (signal?.aborted) {
        return { planning: '', response: '', stopped: true };
      }
      throw error;
    }
    if (signal?.aborted) {
      await nativeMessage.commitStoppedResponse?.(responseText);
      return { planning: planningText, response: responseText, stopped: true };
    }
    await nativeMessage.failResponse('Response failed.');
    throw error;
  }
}
