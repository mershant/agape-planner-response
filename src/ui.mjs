import {
  BLOCK_ROLES,
  getActiveArrangement,
  normalizeSettings,
} from './settings.mjs';
import {
  addTextBlock,
  createArrangement,
  deleteActiveArrangement,
  moveBlock,
  removeBlock,
  renameActiveArrangement,
  resetActiveArrangement,
  switchArrangement,
  updateBlock,
} from './arrangement-editor.mjs';

const ROOT_ID = 'agape-planner-response-settings';
const extensionFolder = decodeURIComponent(
  new URL('../', import.meta.url).pathname.split('/').filter(Boolean).at(-1),
);
const TEMPLATE_PATH = `third-party/${extensionFolder}`;

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
    TEMPLATE_PATH,
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
    byId(`${prefix}-reasoning`).value = stage.reasoningLevel;
    if (stageName === 'response') {
      byId('agape-response-min-words').value = String(stage.minWords);
      byId('agape-response-retry-count').value = String(stage.retryCount);
    }
    byId(`${prefix}-custom-url`).value = stage.customUrl;
    fillProfileSelect(byId(`${prefix}-profile`), context, stage.profileId);
    root.querySelector(`[data-stage-panel="${stageName}-profile"]`).hidden = stage.source !== 'profile';
    root.querySelector(`[data-stage-panel="${stageName}-custom"]`).hidden = stage.source !== 'custom';
    const keyState = byId(`${prefix}-key-state`);
    keyState.textContent = stage.secretId ? 'API key saved in SillyTavern' : 'No saved API key (keyless is allowed)';
  }

  const element = (tag, attributes = {}, text = '') => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (name === 'className') node.className = value;
      else if (name === 'dataset') Object.assign(node.dataset, value);
      else node[name] = value;
    }
    node.textContent = text;
    return node;
  };

  function rolePicker(block) {
    const select = element('select', {
      className: 'text_pole agape-pr__block-role',
      ariaLabel: `${block.name} role`,
      dataset: { blockAction: 'role', blockId: block.id },
    });
    for (const role of BLOCK_ROLES) {
      select.append(element('option', { value: role, selected: block.role === role }, role));
    }
    return select;
  }

  function blockTools(block, index, count) {
    const tools = element('div', { className: 'agape-pr__block-tools' });
    const addButton = (label, action, disabled = false, title = '') => tools.append(element('button', {
      className: 'menu_button',
      type: 'button',
      disabled,
      title,
      ariaLabel: title || label,
      dataset: { blockAction: action, blockId: block.id },
    }, label));
    addButton('↑', 'up', index === 0, `Move ${block.name} up`);
    addButton('↓', 'down', index === count - 1, `Move ${block.name} down`);
    if (block.kind === 'text') addButton('Remove', 'remove', false, `Remove ${block.name}`);
    if (block.slot !== 'template') {
      const enabled = element('label', { className: 'checkbox_label agape-pr__block-enabled' });
      enabled.append(
        element('input', {
          type: 'checkbox',
          checked: block.enabled,
          dataset: { blockAction: 'enabled', blockId: block.id },
        }),
        element('span', {}, 'Enabled'),
      );
      tools.append(enabled);
    }
    return tools;
  }

  function historyOptions(block) {
    const options = element('div', { className: 'agape-pr__history-options' });
    const mode = element('select', {
      className: 'text_pole',
      ariaLabel: 'Conversation history range',
      dataset: { blockAction: 'history-mode', blockId: block.id },
    });
    mode.append(
      element('option', { value: 'full', selected: block.historyMode === 'full' }, 'Full history'),
      element('option', { value: 'depth', selected: block.historyMode === 'depth' }, 'Recent messages only'),
    );
    options.append(mode);
    if (block.historyMode === 'depth') {
      options.append(element('input', {
        className: 'text_pole',
        type: 'number',
        min: '0',
        max: '100',
        step: '1',
        value: String(block.historyDepth),
        ariaLabel: 'History depth in messages',
        dataset: { blockAction: 'history-depth', blockId: block.id },
      }));
    } else {
      const label = element('label', { className: 'checkbox_label' });
      label.append(
        element('input', {
          type: 'checkbox',
          checked: block.includeSummaryception,
          dataset: { blockAction: 'summaryception', blockId: block.id },
        }),
        element('span', {}, 'Include Summaryception'),
      );
      options.append(label);
    }

    const visibility = element('div', { className: 'agape-pr__history-visibility' });
    const heading = element('div', { className: 'agape-pr__visibility-heading' });
    heading.append(
      element('strong', {}, 'Planner visibility'),
      element('small', {}, 'Add native prompt content to History. All off keeps the current packet.'),
    );
    visibility.append(heading);

    const addVisibilityOption = (action, checked, label, description) => {
      const row = element('label', {
        className: 'checkbox_label agape-pr__visibility-option',
        title: description,
      });
      row.append(
        element('input', {
          type: 'checkbox',
          checked,
          dataset: { blockAction: action, blockId: block.id },
        }),
        element('span', { className: 'agape-pr__visibility-copy' }, label),
      );
      visibility.append(row);
    };

    addVisibilityOption(
      'lorebook',
      block.includeLorebook,
      'Triggered lorebook / World Info',
      'World Info that SillyTavern activates for this Send.',
    );
    addVisibilityOption(
      'extension-injections',
      block.includeExtensionInjections,
      'Extension in-chat injections',
      'Content extensions place beside conversation messages.',
    );
    addVisibilityOption(
      'authors-note',
      block.includeAuthorsNote,
      'Author’s note',
      'The note at the position chosen in SillyTavern.',
    );
    options.append(visibility);
    return options;
  }

  function renderArrangement() {
    const arrangement = getActiveArrangement(settings.planner);
    const select = byId('agape-planner-arrangement');
    select.replaceChildren(...settings.planner.arrangements.map(({ name }) => element(
      'option',
      { value: name, selected: name === settings.planner.activeArrangement },
      name,
    )));
    byId('agape-arrangement-delete').disabled = arrangement.name === 'Default';
    const blocks = byId('agape-arrangement-blocks');
    blocks.replaceChildren(...arrangement.blocks.map((block, index) => {
      const row = element('article', {
        className: 'agape-pr__block',
        dataset: { blockId: block.id, enabled: String(block.enabled) },
      });
      row.append(element('span', {
        className: 'agape-pr__drag',
        draggable: true,
        title: 'Drag to reorder',
        ariaHidden: 'true',
      }, '☰'));
      row.append(element('input', {
        className: 'text_pole agape-pr__block-name',
        type: 'text',
        value: block.name,
        ariaLabel: 'Block name',
        dataset: { blockAction: 'name', blockId: block.id },
      }));
      row.append(rolePicker(block), blockTools(block, index, arrangement.blocks.length));
      if (block.kind === 'text') row.append(element('textarea', {
        className: 'text_pole agape-pr__block-body',
        value: block.body,
        spellcheck: false,
        ariaLabel: `${block.name} text`,
        dataset: { blockAction: 'body', blockId: block.id },
      }));
      if (block.slot === 'history') row.append(historyOptions(block));
      return row;
    }));
  }

  byId('agape-planner-response-enabled').checked = settings.enabled;
  byId('agape-planner-prompt').value = settings.plannerPrompt;
  renderStage('planner');
  renderStage('response');
  renderArrangement();
  status.textContent = settings.enabled ? 'Ready' : 'Disabled';

  byId('agape-planner-response-enabled').addEventListener('change', (event) => {
    settings.enabled = event.currentTarget.checked;
    status.textContent = settings.enabled ? 'Ready' : 'Disabled';
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
    byId(`${prefix}-reasoning`).addEventListener('change', (event) => {
      settings[stageName].reasoningLevel = event.currentTarget.value;
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

  byId('agape-response-min-words').addEventListener('change', (event) => {
    settings.response.minWords = event.currentTarget.valueAsNumber;
    persist();
    renderStage('response');
  });
  byId('agape-response-retry-count').addEventListener('change', (event) => {
    settings.response.retryCount = event.currentTarget.valueAsNumber;
    persist();
    renderStage('response');
  });

  const applyPlannerEdit = (edit, { render = true } = {}) => {
    try {
      settings.planner = edit(settings.planner);
      persist();
      if (render) renderArrangement();
    } catch (error) {
      globalThis.toastr?.warning(error.message, 'Planner arrangement');
    }
  };

  byId('agape-planner-arrangement').addEventListener('change', (event) => {
    applyPlannerEdit((planner) => switchArrangement(planner, event.currentTarget.value));
  });
  byId('agape-arrangement-create').addEventListener('click', () => {
    const name = globalThis.prompt?.('Name the new arrangement:');
    if (name !== null && name !== undefined) applyPlannerEdit((planner) => createArrangement(planner, name));
  });
  byId('agape-arrangement-rename').addEventListener('click', () => {
    const name = globalThis.prompt?.('Rename this arrangement:', settings.planner.activeArrangement);
    if (name !== null && name !== undefined) applyPlannerEdit((planner) => renameActiveArrangement(planner, name));
  });
  byId('agape-arrangement-delete').addEventListener('click', () => {
    if (globalThis.confirm?.(`Delete “${settings.planner.activeArrangement}”?`)) {
      applyPlannerEdit(deleteActiveArrangement);
    }
  });
  byId('agape-arrangement-reset').addEventListener('click', () => {
    if (globalThis.confirm?.(`Reset “${settings.planner.activeArrangement}” to the Default block layout?`)) {
      applyPlannerEdit(resetActiveArrangement);
    }
  });
  byId('agape-arrangement-add-text').addEventListener('click', () => {
    const name = globalThis.prompt?.('Name the text block:', 'Text block');
    if (name !== null && name !== undefined) applyPlannerEdit((planner) => addTextBlock(planner, name));
  });

  const blocks = byId('agape-arrangement-blocks');
  blocks.addEventListener('input', (event) => {
    const { blockAction, blockId } = event.target.dataset;
    if (blockAction !== 'body') return;
    applyPlannerEdit(
      (planner) => updateBlock(planner, blockId, { body: event.target.value }),
      { render: false },
    );
  });
  blocks.addEventListener('change', (event) => {
    const { blockAction, blockId } = event.target.dataset;
    if (!blockAction || blockAction === 'body') return;
    const edits = {
      name: { name: event.target.value },
      enabled: { enabled: event.target.checked },
      role: { role: event.target.value },
      'history-mode': { historyMode: event.target.value },
      'history-depth': { historyDepth: event.target.valueAsNumber },
      summaryception: { includeSummaryception: event.target.checked },
      lorebook: { includeLorebook: event.target.checked },
      'extension-injections': { includeExtensionInjections: event.target.checked },
      'authors-note': { includeAuthorsNote: event.target.checked },
    };
    applyPlannerEdit((planner) => updateBlock(planner, blockId, edits[blockAction]));
  });
  blocks.addEventListener('click', (event) => {
    const { blockAction, blockId } = event.target.dataset;
    if (blockAction === 'up') applyPlannerEdit((planner) => moveBlock(planner, blockId, -1));
    if (blockAction === 'down') applyPlannerEdit((planner) => moveBlock(planner, blockId, 1));
    if (blockAction === 'remove' && globalThis.confirm?.('Remove this text block?')) {
      applyPlannerEdit((planner) => removeBlock(planner, blockId));
    }
  });

  let draggedBlockId = '';
  blocks.addEventListener('dragstart', (event) => {
    const row = event.target.closest('.agape-pr__block');
    if (!row) return;
    draggedBlockId = row.dataset.blockId;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
  });
  blocks.addEventListener('dragover', (event) => {
    if (event.target.closest('.agape-pr__block')) event.preventDefault();
  });
  blocks.addEventListener('drop', (event) => {
    const target = event.target.closest('.agape-pr__block');
    if (!target || !draggedBlockId || target.dataset.blockId === draggedBlockId) return;
    event.preventDefault();
    const arrangement = getActiveArrangement(settings.planner);
    const from = arrangement.blocks.findIndex(({ id }) => id === draggedBlockId);
    const to = arrangement.blocks.findIndex(({ id }) => id === target.dataset.blockId);
    applyPlannerEdit((planner) => moveBlock(planner, draggedBlockId, to - from));
  });
  blocks.addEventListener('dragend', () => {
    draggedBlockId = '';
    blocks.querySelector('.is-dragging')?.classList.remove('is-dragging');
  });

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
