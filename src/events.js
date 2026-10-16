// -----------------------------------------------------------------------------
// The scene events of a device (pure): what changed between two readings.
//
// Meals and litter box visits are records with a key: a record not seen in
// the previous readings is new. Alerts are conditions (food low, bin full…):
// one event when a condition starts. The first reading of a device, and a
// record older than TIMINGS.eventMaxAge when first seen (an outage, a
// restart), is history, not news.
// -----------------------------------------------------------------------------

import { LIMITS, SCENE_TRIGGERS, TIMINGS } from './constants.js';

/** The alert conditions a reading shows. */
export function alertsOf(device) {
  const alerts = new Set();
  const add = (alert, condition) => {
    if (condition) {
      alerts.add(alert);
    }
  };
  if (device.family === 'feeder') {
    add(
      'low_food',
      device.food.some((f) => f.low),
    );
  } else if (device.family === 'litter') {
    add('bin_full', device.binFull);
    add('litter_low', device.litterLow);
    add('deodorizer_low', device.deodorizerLow);
  } else {
    add('low_water', device.waterLow);
    add('filter_change', device.filterWarning || device.filterDays === 0);
  }
  add('device_error', typeof device.error === 'string');
  return alerts;
}

const recordsOf = (device) => device.meals ?? device.visits ?? [];

/** What the next comparison needs of a device. */
export function snapshotOf(device, previous) {
  const seen = new Set(previous?.seen);
  for (const record of recordsOf(device)) {
    seen.add(record.key);
  }
  // The oldest keys go first: a day of records is far below the limit.
  const keys = [...seen].slice(-LIMITS.seenKeys);
  return { seen: new Set(keys), alerts: alertsOf(device) };
}

/**
 * The events of a device since its previous snapshot.
 * @returns {{ events: object[], stale: object[] }} `stale`: records too old to fire
 */
export function deviceEvents(previous, device, now) {
  const events = [];
  const stale = [];
  if (!previous) {
    return { events, stale };
  }
  const fresh = (at) => now - at <= TIMINGS.eventMaxAge;
  for (const record of recordsOf(device)) {
    if (previous.seen.has(record.key)) {
      continue;
    }
    const event = {
      ...record,
      record: record.key,
      key:
        device.family === 'feeder' ? SCENE_TRIGGERS.MEAL_DISPENSED : SCENE_TRIGGERS.LITTER_BOX_USED,
    };
    (fresh(record.at) ? events : stale).push(event);
  }
  for (const alert of alertsOf(device)) {
    if (!previous.alerts.has(alert)) {
      events.push({ key: SCENE_TRIGGERS.ALERT, alert, at: now });
    }
  }
  return { events, stale };
}
