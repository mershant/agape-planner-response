import {
  appendPlanningToResponse,
  buildPlannerRequest,
  requireVisibleText,
} from './contracts.mjs';
import { createThrottledUpdater } from './throttled-updater.mjs';

export async function runPlannerResponse({
  settings,
  substituteParams,
  collectPlannerContext = async () => ({}),
  createMessage,
  requestPlanner,
  captureResponseMessages,
  requestResponse,
  cleanResponse,
  signal,
  updateIntervalMs = 50,
}) {
  let plannerRequest;
  try {
    const plannerContext = await collectPlannerContext(settings.planner);
    plannerRequest = buildPlannerRequest(
      settings.plannerPrompt,
      substituteParams,
      plannerContext,
    );
    signal?.throwIfAborted?.();
  } catch (error) {
    if (signal?.aborted) return { planning: '', response: '', stopped: true };
    throw error;
  }
  const nativeMessage = await createMessage();
  const planningUpdates = createThrottledUpdater(
    (text) => nativeMessage.setPlanning(text),
    { waitMs: updateIntervalMs },
  );
  const responseUpdates = createThrottledUpdater(
    (text) => nativeMessage.setResponse(text),
    { waitMs: updateIntervalMs },
  );
  let planningComplete = false;
  let planningText = '';
  let responseText = '';

  try {
    await nativeMessage.setPlanning('');
    const planningResult = await requestPlanner({
      stage: settings.planner,
      messages: plannerRequest.messages,
      signal,
      onText: (text) => {
        planningText = text;
        planningUpdates.schedule(text);
      },
    });
    const planning = typeof planningResult === 'string'
      ? planningResult
      : planningResult?.text;
    planningText = requireVisibleText(planning);
    await planningUpdates.flush(planningText);
    await nativeMessage.completePlanning(planningText, planningResult?.metrics ?? planningResult);
    planningComplete = true;

    const normalMessages = await captureResponseMessages(
      settings.response,
      signal,
      nativeMessage,
    );
    signal?.throwIfAborted?.();
    const responseMessages = appendPlanningToResponse(normalMessages, planningText);
    const responseResult = await requestResponse({
      stage: settings.response,
      messages: responseMessages,
      signal,
      onText: (text) => {
        responseText = cleanResponse(text, false);
        responseUpdates.schedule(responseText);
      },
    });
    const response = typeof responseResult === 'string'
      ? responseResult
      : responseResult?.text;
    responseText = requireVisibleText(cleanResponse(response, true));
    await responseUpdates.flush(responseText);
    await nativeMessage.commitResponse(responseText, responseResult?.metrics ?? responseResult);
    return {
      planning: planningText,
      response: responseText,
      stopped: false,
      metrics: {
        planner: planningResult?.metrics ?? planningResult ?? null,
        response: responseResult?.metrics ?? responseResult ?? null,
      },
    };
  } catch (error) {
    await Promise.all([planningUpdates.cancel(), responseUpdates.cancel()]);
    if (!planningComplete) {
      await nativeMessage.rollback();
      if (signal?.aborted) {
        return { planning: '', response: '', stopped: true };
      }
      throw error;
    }
    if (signal?.aborted) {
      if (signal.reason === 'interrupted') {
        await nativeMessage.commitInterruptedResponse?.(responseText);
        return {
          planning: planningText,
          response: responseText,
          stopped: true,
          interrupted: true,
        };
      }
      await nativeMessage.commitStoppedResponse?.(responseText);
      return { planning: planningText, response: responseText, stopped: true };
    }
    await nativeMessage.failResponse('Response failed.');
    throw error;
  }
}
