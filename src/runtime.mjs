import { cleanUpMessage } from '/script.js';
import { ChatCompletion, promptManager } from '/scripts/openai.js';
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
import { balanceStreamingMarkdown } from './streaming-markdown.mjs';
import { clonePromptCollection } from './prompt-collection.mjs';
import { captureNormalResponseMessages } from './response-context.mjs';
import { createRuntimeKernel, validateNativeUserTurn } from './runtime-kernel.mjs';
import { normalizeSettings } from './settings.mjs';
import {
  mergeExcludedFields,
  requestStageDetailed,
  scyllaStageOverride,
} from './transport.mjs';
import { mountSettings } from './ui.mjs';

const EXTENSION_KEY = 'agapePlannerResponse';
let ui = null;
let regenerateSnapshot = null;
let kernel = null;

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

function stageTransportOverride(context, stage, planner = false) {
  const selectedProfileId = stage.profileId
    || context.extensionSettings?.connectionManager?.selectedProfile;
  const profile = context.extensionSettings?.connectionManager?.profiles?.find(
    (candidate) => candidate?.id === selectedProfileId,
  );
  const model = stage.model || profile?.model || context.getChatCompletionModel?.();
  const url = stage.source === 'custom'
    ? stage.customUrl
    : profile?.['api-url'] || context.chatCompletionSettings?.custom_url;
  const override = scyllaStageOverride(model, url, { planner });
  if (!override?.custom_exclude_body) return override;
  const presetName = profile?.preset || responsePresetName(context);
  const preset = context.getPresetManager?.('openai')
    ?.getCompletionPresetByName?.(presetName);
  const existing = preset?.custom_exclude_body
    ?? context.chatCompletionSettings?.custom_exclude_body;
  return {
    ...override,
    custom_exclude_body: mergeExcludedFields(existing, JSON.parse(override.custom_exclude_body)),
  };
}

function cleanResponse(text, final) {
  return cleanUpMessage({
    getMessage: String(text ?? ''),
    isImpersonate: false,
    isContinue: false,
    displayIncompleteSentences: !final,
  });
}

async function runOneCandidate(
  settings,
  generationType,
  previousCandidate = null,
  signal,
  nativeUserTurn = null,
) {
  const initialContext = getContext();
  if (generationType === 'normal') {
    if (!validateNativeUserTurn(initialContext, nativeUserTurn)) {
      throw new Error('The newly saved terminal user turn changed before Planning started');
    }
  }
  const plannerHistorySource = historyForGeneration(
    initialContext.chat,
    generationType,
  );
  let responsePreset;
  let responseMaxTokens;
  return runPlannerResponse({
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
        return requestStageDetailed({
          context,
          stage,
          messages,
          maxTokens: maxTokens(context),
          includePreset: false,
          signal,
          onText,
          overridePayload: stageTransportOverride(context, stage, true),
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
      requestResponse: ({ stage, messages, signal, onText }) => {
        const context = getContext();
        return requestStageDetailed({
          context,
          stage,
          messages,
          maxTokens: responseMaxTokens,
          includePreset: true,
          presetName: responsePreset,
          signal,
          onText,
          overridePayload: stageTransportOverride(context, stage),
        });
      },
      cleanResponse: (text, final) => {
        const cleaned = cleanResponse(text, final);
        return final ? cleaned : balanceStreamingMarkdown(cleaned);
      },
      signal,
    });
}

export async function generationInterceptor(_chat, _contextSize, abort, type) {
  if (!isPlannedGeneration(type)) return;
  const settings = currentSettings();
  if (!settings.enabled) return;

  let nativeUserTurn = null;
  if (type === 'normal') {
    nativeUserTurn = kernel?.consumeUserTurn(_chat);
    if (!nativeUserTurn) {
      abort(true);
      ui?.setStatus('Failed', 'error');
      globalThis.toastr?.error(
        'Planner Response could not bind the newly saved user turn.',
        'Planner Response',
      );
      return;
    }
  }

  abort(true);
  ui?.setStatus('Planning', 'busy');
  const previousCandidate = type === 'regenerate' ? regenerateSnapshot : null;
  regenerateSnapshot = null;
  try {
    const result = await kernel.enqueue({
      settings,
      generationType: type,
      previousCandidate,
      nativeUserTurn,
    });
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

  kernel = createRuntimeKernel({
    contextProvider: getContext,
    runCandidate: ({ settings, generationType, previousCandidate, nativeUserTurn, signal }) => (
      runOneCandidate(settings, generationType, previousCandidate, signal, nativeUserTurn)
    ),
  });

  context.eventSource.on(context.eventTypes.MESSAGE_SENT, (messageIndex) => {
    kernel.captureUserTurn(messageIndex);
  });
  context.eventSource.on(context.eventTypes.GENERATION_STOPPED, () => kernel.stop());

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
    kernel.chatChanged();
    if (!kernel.isBusy()) {
      recoverStalePendingMessage(getContext()).then(() => {
        globalThis.setTimeout(() => refreshPlanningHeaders(getContext()), 0);
      }).catch((error) => {
        console.error('[AGAPE Planner Response] Could not recover a stale assistant message.', error);
      });
    }
  });
}

export function stopActiveOperation() {
  kernel?.stop();
}
