import {
  appendPlanningToResponse,
  buildPlannerRequest,
  requireVisibleText,
} from './contracts.mjs';
import { createThrottledUpdater } from './throttled-updater.mjs';
import { requirePlanningArtifact } from './planning-artifact.mjs';

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
    const planning = await requestPlanner({
      stage: settings.planner,
      messages: plannerRequest.messages,
      signal,
      onText: (text) => {
        planningText = text;
        planningUpdates.schedule(text);
      },
    });
    planningText = requirePlanningArtifact(planning, plannerRequest.expandedTemplate);
    await planningUpdates.flush(planningText);
    await nativeMessage.completePlanning(planningText);
    planningComplete = true;

    const normalMessages = await captureResponseMessages(
      settings.response,
      signal,
      nativeMessage,
    );
    signal?.throwIfAborted?.();
    const responseMessages = appendPlanningToResponse(normalMessages, planningText);
    const response = await requestResponse({
      stage: settings.response,
      messages: responseMessages,
      signal,
      onText: (text) => {
        responseText = cleanResponse(text, false);
        responseUpdates.schedule(responseText);
      },
    });
    responseText = requireVisibleText(cleanResponse(response, true));
    await responseUpdates.flush(responseText);
    await nativeMessage.commitResponse(responseText);
    return { planning: planningText, response: responseText, stopped: false };
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
      await nativeMessage.commitStoppedResponse?.(responseText);
      return { planning: planningText, response: responseText, stopped: true };
    }
    await nativeMessage.failResponse('Response failed.');
    throw error;
  }
}
