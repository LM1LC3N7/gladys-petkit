// -----------------------------------------------------------------------------
// Time zones: the offsets PetKit wants, its days and its dates.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayOf,
  offsetHours,
  offsetText,
  parseInstant,
  validZone,
  zonedInstant,
} from '../src/clock.js';

test('offsets as the PetKit app sends them', () => {
  assert.equal(offsetHours('Europe/Paris', Date.parse('2026-07-01T12:00:00Z')), 2);
  assert.equal(offsetHours('Europe/Paris', Date.parse('2026-12-01T12:00:00Z')), 1);
  assert.equal(offsetText('Europe/Paris', Date.parse('2026-12-01T12:00:00Z')), '1.0');
  assert.equal(offsetText('Asia/Kolkata', Date.parse('2026-12-01T12:00:00Z')), '5.5');
  assert.equal(offsetText('America/St_Johns', Date.parse('2026-12-01T12:00:00Z')), '-3.5');
  assert.equal(offsetText('UTC', Date.parse('2026-12-01T12:00:00Z')), '0.0');
});

test('the day of an instant in a zone', () => {
  const lateEvening = Date.parse('2026-10-16T22:30:00Z');
  assert.equal(dayOf(lateEvening, 'UTC'), '20261016');
  assert.equal(dayOf(lateEvening, 'Europe/Paris'), '20261017');
  assert.equal(dayOf(lateEvening, 'America/New_York'), '20261016');
});

test('a wall-clock time of a zone, across the change of time', () => {
  // 07:00 in Paris, summer then winter time (the change is on 2026-10-25).
  assert.equal(
    zonedInstant('20261016', 7 * 3600, 'Europe/Paris'),
    Date.parse('2026-10-16T05:00:00Z'),
  );
  assert.equal(
    zonedInstant('20261026', 7 * 3600, 'Europe/Paris'),
    Date.parse('2026-10-26T06:00:00Z'),
  );
  assert.equal(
    zonedInstant('20261025', 3 * 3600, 'Europe/Paris'),
    Date.parse('2026-10-25T02:00:00Z'),
  );
  assert.equal(zonedInstant('2026-10-16', 0, 'UTC'), undefined);
  assert.equal(zonedInstant('20261016', undefined, 'UTC'), undefined);
});

test('the instants PetKit writes', () => {
  const at = Date.parse('2026-10-16T05:00:03Z');
  assert.equal(parseInstant(at / 1000), at, 'epoch seconds');
  assert.equal(parseInstant(String(at / 1000)), at, 'epoch seconds as text');
  assert.equal(parseInstant(at), at, 'epoch milliseconds');
  assert.equal(parseInstant('2026-10-16T05:00:03.000+0000'), at, 'offset without its colon');
  assert.equal(parseInstant('2026-10-16T07:00:03.000+02:00'), at);
  for (const nothing of [undefined, null, '', 0, -1, '-1', 'soon']) {
    assert.equal(parseInstant(nothing), undefined, String(nothing));
  }
});

test('zone names', () => {
  assert.equal(validZone('Europe/Paris'), true);
  assert.equal(validZone('Mars/Olympus'), false);
  assert.equal(validZone(''), false);
  assert.equal(validZone("Europe/Paris'"), false, 'never a quote in the login client field');
});
