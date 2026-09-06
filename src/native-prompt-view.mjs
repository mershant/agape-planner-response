const CONTENT_KINDS = new Set(['lorebook', 'extension-injection', 'authors-note']);

const nonblank = (value) => typeof value === 'string' && value.trim() !== '';
const children = (value) => Array.isArray(value?.collection) ? value.collection : [];

function leaves(value, rendered = []) {
  for (const item of children(value)) {
    if (children(item).length > 0) leaves(item, rendered);
    else rendered.push(item);
  }
  return rendered;
}

function splitAuthorsNote(assembled, authorContent) {
  if (!nonblank(assembled)) return [];
  if (authorContent === undefined) return [{ kind: 'authors-note', content: assembled }];
  if (!nonblank(authorContent)) return [{ kind: 'lorebook', content: assembled }];

  const index = assembled.indexOf(authorContent);
  if (index < 0) {
    throw new Error('SillyTavern assembled an Author’s Note that could not be separated from lorebook content');
  }

  const before = assembled.slice(0, index).replace(/\n$/, '');
  const after = assembled.slice(index + authorContent.length).replace(/^\n/, '');
  return [
    ...(nonblank(before) ? [{ kind: 'lorebook', content: before }] : []),
    { kind: 'authors-note', content: authorContent },
    ...(nonblank(after) ? [{ kind: 'lorebook', content: after }] : []),
  ];
}

function nativeRow(content, extra = {}) {
  return {
    kind: content.kind,
    ...extra,
    role: content.role,
    content: content.content,
  };
}

function matchesPrefix(key, prefix) {
  return typeof prefix === 'string'
    && prefix !== ''
    && (key === prefix || key.startsWith(`${prefix}_`));
}

export function hostInjectionKind(key, {
  authorsNoteKey,
  lorebookPrefix,
  excludedPrefixes = [],
} = {}) {
  if (typeof key !== 'string' || key === '') return null;
  if (authorsNoteKey && key === authorsNoteKey) return 'authors-note';
  if (matchesPrefix(key, lorebookPrefix)) return 'lorebook';
  if (excludedPrefixes.some((prefix) => matchesPrefix(key, prefix))) return null;
  return 'extension-injection';
}

export function buildNativePromptContent({
  promptCollection,
  injectionSlices = [],
  authorsNoteContent,
  conversationContents = [],
} = {}) {
  const root = children(promptCollection);
  const historyIndex = root.findIndex((item) => item?.identifier === 'chatHistory');
  const unanchored = [];

  root.forEach((branch, branchIndex) => {
    if (branchIndex === historyIndex) return;
    const placement = branchIndex < historyIndex ? 'before-history' : 'after-history';
    for (const item of leaves({ collection: [branch] })) {
      if (!nonblank(item?.content)) continue;
      if (item.identifier === 'worldInfoBefore' || item.identifier === 'worldInfoAfter') {
        unanchored.push({
          kind: 'lorebook',
          placement,
          role: item.role,
          content: item.content,
        });
      }
      if (item.identifier === 'authorsNote') {
        for (const part of splitAuthorsNote(item.content, authorsNoteContent)) {
          unanchored.push({
            ...part,
            placement,
            role: item.role,
          });
        }
      }
    }
  });

  const historyLeaves = historyIndex < 0 ? [] : leaves(root[historyIndex]);
  const conversation = new Set(
    (Array.isArray(conversationContents) ? conversationContents : []).filter(nonblank),
  );
  const anchored = injectionSlices
    .filter((slice) => CONTENT_KINDS.has(slice?.kind)
      && Number.isInteger(slice?.anchorDepth)
      && slice.anchorDepth >= 0
      && nonblank(slice?.content))
    .map((slice, sourceOrder) => {
      for (let messageOrder = 0; messageOrder < historyLeaves.length; messageOrder += 1) {
        const message = historyLeaves[messageOrder];
        if (message?.role !== slice.role || typeof message?.content !== 'string') continue;
        if (conversation.has(message.content)) continue;
        const contentOrder = message.content.indexOf(slice.content);
        if (contentOrder < 0) continue;
        return {
          slice,
          sourceOrder,
          messageOrder,
          contentOrder,
        };
      }
      return null;
    })
    .filter(Boolean)
    .sort((left, right) => left.messageOrder - right.messageOrder
      || left.contentOrder - right.contentOrder
      || left.sourceOrder - right.sourceOrder)
    .map(({ slice }) => nativeRow(slice, { anchorDepth: slice.anchorDepth }));

  return { unanchored, anchored };
}

async function renderSelected({ prompts, entries, selectedKeys, overrides, render, group }) {
  const snapshots = entries.map(([key, prompt]) => [key, prompt, prompt.value]);
  try {
    for (const [key, prompt] of entries) {
      prompt.value = selectedKeys.has(key)
        ? (overrides.has(key) ? overrides.get(key) : prompt.value)
        : '';
    }
    const content = await render(group.position, group.depth, '\n', group.role, false);
    return typeof content === 'string' ? content.trim() : '';
  } finally {
    for (const [, prompt, value] of snapshots) prompt.value = value;
  }
}

export async function collectNativeInjectionSlices({
  prompts,
  inChatPosition,
  authorsNoteKey,
  authorsNoteSource,
  kindForKey,
  render,
  roleName,
} = {}) {
  if (!prompts || typeof prompts !== 'object' || typeof render !== 'function') return [];
  const entries = Object.entries(prompts);
  const groups = new Map();

  for (const [key, prompt] of entries) {
    if (prompt?.position !== inChatPosition || !nonblank(prompt.value)) continue;
    const kind = kindForKey?.(key);
    if (!CONTENT_KINDS.has(kind)) continue;
    const id = `${kind}\u0000${prompt.depth}\u0000${prompt.role}`;
    if (!groups.has(id)) {
      groups.set(id, {
        kind,
        position: prompt.position,
        depth: prompt.depth,
        role: prompt.role,
        keys: [],
      });
    }
    groups.get(id).keys.push(key);
  }

  const slices = [];
  for (const group of groups.values()) {
    if (!Number.isInteger(group.depth) || group.depth < 0) continue;
    const selectedKeys = new Set(group.keys);
    const actual = await renderSelected({
      prompts,
      entries,
      selectedKeys,
      overrides: new Map(),
      render,
      group,
    });
    if (!nonblank(actual)) continue;
    const role = roleName?.(group.role) ?? 'system';

    if (group.kind === 'authors-note' && group.keys.includes(authorsNoteKey)) {
      const overrides = new Map([[authorsNoteKey, String(authorsNoteSource ?? '')]]);
      const authorContent = await renderSelected({
        prompts,
        entries,
        selectedKeys,
        overrides,
        render,
        group,
      });
      for (const part of splitAuthorsNote(actual, authorContent)) {
        slices.push(nativeRow({ ...part, role }, { anchorDepth: group.depth }));
      }
      continue;
    }

    slices.push({
      kind: group.kind,
      anchorDepth: group.depth,
      role,
      content: actual,
    });
  }
  return slices;
}
