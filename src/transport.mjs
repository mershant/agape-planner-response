import { requireVisibleText } from './contracts.mjs';

const TRANSPORT_ERROR_PREFIX = 'Error ';
const TRANSPORT_ERROR_JSON_PREFIX = ': {"error":';
const SCYLLA_PROXY_ERROR_PREFIX = 'ScyllaProxy Error';

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function normalizePossibleEnvelope(text) {
  const normalized = text.replaceAll('\r\n', '\n');
  if (!normalized.includes('\r')) return normalized;
  if (normalized.endsWith('\r') && normalized.indexOf('\r') === normalized.length - 1) {
    return normalized.slice(0, -1);
  }
  return null;
}

function couldBeScyllaProxyError(text) {
  const value = normalizePossibleEnvelope(text);
  if (value === null) return false;
  if (SCYLLA_PROXY_ERROR_PREFIX.startsWith(value)) return true;
  if (!value.startsWith(SCYLLA_PROXY_ERROR_PREFIX)) return false;

  let offset = SCYLLA_PROXY_ERROR_PREFIX.length;
  const consumeLiteral = (literal) => {
    const remaining = value.slice(offset);
    if (literal.startsWith(remaining)) return 'pending';
    if (!remaining.startsWith(literal)) return 'invalid';
    offset += literal.length;
    return 'complete';
  };
  const consumeLine = (label) => {
    const labelState = consumeLiteral(label);
    if (labelState !== 'complete') return labelState;
    const newline = value.indexOf('\n', offset);
    if (newline === -1) return 'pending';
    offset = newline + 1;
    return 'complete';
  };

  const statusLabelState = consumeLiteral('\nStatus Code: ');
  if (statusLabelState === 'invalid') return false;
  if (statusLabelState === 'pending') return true;

  const statusRemainder = value.slice(offset);
  const statusDigits = /^\d{0,3}/.exec(statusRemainder)[0];
  if (statusDigits.length < 3) return statusDigits.length === statusRemainder.length;
  offset += 3;
  const statusNewlineState = consumeLiteral('\n');
  if (statusNewlineState === 'invalid') return false;
  if (statusNewlineState === 'pending') return true;

  for (const label of ['Model: ', 'Token: ', 'Time: ']) {
    const state = consumeLine(label);
    if (state === 'invalid') return false;
    if (state === 'pending') return true;
  }

  const blankLineState = consumeLiteral('\n');
  return blankLineState !== 'invalid';
}

function couldBeVisibleTransportError(text) {
  const visible = text.replace(/^\s*/, '');
  if (TRANSPORT_ERROR_PREFIX.startsWith(visible)) return true;
  if (!visible.startsWith(TRANSPORT_ERROR_PREFIX)) return false;

  const afterPrefix = visible.slice(TRANSPORT_ERROR_PREFIX.length);
  const digits = afterPrefix.slice(0, 3);
  if (!/^\d*$/.test(digits)) return false;
  if (digits.length < 3) return true;

  const afterStatus = afterPrefix.slice(3);
  return TRANSPORT_ERROR_JSON_PREFIX.startsWith(afterStatus)
    || afterStatus.startsWith(TRANSPORT_ERROR_JSON_PREFIX);
}

function visibleTransportErrorStatus(text) {
  const match = /^\s*Error (\d{3}): (\{"error":.*\})\s*$/s.exec(text);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[2]);
    const isTransportError = payload !== null
      && typeof payload === 'object'
      && !Array.isArray(payload)
      && Object.hasOwn(payload, 'error');
    return isTransportError ? Number.parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

function throwIfVisibleTransportError(text) {
  const transportStatus = visibleTransportErrorStatus(text);
  if (transportStatus !== null) {
    const error = new Error('Provider transport error returned as visible content');
    error.status = transportStatus;
    throw error;
  }

  const scyllaMatch = /^ScyllaProxy Error\r?\nStatus Code: (\d{3})\r?\nModel: [^\r\n]*\r?\nToken: [^\r\n]*\r?\nTime: [^\r\n]*\r?\n\r?\n\s*\S[\s\S]*$/u.exec(text);
  if (scyllaMatch) {
    const error = new Error(`Provider transport error (HTTP ${scyllaMatch[1]})`);
    error.status = Number.parseInt(scyllaMatch[1], 10);
    throw error;
  }
}

export async function consumeVisibleResponse(response, onDelta, now = defaultNow) {
  const startedAt = now();
  const resolved = await response;
  if (
    resolved
    && typeof resolved === 'object'
    && !Array.isArray(resolved)
    && typeof resolved.content === 'string'
  ) {
    const text = requireVisibleText(resolved.content);
    throwIfVisibleTransportError(text);
    return {
      text,
      firstDeltaMs: null,
      totalMs: now() - startedAt,
    };
  }
  if (typeof resolved !== 'function') {
    throw new TypeError('Invalid stream response shape: expected a stream factory');
  }

  const stream = resolved();
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    throw new TypeError('Invalid stream factory result: expected an async iterable');
  }

  let text = '';
  let firstDeltaMs = null;
  let pendingDeltas = [];

  const emitDelta = async (delta, fullText) => {
    if (onDelta) await onDelta(delta, fullText);
  };

  const flushPendingDeltas = async () => {
    for (const [delta, fullText] of pendingDeltas) {
      await emitDelta(delta, fullText);
    }
    pendingDeltas = [];
  };

  for await (const frame of stream) {
    if (!frame || typeof frame.text !== 'string') continue;

    const nextText = frame.text;
    if (nextText === text) continue;

    const delta = nextText.startsWith(text)
      ? nextText.slice(text.length)
      : nextText;
    text = nextText;

    if (delta.length === 0) continue;
    if (firstDeltaMs === null) firstDeltaMs = now() - startedAt;
    if (couldBeVisibleTransportError(text) || couldBeScyllaProxyError(text)) {
      pendingDeltas.push([delta, text]);
      continue;
    }
    await flushPendingDeltas();
    await emitDelta(delta, text);
  }

  text = requireVisibleText(text);
  throwIfVisibleTransportError(text);
  await flushPendingDeltas();

  return {
    text,
    firstDeltaMs,
    totalMs: now() - startedAt,
  };
}

function activeProfileId(context) {
  return String(context?.extensionSettings?.connectionManager?.selectedProfile ?? '');
}

function requireProfileId(context, stage) {
  const id = String(stage.profileId || activeProfileId(context));
  if (!id) throw new Error('Choose a SillyTavern connection profile');
  return id;
}

function requestCurrentConnection({ context, stage, messages, maxTokens, includePreset, presetName, signal }) {
  const settings = context.chatCompletionSettings;
  if (!settings || context.mainApi !== 'openai') {
    throw new Error('The current connection is not a Chat Completion connection');
  }
  const model = stage.model || context.getChatCompletionModel?.();
  if (!model) throw new Error('The current Chat Completion connection has no model');

  return context.ChatCompletionService.processRequest({
    stream: true,
    messages,
    max_tokens: maxTokens,
    model,
    chat_completion_source: settings.chat_completion_source,
    custom_url: settings.custom_url,
    vertexai_region: settings.vertexai_region,
    zai_endpoint: settings.zai_endpoint,
    siliconflow_endpoint: settings.siliconflow_endpoint,
    minimax_endpoint: settings.minimax_endpoint,
    reverse_proxy: settings.reverse_proxy,
    proxy_password: settings.proxy_password,
    custom_prompt_post_processing: settings.custom_prompt_post_processing,
  }, { presetName: includePreset ? presetName : undefined }, true, signal);
}

function validateCustomStage(stage) {
  let url;
  try {
    url = new URL(stage.customUrl);
  } catch {
    throw new Error('Enter a valid custom API URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Custom API URL must use HTTP or HTTPS');
  }
  if (!stage.model) throw new Error('Enter a model for the custom API');
}

export async function requestStageDetailed({
  context,
  stage,
  messages,
  maxTokens,
  includePreset = false,
  presetName,
  signal,
  onText,
}) {
  if (!context || !stage) throw new TypeError('Stage request context is required');

  let response;
  if (stage.source === 'custom') {
    validateCustomStage(stage);
    response = context.ChatCompletionService.processRequest({
      stream: true,
      messages,
      max_tokens: maxTokens,
      model: stage.model,
      chat_completion_source: 'custom',
      custom_url: stage.customUrl,
      ...(stage.secretId ? { secret_id: stage.secretId } : {}),
    }, {
      presetName: includePreset ? presetName : undefined,
    }, true, signal);
  } else if (!stage.profileId && !activeProfileId(context)) {
    response = requestCurrentConnection({
      context,
      stage,
      messages,
      maxTokens,
      includePreset,
      presetName,
      signal,
    });
  } else {
    const overridePayload = stage.model ? { model: stage.model } : {};
    response = context.ConnectionManagerRequestService.sendRequest(
      requireProfileId(context, stage),
      messages,
      maxTokens,
      {
        stream: true,
        extractData: true,
        includePreset,
        includeInstruct: false,
        signal,
      },
      overridePayload,
    );
  }

  const visible = await consumeVisibleResponse(
    response,
    onText
      ? async (_delta, fullText) => {
        await onText(fullText);
      }
      : undefined,
  );
  return visible;
}

export async function requestStage(options) {
  return (await requestStageDetailed(options)).text;
}
