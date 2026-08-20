import assert from 'node:assert/strict';
import test from 'node:test';

import { createThrottledUpdater } from '../src/throttled-updater.mjs';

test('stream updates coalesce to the latest value in one scheduled write', async () => {
  const writes = [];
  const timers = [];
  const updater = createThrottledUpdater(async (value) => writes.push(value), {
    setTimer: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimer: () => {},
  });

  updater.schedule('one');
  updater.schedule('one two');
  updater.schedule('one two three');

  assert.equal(timers.length, 1);
  await timers[0]();
  assert.deepEqual(writes, ['one two three']);
});

test('flush writes final content immediately and cancels the pending frame', async () => {
  const writes = [];
  const cleared = [];
  const updater = createThrottledUpdater(async (value) => writes.push(value), {
    setTimer: () => 7,
    clearTimer: (id) => cleared.push(id),
  });

  updater.schedule('partial');
  await updater.flush('complete');

  assert.deepEqual(cleared, [7]);
  assert.deepEqual(writes, ['complete']);
});

test('cancel drops a pending stream write before ownership rollback', async () => {
  const writes = [];
  const cleared = [];
  const updater = createThrottledUpdater(async (value) => writes.push(value), {
    setTimer: () => 11,
    clearTimer: (id) => cleared.push(id),
  });

  updater.schedule('must not write');
  await updater.cancel();

  assert.deepEqual(cleared, [11]);
  assert.deepEqual(writes, []);
});
