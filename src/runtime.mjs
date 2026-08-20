import { cleanUpMessage } from '/script.js';
import { ChatCompletion, promptManager, proxies } from '/scripts/openai.js';
import { rotateSecret, SECRET_KEYS, secret_state, writeSecret } from '/scripts/secrets.js';

import {
  createNativeMessage,
  recoverStalePendingMessage,
  refreshPlanningHeaders,
} from './native-message.mjs';
import { saveCustomSecret } from './custom-secret.mjs';
import { runPlannerResponse } from './operation.mjs';
import {
  collectActivePresetPrompts,
  collectPlannerHistory,
  extractSummaryceptionText,
} from './planner-context.mjs';
import { historyForGeneration, isPlannedGeneration } from './generation-candidate.mjs';
import { clonePromptCollection } from './prompt-collection.mjs';
import { captureNormalResponseMessages } from './response-context.mjs';
import { normalizeSettings } from './settings.mjs';
import { requestStage } from './transport.mjs';
import { mountSettings } from './ui.mjs';

const EXTENSION_KEY = 'agapePlannerResponse';
let activeController = null;
let ui = null;
let regenerateSnapshot = null;

const getContext = () => globalThis.SillyTavern.getContext();

function currentSettings() {
  return normalizeSettings(getContext().extensionSettings?.[EXTENSION_KEY]);
}

function responsePresetName(context) {
  return context.getPresetManager?.('openai')?.getSelectedPresetName?.() ?? undefined;
}

function maxTokens(context) {
  const value = Number(context.chatCompletionSettings?.openai_max_tokens);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 4096;
}

function cleanResponse(text, final) {
  return cleanUpMessage({
    getMessage: String(text ?? ''),
    isImpersonate: false,
    isContinue: false,
    displayIncompleteSentences: !final,
  });
}

async function runOneCandidate(settings, generationType, previousCandidate = null) {
  const initialContext = getContext();
  const plannerHistorySource = historyForGeneration(
    initialContext.chat,
    generationType,
  );
  const controller = new AbortController();
  activeController = controller;
  const onStop = () => controller.abort(new DOMException('Generation aborted', 'AbortError'));
  initialContext.eventSource.on(initialContext.eventTypes.GENERATION_STOPPED, onStop);

  let responsePreset;
  let responseMaxTokens;
  try {
    return await runPlannerResponse({
      settings,
      substituteParams: (prompt) => getContext().substituteParams(prompt),
      collectPlannerContext: async (plannerSettings) => {
        const context = getContext();
        const promptOrder = promptManager.getPromptOrderForCharacter?.(
          promptManager.activeCharacter,
        ) ?? [];
        return {
          presetPrompts: plannerSettings.contextMode === 'preset'
            ? collectActivePresetPrompts({
              prompts: context.chatCompletionSettings?.prompts,
              promptOrder,
              substituteParams: (prompt) => context.substituteParams(prompt),
              plannerTemplate: settings.plannerPrompt,
            })
            : [],
          history: collectPlannerHistory(
            plannerHistorySource,
            plannerSettings,
          ),
          summaryception: plannerSettings.includeSummaryception
            ? extractSummaryceptionText(context.chatMetadata)
            : '',
        };
      },
      createMessage: async () => createNativeMessage({
        context: getContext(),
        type: generationType,
        previousCandidate,
      }),
      requestPlanner: ({ stage, messages, signal, onText }) => {
        const context = getContext();
        return requestStage({
          context,
          stage,
          messages,
          maxTokens: maxTokens(context),
          includePreset: false,
          signal,
          onText,
        });
      },
      captureResponseMessages: async (stage, signal, nativeMessage) => {
        signal?.throwIfAborted?.();
        const context = getContext();
        if (context.mainApi !== 'openai') {
          throw new Error('Planner Response currently supports Chat Completion profiles only');
        }
        responsePreset = responsePresetName(context);
        responseMaxTokens = maxTokens(context);
        const responseGenerationType = generationType === 'swipe' ? 'swipe' : 'normal';
        const capture = () => captureNormalResponseMessages(context, async () => {
          const completion = new ChatCompletion();
          completion.messages = clonePromptCollection(
            promptManager.getMessages?.() ?? promptManager.messages,
          );
          await completion.squashSystemMessages();
          return completion.getChat();
        }, responseGenerationType);
        return generationType === 'swipe'
          ? capture()
          : nativeMessage.withoutCandidate(capture);
      },
      requestResponse: ({ stage, messages, signal, onText }) => requestStage({
        context: getContext(),
        stage,
        messages,
        maxTokens: responseMaxTokens,
        includePreset: true,
        presetName: responsePreset,
        proxies,
        signal,
        onText,
      }),
      cleanResponse,
      signal: controller.signal,
    });
  } finally {
    initialContext.eventSource.removeListener(initialContext.eventTypes.GENERATION_STOPPED, onStop);
    activeController = null;
  }
}

export async function generationInterceptor(_chat, _contextSize, abort, type) {
  if (!isPlannedGeneration(type)) return;
  const settings = currentSettings();
  if (!settings.enabled) return;

  abort(true);
  if (activeController) {
    globalThis.toastr?.warning('Planner Response is already running.');
    return;
  }

  ui?.setStatus('Planning', 'busy');
  const previousCandidate = type === 'regenerate' ? regenerateSnapshot : null;
  regenerateSnapshot = null;
  try {
    const result = await runOneCandidate(settings, type, previousCandidate);
    ui?.setStatus(result.stopped ? 'Stopped' : 'Complete', 'idle');
  } catch (error) {
    console.error('[AGAPE Planner Response] Generation failed.', error);
    ui?.setStatus('Failed', 'error');
    globalThis.toastr?.error(error.message || String(error), 'Planner Response');
  }
}

export async function initialize() {
  const context = getContext();
  await recoverStalePendingMessage(context);
  context.extensionSettings[EXTENSION_KEY] = currentSettings();
  ui = await mountSettings({
    context,
    initialSettings: context.extensionSettings[EXTENSION_KEY],
    saveSecret: async (stageName, value) => {
      return saveCustomSecret({
        secretKey: SECRET_KEYS.CUSTOM,
        getSecretState: () => secret_state,
        value,
        label: `AGAPE ${stageName === 'planner' ? 'Planner' : 'Response'}`,
        writeSecret,
        rotateSecret,
      });
    },
  });
  refreshPlanningHeaders(context);

  context.eventSource.on(context.eventTypes.GENERATION_STARTED, (type, _options, dryRun) => {
    if (type !== 'regenerate' || dryRun) return;
    const last = getContext().chat.at(-1);
    regenerateSnapshot = last?.is_user === false ? structuredClone(last) : null;
  });

  for (const event of [
    context.eventTypes.CONNECTION_PROFILE_CREATED,
    context.eventTypes.CONNECTION_PROFILE_UPDATED,
    context.eventTypes.CONNECTION_PROFILE_DELETED,
    context.eventTypes.CONNECTION_PROFILE_LOADED,
  ]) {
    context.eventSource.on(event, () => ui?.refreshProfiles());
  }
  for (const event of [
    context.eventTypes.MESSAGE_SWIPED,
    context.eventTypes.CHARACTER_MESSAGE_RENDERED,
  ]) {
    context.eventSource.on(event, () => globalThis.setTimeout(
      () => refreshPlanningHeaders(getContext()),
      0,
    ));
  }
  context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
    if (!activeController) {
      recoverStalePendingMessage(getContext()).then(() => {
        globalThis.setTimeout(() => refreshPlanningHeaders(getContext()), 0);
      }).catch((error) => {
        console.error('[AGAPE Planner Response] Could not recover a stale assistant message.', error);
      });
    }
  });
}

export function stopActiveOperation() {
  activeController?.abort(new DOMException('Generation aborted', 'AbortError'));
}
