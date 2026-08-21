import assert from 'node:assert/strict';
import test from 'node:test';

import { requirePlanningArtifact } from '../src/planning-artifact.mjs';

const maxTemplate = `# Reasoning Protocol

PHASE ALPHA:

GATE 1. Gamestate:
- Fill this gate.

GATE 2. Scope:
- Fill this gate.`;

test('filled MAX structure is accepted as Planning', () => {
  const planning = `## Reasoning Protocol

### PHASE ALPHA:

#### GATE 1. Gamestate:
- Current action and positions filled.

#### GATE 2. Scope:
- Current knowledge filled.`;
  assert.equal(requirePlanningArtifact(planning, maxTemplate), planning);
});

test('partial structure followed by scene prose is rejected', () => {
  assert.throws(() => requirePlanningArtifact(
    '# Reasoning Protocol\n\nPHASE ALPHA:\n\nGATE 1. Gamestate:\nRain silvered the street.',
    maxTemplate,
  ), /response instead of.*Planning/i);
});

test('structured labels must remain in template order', () => {
  assert.throws(() => requirePlanningArtifact(
    '# Reasoning Protocol\n\nGATE 2. Scope:\n- Filled.\n\nPHASE ALPHA:\n\nGATE 1. Gamestate:\n- Filled.',
    maxTemplate,
  ), /response instead of.*Planning/i);
});

test('phase and gate identity survives Markdown and explanatory suffix changes', () => {
  const template = `# Planning

PHASE BETA (IF multiple NPCs are present):

GATE 2. Scope and Awareness:`;
  const output = `## Planning

### PHASE BETA

#### GATE 2. NPC Scope:
- Filled.`;
  assert.equal(requirePlanningArtifact(output, template), output);
});

test('roleplay scene prose is rejected instead of becoming Planning', () => {
  assert.throws(() => requirePlanningArtifact(
    'Rain silvered the street. The courier opened the tavern door.',
    maxTemplate,
  ), /response instead of.*Planning/i);
});

test('unstructured custom templates still accept exact nonblank Planning', () => {
  assert.equal(requirePlanningArtifact('Filled plan', 'Plan the next turn.'), 'Filled plan');
});
