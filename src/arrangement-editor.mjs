import { BLOCK_ROLES, DEFAULT_SETTINGS, getActiveArrangement, normalizeSettings } from './settings.mjs';

const clone = (value) => structuredClone(value);

function normalizedPlanner(planner) {
  return normalizeSettings({ planner }).planner;
}

function requireName(value) {
  const name = String(value ?? '').trim();
  if (!name) throw new Error('Arrangement name is required.');
  return name;
}

function activeIndex(planner) {
  return planner.arrangements.findIndex(({ name }) => name === planner.activeArrangement);
}

function editActive(planner, mutate) {
  const next = clone(normalizedPlanner(planner));
  const index = activeIndex(next);
  if (index < 0) throw new Error('The active arrangement is unavailable.');
  mutate(next.arrangements[index], next);
  return normalizedPlanner(next);
}

function findBlock(arrangement, blockId) {
  return arrangement.blocks.find((block) => block.id === blockId);
}

function nextTextId(arrangement) {
  let number = 1;
  while (arrangement.blocks.some(({ id }) => id === `text-${number}`)) number += 1;
  return `text-${number}`;
}

export function createArrangement(planner, requestedName) {
  const next = clone(normalizedPlanner(planner));
  const name = requireName(requestedName);
  if (next.arrangements.some((arrangement) => arrangement.name === name)) {
    throw new Error(`An arrangement named “${name}” already exists.`);
  }
  const arrangement = clone(getActiveArrangement(next) ?? DEFAULT_SETTINGS.planner.arrangements[0]);
  arrangement.name = name;
  next.arrangements.push(arrangement);
  next.activeArrangement = name;
  return normalizedPlanner(next);
}

export function switchArrangement(planner, name) {
  const next = clone(normalizedPlanner(planner));
  if (!next.arrangements.some((arrangement) => arrangement.name === name)) {
    throw new Error('That arrangement does not exist.');
  }
  next.activeArrangement = name;
  return normalizedPlanner(next);
}

export function renameActiveArrangement(planner, requestedName) {
  const name = requireName(requestedName);
  const next = editActive(planner, (arrangement, state) => {
    if (state.arrangements.some((candidate) => candidate !== arrangement && candidate.name === name)) {
      throw new Error(`An arrangement named “${name}” already exists.`);
    }
    arrangement.name = name;
    state.activeArrangement = name;
  });
  next.arrangements.sort((left, right) => Number(right.name === 'Default') - Number(left.name === 'Default'));
  return next;
}

export function deleteActiveArrangement(planner) {
  const next = clone(normalizedPlanner(planner));
  if (next.activeArrangement === 'Default') throw new Error('The Default arrangement cannot be deleted.');
  next.arrangements = next.arrangements.filter(({ name }) => name !== next.activeArrangement);
  next.activeArrangement = 'Default';
  return normalizedPlanner(next);
}

export function resetActiveArrangement(planner) {
  return editActive(planner, (arrangement) => {
    const name = arrangement.name;
    Object.assign(arrangement, clone(DEFAULT_SETTINGS.planner.arrangements[0]), { name });
  });
}

export function addTextBlock(planner, requestedName = 'Text block') {
  const name = requireName(requestedName);
  return editActive(planner, (arrangement) => {
    arrangement.blocks.push({
      id: nextTextId(arrangement),
      kind: 'text',
      name,
      enabled: true,
      order: arrangement.blocks.length,
      role: 'system',
      body: '',
    });
  });
}

export function updateBlock(planner, reference, changes) {
  return editActive(planner, (arrangement) => {
    const block = findBlock(arrangement, reference);
    if (!block) throw new Error('That block does not exist.');
    if (Object.hasOwn(changes, 'name')) changes.name = requireName(changes.name);
    if (Object.hasOwn(changes, 'role') && !BLOCK_ROLES.includes(changes.role)) {
      throw new Error('Choose a valid block role.');
    }
    if (Object.hasOwn(changes, 'historyMode') && !['full', 'depth'].includes(changes.historyMode)) {
      throw new Error('Choose a valid History range.');
    }
    if (block.slot === 'template' && changes.enabled === false) {
      throw new Error('The Planner template cannot be disabled.');
    }
    const allowed = ['name', 'enabled', 'role'];
    if (block.kind === 'text') allowed.push('body');
    if (block.slot === 'history') {
      allowed.push(
        'historyMode',
        'historyDepth',
        'includeSummaryception',
        'includeLorebook',
        'includeExtensionInjections',
        'includeAuthorsNote',
      );
    }
    for (const key of allowed) {
      if (Object.hasOwn(changes, key)) block[key] = changes[key];
    }
    if (block.slot === 'history' && block.historyMode === 'depth') {
      block.includeSummaryception = false;
    }
  });
}

export function moveBlock(planner, reference, offset) {
  return editActive(planner, (arrangement) => {
    const index = arrangement.blocks.findIndex((block) => block.id === reference);
    if (index < 0) throw new Error('That block does not exist.');
    const destination = Math.max(0, Math.min(arrangement.blocks.length - 1, index + Math.trunc(offset)));
    const [block] = arrangement.blocks.splice(index, 1);
    arrangement.blocks.splice(destination, 0, block);
    arrangement.blocks.forEach((candidate, order) => { candidate.order = order; });
  });
}

export function removeBlock(planner, reference) {
  return editActive(planner, (arrangement) => {
    const block = findBlock(arrangement, reference);
    if (!block) throw new Error('That block does not exist.');
    if (block.slot === 'template') throw new Error('The Planner template cannot be removed.');
    if (block.kind !== 'text') throw new Error('Slot blocks cannot be removed.');
    arrangement.blocks = arrangement.blocks.filter((candidate) => candidate !== block);
    arrangement.blocks.forEach((candidate, order) => { candidate.order = order; });
  });
}
