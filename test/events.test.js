// -----------------------------------------------------------------------------
// The scene events of a device between two readings.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, SCENE_TRIGGERS } from '../src/constants.js';
import { alertsOf, deviceEvents, snapshotOf } from '../src/events.js';
import { MINUTE, NOW } from './fixtures/petkit.js';

const feeder = (meals, extra = {}) => ({ family: 'feeder', food: [], meals, ...extra });
const meal = (key, at, amount = 10) => ({ key, at, amount, source: 'plan' });

test('the first reading is history', () => {
  const reading = feeder([meal('a', NOW - MINUTE)], { food: [{ hopper: 0, low: true }] });
  assert.deepEqual(deviceEvents(undefined, reading, NOW), { events: [], stale: [] });
});

test('a new record fires once; an old one first seen is stale', () => {
  const first = feeder([meal('a', NOW - 10 * MINUTE)]);
  const snapshot = snapshotOf(first);
  const next = feeder([...first.meals, meal('b', NOW - MINUTE, 20), meal('c', NOW - 20 * MINUTE)]);
  const { events, stale } = deviceEvents(snapshot, next, NOW);
  assert.deepEqual(events, [
    {
      key: SCENE_TRIGGERS.MEAL_DISPENSED,
      record: 'b',
      at: NOW - MINUTE,
      amount: 20,
      source: 'plan',
    },
  ]);
  assert.deepEqual(
    stale.map((e) => e.record),
    ['c'],
  );
  const again = deviceEvents(snapshotOf(next, snapshot), next, NOW);
  assert.deepEqual(again.events, []);
});

test('the keys survive a reading without records, within a limit', () => {
  const first = snapshotOf(feeder([meal('a', NOW)]));
  const empty = snapshotOf(feeder([]), first);
  assert.ok(empty.seen.has('a'));
  let snapshot = empty;
  for (let i = 0; i < LIMITS.seenKeys + 10; i += 1) {
    snapshot = snapshotOf(feeder([meal(`k${i}`, NOW)]), snapshot);
  }
  assert.equal(snapshot.seen.size, LIMITS.seenKeys);
  assert.ok(!snapshot.seen.has('a'), 'the oldest keys go first');
});

test('visits fire litter_box_used', () => {
  const box = { family: 'litter', visits: [] };
  const visit = { key: 'v', at: NOW, petId: '1', weight: 4000, duration: 60 };
  const { events } = deviceEvents(snapshotOf(box), { ...box, visits: [visit] }, NOW);
  assert.equal(events[0].key, SCENE_TRIGGERS.LITTER_BOX_USED);
  assert.equal(events[0].petId, '1');
});

test('alerts: when a condition starts, not while it lasts', () => {
  assert.deepEqual(
    [
      ...alertsOf({
        family: 'feeder',
        food: [
          { hopper: 1, low: false },
          { hopper: 2, low: true },
        ],
        error: null,
      }),
    ],
    ['low_food'],
  );
  assert.deepEqual(
    [
      ...alertsOf({
        family: 'litter',
        binFull: true,
        litterLow: true,
        deodorizerLow: true,
        error: 'E1',
      }),
    ],
    ['bin_full', 'litter_low', 'deodorizer_low', 'device_error'],
  );
  assert.deepEqual(
    [...alertsOf({ family: 'fountain', waterLow: true, filterWarning: false, filterDays: 0 })],
    ['low_water', 'filter_change'],
  );
  const calm = { family: 'fountain', waterLow: false, filterWarning: false };
  const dry = { ...calm, waterLow: true };
  const s1 = snapshotOf(calm);
  const { events } = deviceEvents(s1, dry, NOW);
  assert.deepEqual(events, [{ key: SCENE_TRIGGERS.ALERT, alert: 'low_water', at: NOW }]);
  assert.deepEqual(deviceEvents(snapshotOf(dry, s1), dry, NOW).events, []);
});
