import assert from 'node:assert/strict';
import test from 'node:test';

import { clonePromptCollection } from '../src/prompt-collection.mjs';

class HostMessage {
  constructor(content) {
    this.content = content;
    this.role = 'system';
  }
  hostMethod() { return this.content; }
}

class HostCollection {
  constructor(items) { this.collection = items; }
  flatten() { return this.collection; }
}

test('prompt collection clone keeps host prototypes without sharing mutable state', () => {
  const original = new HostCollection([new HostMessage('Preset block')]);
  const cloned = clonePromptCollection(original);

  assert.equal(cloned instanceof HostCollection, true);
  assert.equal(cloned.collection[0] instanceof HostMessage, true);
  assert.equal(cloned.collection[0].hostMethod(), 'Preset block');

  cloned.collection[0].content = 'Squashed copy';
  assert.equal(original.collection[0].content, 'Preset block');
});
