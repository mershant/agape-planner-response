import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings.mjs';

test('settings default each stage to the current connection profile model', () => {
  assert.deepEqual(normalizeSettings(), DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.enabled, false);
  assert.equal(DEFAULT_SETTINGS.planner.source, 'profile');
  assert.equal(DEFAULT_SETTINGS.planner.profileId, '');
  assert.equal(DEFAULT_SETTINGS.planner.model, '');
  assert.equal(DEFAULT_SETTINGS.response.source, 'profile');
  assert.equal(DEFAULT_SETTINGS.response.profileId, '');
  assert.equal(DEFAULT_SETTINGS.response.model, '');
});

test('settings preserve literal Planner text and never persist raw API keys', () => {
  const settings = normalizeSettings({
    enabled: false,
    plannerPrompt: '  {{getvar::scene}}\n{{roll::1d20}}  ',
    planner: {
      source: 'custom',
      customUrl: ' https://planner.example/v1 ',
      secretId: 'planner-secret',
      apiKey: 'must-not-survive',
      model: 'planner-model',
    },
    response: {
      source: 'custom',
      customUrl: 'https://response.example/v1',
      secretId: 'response-secret',
      apiKey: 'must-not-survive-either',
      model: 'response-model',
    },
  });

  assert.equal(settings.enabled, false);
  assert.equal(settings.plannerPrompt, '  {{getvar::scene}}\n{{roll::1d20}}  ');
  assert.equal(settings.planner.customUrl, 'https://planner.example/v1');
  assert.equal(settings.response.customUrl, 'https://response.example/v1');
  assert.equal(Object.hasOwn(settings.planner, 'apiKey'), false);
  assert.equal(Object.hasOwn(settings.response, 'apiKey'), false);
});

test('unknown source values return to connection profile mode', () => {
  const settings = normalizeSettings({
    planner: { source: 'mystery' },
    response: { source: 'mystery' },
  });

  assert.equal(settings.planner.source, 'profile');
  assert.equal(settings.response.source, 'profile');
});
