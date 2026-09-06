import {
  cleanUpMessage,
  extension_prompt_types,
  getExtensionPrompt,
} from '/script.js';
import {
  ChatCompletion,
  getPromptRole,
  promptManager,
} from '/scripts/openai.js';
import { NOTE_MODULE_NAME } from '/scripts/authors-note.js';
import { inject_ids } from '/scripts/constants.js';
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
import {
  buildNativePromptContent,
  collectNativeInjectionSlices,
  hostInjectionKind,
} from './native-prompt-view.mjs';
import {
  captureAssembledPrompt,
  captureNormalResponseMessages,
} from './response-context.mjs';
import { createRuntimeKernel, validateNativeUserTurn } from './runtime-kernel.mjs';
import { getActiveArrangement, getActivePlannerContext, normalizeSettings } from './settings.mjs';
import {
  requestStageDetailed,
  stageTransportOverride,
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

function cleanResponse(text, final) {
  return cleanUpMessage({
    getMessage: String(text ?? ''),
    isImpersonate: false,
    isContinue: false,
    displayIncompleteSentences: !final,
  });
}

function wantsNativePlannerContent(settings) {
  return settings.includeLorebook === true
    || settings.includeExtensionInjections === true
    || settings.includeAuthorsNote === true;
}

function nativeInjectionKind(key) {
  return hostInjectionKind(key, {
    authorsNoteKey: NOTE_MODULE_NAME,
    lorebookPrefix: inject_ids.CUSTOM_WI_DEPTH,
    excludedPrefixes: [
      inject_ids.DEPTH_PROMPT,
      inject_ids.QUIET_PROMPT,
      inject_ids.STORY_STRING,
    ],
  });
}

async function withoutRegeneratedCandidate(context, generationType, callback) {
  const candidate = generationType === 'regenerate' ? context.chat?.at(-1) : null;
  if (!candidate || candidate.is_user === true) return callback();
  const previous = candidate.is_system;
  candidate.is_system = true;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete candidate.is_system;
    else candidate.is_system = previous;
  }
}

async function captureNativePlannerContent(context, generationType, chat) {
  const scanEvent = context.eventTypes?.WORLDINFO_SCAN_DONE;
  let authorsNoteSource = context.extensionPrompts?.[NOTE_MODULE_NAME]?.value ?? '';
  const captureAuthorsNoteSource = () => {
    authorsNoteSource = context.extensionPrompts?.[NOTE_MODULE_NAME]?.value ?? '';
  };
  if (scanEvent) context.eventSource.on(scanEvent, captureAuthorsNoteSource);
  try {
    await withoutRegeneratedCandidate(context, generationType, () => (
      captureAssembledPrompt(context, generationType)
    ));
  } finally {
    if (scanEvent) context.eventSource.removeListener(scanEvent, captureAuthorsNoteSource);
  }

  const promptCollection = clonePromptCollection(
    promptManager.getMessages?.() ?? promptManager.messages,
  );
  const injectionSlices = await collectNativeInjectionSlices({
    prompts: context.extensionPrompts,
    inChatPosition: extension_prompt_types.IN_CHAT,
    authorsNoteKey: NOTE_MODULE_NAME,
    authorsNoteSource,
    kindForKey: nativeInjectionKind,
    render: getExtensionPrompt,
    roleName: getPromptRole,
  });
  const authorsNote = context.extensionPrompts?.[NOTE_MODULE_NAME];
  const authorsNoteContent = promptManager.preparePrompt({
    identifier: 'authorsNote',
    role: getPromptRole(authorsNote?.role),
    content: authorsNoteSource,
  }).content;

  return buildNativePromptContent({
    promptCollection,
    injectionSlices,
    authorsNoteContent,
    conversationContents: (Array.isArray(chat) ? chat : [])
      .filter((message) => message?.is_system !== true
        && message?.extra?.[Symbol.for('ignore')] !== true)
      .map((message) => message?.mes)
      .filter((value) => typeof value === 'string' && value.trim() !== ''),
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
        const plannerContext = getActivePlannerContext(plannerSettings);
        const nativePromptContent = wantsNativePlannerContent(plannerContext)
          ? await captureNativePlannerContent(context, generationType, plannerHistorySource)
          : {};
        signal?.throwIfAborted?.();
        const promptOrder = promptManager.getPromptOrderForCharacter?.(
          promptManager.activeCharacter,
        ) ?? [];
        return {
          arrangement: getActiveArrangement(plannerSettings),
          presetPrompts: plannerContext.contextMode === 'preset'
            ? collectActivePresetPrompts({
              prompts: context.chatCompletionSettings?.prompts,
              promptOrder,
              substituteParams: (prompt) => context.substituteParams(prompt),
              plannerTemplate: settings.plannerPrompt,
            })
            : [],
          history: collectPlannerHistory(
            plannerHistorySource,
            plannerContext,
            nativePromptContent,
          ),
          summaryception: plannerContext.includeSummaryception
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
