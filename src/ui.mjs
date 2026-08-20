import { normalizeSettings } from './settings.mjs';

const ROOT_ID = 'agape-planner-response-settings';

function chatCompletionProfiles(context) {
  const manager = context.extensionSettings?.connectionManager ?? {};
  const activeId = String(manager.selectedProfile ?? '');
  const profiles = Array.isArray(manager.profiles) ? manager.profiles : [];
  return {
    activeId,
    profiles: profiles.filter((profile) => {
      const mapping = context.CONNECT_API_MAP?.[profile.api];
      return profile.mode === 'cc' || mapping?.selected === 'openai';
    }),
  };
}

function profileLabel(profile, activeId) {
  const model = profile.model ? ` - ${profile.model}` : '';
  const active = profile.id === activeId ? ' (current)' : '';
  return `${profile.name || profile.id}${model}${active}`;
}

function fillProfileSelect(select, context, selectedId) {
  const { profiles, activeId } = chatCompletionProfiles(context);
  select.replaceChildren();
  const current = document.createElement('option');
  current.value = '';
  current.textContent = activeId ? 'Current connection profile' : 'Current connection (no saved profile)';
  select.append(current);

  for (const profile of profiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profileLabel(profile, activeId);
    select.append(option);
  }
  select.value = profiles.some((profile) => profile.id === selectedId) ? selectedId : '';
}

export async function mountSettings({ context, initialSettings, saveSecret }) {
  const existing = document.getElementById(ROOT_ID);
  if (existing?.__agapePlannerResponse) return existing.__agapePlannerResponse;

  const html = await context.renderExtensionTemplateAsync(
    'third-party/agape-planner-response',
    'settings',
  );
  const host = document.querySelector('#extensions_settings2')
    ?? document.querySelector('#extensions_settings');
  if (!host) throw new Error('SillyTavern extension settings host is unavailable');
  host.insertAdjacentHTML('beforeend', html);
  const root = document.getElementById(ROOT_ID);
  if (!root) throw new Error('Planner Response settings template did not load');

  let settings = normalizeSettings(initialSettings);
  const byId = (id) => root.querySelector(`#${id}`);
  const status = byId('agape-planner-response-status');

  function persist() {
    settings = normalizeSettings(settings);
    context.extensionSettings.agapePlannerResponse = structuredClone(settings);
    context.saveSettingsDebounced?.();
  }

  function renderStage(stageName) {
    const stage = settings[stageName];
    const prefix = `agape-${stageName}`;
    byId(`${prefix}-source`).value = stage.source;
    byId(`${prefix}-model`).value = stage.model;
    byId(`${prefix}-custom-url`).value = stage.customUrl;
    fillProfileSelect(byId(`${prefix}-profile`), context, stage.profileId);
    root.querySelector(`[data-stage-panel="${stageName}-profile"]`).hidden = stage.source !== 'profile';
    root.querySelector(`[data-stage-panel="${stageName}-custom"]`).hidden = stage.source !== 'custom';
    const keyState = byId(`${prefix}-key-state`);
    keyState.textContent = stage.secretId ? 'API key saved in SillyTavern' : 'No saved API key (keyless is allowed)';
  }

  byId('agape-planner-response-enabled').checked = settings.enabled;
  byId('agape-planner-prompt').value = settings.plannerPrompt;
  renderStage('planner');
  renderStage('response');

  byId('agape-planner-response-enabled').addEventListener('change', (event) => {
    settings.enabled = event.currentTarget.checked;
    persist();
  });
  byId('agape-planner-prompt').addEventListener('input', (event) => {
    settings.plannerPrompt = event.currentTarget.value;
    persist();
  });

  for (const stageName of ['planner', 'response']) {
    const prefix = `agape-${stageName}`;
    byId(`${prefix}-source`).addEventListener('change', (event) => {
      settings[stageName].source = event.currentTarget.value;
      persist();
      renderStage(stageName);
    });
    byId(`${prefix}-profile`).addEventListener('change', (event) => {
      settings[stageName].profileId = event.currentTarget.value;
      persist();
    });
    byId(`${prefix}-model`).addEventListener('input', (event) => {
      settings[stageName].model = event.currentTarget.value;
      persist();
    });
    byId(`${prefix}-custom-url`).addEventListener('input', (event) => {
      settings[stageName].customUrl = event.currentTarget.value;
      persist();
    });
    byId(`${prefix}-save-key`).addEventListener('click', async () => {
      const input = byId(`${prefix}-api-key`);
      const value = input.value.trim();
      if (!value) {
        globalThis.toastr?.warning('Enter an API key first.');
        return;
      }
      const button = byId(`${prefix}-save-key`);
      button.disabled = true;
      try {
        const secretId = await saveSecret(stageName, value);
        if (!secretId) throw new Error('SillyTavern did not save the API key');
        settings[stageName].secretId = secretId;
        input.value = '';
        persist();
        renderStage(stageName);
        globalThis.toastr?.success(`${stageName === 'planner' ? 'Planner' : 'Response'} API key saved.`);
      } catch (error) {
        globalThis.toastr?.error(error.message, 'Planner Response');
      } finally {
        button.disabled = false;
      }
    });
    byId(`${prefix}-forget-key`).addEventListener('click', () => {
      settings[stageName].secretId = '';
      persist();
      renderStage(stageName);
    });
  }

  const controller = {
    getSettings: () => normalizeSettings(settings),
    setStatus(text, state = 'idle') {
      status.textContent = text;
      status.dataset.state = state;
    },
    refreshProfiles() {
      renderStage('planner');
      renderStage('response');
    },
  };
  root.__agapePlannerResponse = controller;
  persist();
  return controller;
}
