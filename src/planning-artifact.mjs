import { requireVisibleText } from './contracts.mjs';

function normalizedLines(value) {
  return String(value ?? '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function sectionKey(line) {
  return line.replace(/^#{1,6}\s+/u, '').trim();
}

function templateMarkers(template) {
  const lines = normalizedLines(template);
  const headings = lines.filter((line) => /^#{1,6}\s+\S/u.test(line));
  const sections = lines.map(sectionKey)
    .filter((line) => /^(?:PHASE\s+\S+|GATE\s+\d+[.:]?)/iu.test(line));
  return {
    heading: headings[0] ?? null,
    sections,
  };
}

export function requirePlanningArtifact(value, plannerTemplate) {
  const planning = requireVisibleText(value);
  const markers = templateMarkers(plannerTemplate);
  const planningLines = normalizedLines(planning);
  const planningSections = planningLines.map(sectionKey);
  const startsWithHeading = !markers.heading
    || sectionKey(planningLines[0]) === sectionKey(markers.heading);
  let cursor = 0;
  const sectionsInOrder = markers.sections.every((section) => {
    const index = planningSections.indexOf(section, cursor);
    if (index === -1) return false;
    cursor = index + 1;
    return true;
  });
  if (!startsWithHeading || !sectionsInOrder) {
    throw new Error('Planner returned a response instead of the completed Planning template');
  }
  return planning;
}
