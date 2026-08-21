function countOccurrences(value, marker) {
  if (!marker) return 0;
  return value.split(marker).length - 1;
}

export function balanceStreamingMarkdown(value) {
  let text = String(value ?? '');
  for (const marker of ['*', '"', '```', '~~~']) {
    if (countOccurrences(text, marker) % 2 === 0) continue;
    const separator = marker.length > 1 ? '\n' : '';
    text = `${text.trimEnd()}${separator}${marker}`;
  }
  return text;
}
