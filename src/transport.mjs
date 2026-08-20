import { requireVisibleText } from './contracts.mjs';

const ERROR_PREFIXES = ['ScyllaProxy Error'];

function couldBeTransportError(text) {
  const visible = String(text ?? '').trimStart();
  return ERROR_PREFIXES.some((prefix) => prefix.startsWith(visible) || visible.startsWith(prefix));
}

function throwIfTransportError(text) {
  const visible = String(text ?? '').trim();
  const scylla = /^ScyllaProxy Error\r?\nStatus Code: (\d{3})\r?\n[\s\S]*\r?\n\r?\n\s*\S/u.exec(visible);
  if (!scylla) return;
  throw new Error(`Provider transport error returned as visible content (HTTP ${scylla[1]})`);
}

export async function consumeVisibleResponse(response, onText) {
  const resolved = await response;
  if (resolved && typeof resolved === 'object' && typeof resolved.content === 'string') {
    const text = requireVisibleText(resolved.content);
    throwIfTransportError(text);
    await onText?.(text);
    return text;
  }
  if (typeof resolved !== 'function') {
    throw new TypeError('Model request did not return visible content or a stream');
  }

  const stream = resolved();
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    throw new TypeError('Model request stream is not iterable');
  }

  let text = '';
  let pending = [];
  for await (const frame of stream) {
    if (!frame || typeof frame.text !== 'string' || frame.text === text) continue;
    text = frame.text;
    if (couldBeTransportError(text)) {
      pending.push(text);
      continue;
    }
    for (const pendingText of pending) await onText?.(pendingText);
    pending = [];
    await onText?.(text);
  }
  text = requireVisibleText(text);
  throwIfTransportError(text);
  for (const pendingText of pending) await onText?.(pendingText);
  return text;
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

export async function requestStage({
  context,
  stage,
  messages,
  maxTokens,
  includePreset,
  presetName,
  proxies = [],
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
  } else if (includePreset) {
    const profileId = requireProfileId(context, stage);
    const profile = context.ConnectionManagerRequestService.getProfile(profileId);
    const selectedApi = context.ConnectionManagerRequestService.validateProfile(profile);
    if (selectedApi.selected !== 'openai' || !selectedApi.source) {
      throw new Error('Planner Response currently supports Chat Completion profiles only');
    }
    const proxy = proxies.find((item) => item.name === profile.proxy);
    response = context.ChatCompletionService.processRequest({
      stream: true,
      messages,
      max_tokens: maxTokens,
      model: stage.model || profile.model,
      chat_completion_source: selectedApi.source,
      secret_id: profile['secret-id'],
      custom_url: profile['api-url'],
      vertexai_region: profile['api-url'],
      zai_endpoint: profile['api-url'],
      siliconflow_endpoint: profile['api-url'],
      minimax_endpoint: profile['api-url'],
      reverse_proxy: proxy?.url,
      proxy_password: proxy?.password,
      custom_prompt_post_processing: profile['prompt-post-processing'],
    }, { presetName }, true, signal);
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

  return consumeVisibleResponse(response, onText);
}
