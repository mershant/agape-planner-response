import assert from 'node:assert/strict';
import test from 'node:test';

import { balanceStreamingMarkdown } from '../src/streaming-markdown.mjs';

test('streaming Markdown temporarily closes unmatched native markers', () => {
  assert.equal(balanceStreamingMarkdown('*Emphasis'), '*Emphasis*');
  assert.equal(balanceStreamingMarkdown('"Speech'), '"Speech"');
  assert.equal(balanceStreamingMarkdown('```js\nconst x = 1;'), '```js\nconst x = 1;\n```');
  assert.equal(balanceStreamingMarkdown('~~~text'), '~~~text\n~~~');
});

test('complete Markdown is unchanged', () => {
  assert.equal(balanceStreamingMarkdown('**Bold** and "speech"'), '**Bold** and "speech"');
});
