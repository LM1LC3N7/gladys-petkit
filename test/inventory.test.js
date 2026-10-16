// -----------------------------------------------------------------------------
// PetKit answers -> plain objects.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyFamilies,
  petStats,
  readDevice,
  readFamilies,
  readMeals,
  readVisits,
  workStateOf,
} from '../src/inventory.js';
import {
  D4,
  D4SH,
  FAMILY,
  FELIX,
  K3,
  MINI,
  NALA,
  NOW,
  SHARED,
  T4,
  T6,
  W5,
  W7H,
  ZONE,
  details,
  families,
  records,
  roster,
  sec,
} from './fixtures/petkit.js';

const context = { zone: ZONE, now: NOW };
const base = (id, type, family) => ({ id, type, family, groupId: FAMILY });

test('the family list: devices by family, shared ones, pets, unsupported ones', () => {
  const groups = families();
  assert.deepEqual(emptyFamilies(groups), [SHARED]);
  const account = readFamilies(groups, new Map([[SHARED, roster().devices]]));
  assert.deepEqual(
    account.devices.map((d) => [d.id, d.type, d.family, d.groupId]),
    [
      [D4SH, 'd4sh', 'feeder', FAMILY],
      [D4, 'd4', 'feeder', FAMILY],
      ['400200001', 't4', 'litter', FAMILY],
      ['400300001', 't6', 'litter', FAMILY],
      [W5, 'w5', 'fountain', FAMILY],
      [W7H, 'w7h', 'fountain', FAMILY],
      [MINI, 'feedermini', 'feeder', SHARED],
    ],
  );
  assert.deepEqual(account.skipped, [{ id: K3, type: 'k3' }]);
  assert.deepEqual(account.pets, [
    { id: FELIX, name: 'Felix', groupId: FAMILY },
    { id: NALA, name: 'Nala', groupId: FAMILY },
  ]);
  assert.equal(account.families.get(SHARED).name, 'Shared');
  // A device listed twice (owned and shared) is one device.
  const twice = readFamilies(groups, new Map([[SHARED, [{ id: D4, type: 'd4' }]]]));
  assert.equal(twice.devices.filter((d) => d.id === D4).length, 1);
  assert.deepEqual(readFamilies(null).devices, []);
});

test('a two-hopper feeder: one level and one total per hopper, portions', () => {
  const feeder = readDevice(
    base(D4SH, 'd4sh', 'feeder'),
    { detail: details()[D4SH], records: records()[D4SH] },
    context,
  );
  assert.equal(feeder.name, 'YumShare');
  assert.equal(feeder.unit, 'portions');
  assert.deepEqual(feeder.food, [
    { hopper: 1, low: false },
    { hopper: 2, low: true },
  ]);
  assert.deepEqual(feeder.dispensed, [1, 3]);
  assert.equal(feeder.battery, 100);
  assert.equal(feeder.online, true);
  assert.equal(feeder.error, undefined, 'no error field: no error feature');
  assert.deepEqual(
    feeder.meals.map((m) => [m.key, m.amount, new Date(m.at).toISOString(), m.source]),
    [
      ['20261016:s25200', 1, '2026-10-16T05:00:04.000Z', 'plan'],
      ['20261016:s32400', 1, '2026-10-16T07:00:03.000Z', 'plan'],
    ],
  );
});

test('meals: cancelled, skipped and pending ones are no meals; a missing time comes from the plan', () => {
  const day = (items) => ({ feed: [{ day: 20261016, items }] });
  const done = (extra = {}) => ({ errCode: 0, result: 0, realAmount: 10, ...extra });
  const meals = readMeals(
    'd4',
    day([
      { id: 1, time: 25200, amount: 10, status: 1, state: done() },
      { id: 2, time: 25200, amount: 10, state: { errCode: 10, result: 8 } },
      { id: 3, time: 25200, amount: 10 },
      { id: 4, time: 28800, amount: 10, src: 4, state: done() },
      { id: 5, time: 30000, amount: 15, src: 3, state: done({ realAmount: undefined }) },
    ]),
    ZONE,
  );
  assert.deepEqual(
    meals.map((m) => [m.key, m.amount, new Date(m.at).toISOString(), m.source]),
    [
      ['20261016:4', 10, '2026-10-16T06:00:00.000Z', 'feeder'],
      ['20261016:5', 15, '2026-10-16T06:20:00.000Z', 'app'],
    ],
  );
  // The old Fresh Element answers a bare list of days.
  assert.equal(readMeals('feeder', day([{ id: 9, time: 0, state: done() }]).feed, ZONE).length, 1);
  assert.deepEqual(readMeals('d4', undefined, ZONE), []);
});

test('the D3 says "low" below 2, the others at 0', () => {
  const feeder = (type, food) =>
    readDevice(base('1', type, 'feeder'), { detail: { state: { food } } }, context).food[0].low;
  assert.equal(feeder('d3', 1), true);
  assert.equal(feeder('d3', 2), false);
  assert.equal(feeder('d4', 0), true);
  assert.equal(feeder('d4', 1), false);
  assert.deepEqual(
    readDevice(base('1', 'd4', 'feeder'), { detail: { state: {} } }, context).food,
    [],
  );
});

test('litter box visits: records of a Pura Max, getPetOutGraph of a Purobot', () => {
  assert.deepEqual(readVisits('t4', records()[T4]), [
    {
      key: 'e-t4-2',
      at: Date.parse('2026-10-16T08:30:00Z'),
      petId: FELIX,
      petName: 'Felix',
      weight: 4520,
      duration: 80,
    },
  ]);
  const purobot = readVisits('t6', { list: records()[T6] });
  assert.deepEqual(
    purobot.map((v) => [v.key, v.petId, v.weight, v.duration]),
    [
      ['e-t6-1', NALA, 3870, 85],
      ['e-t6-2', undefined, undefined, 40],
    ],
  );
  const noId = readVisits('t3', [
    { eventType: 10, petId: 0, timestamp: sec('2026-10-16T09:00:00Z'), content: {} },
  ]);
  assert.equal(noId[0].key, `-:${Date.parse('2026-10-16T09:00:00Z')}`);
});

test('a litter box: levels, bin, deodorizer, uses of the day, what it does', () => {
  const t4 = readDevice(
    base(T4, 't4', 'litter'),
    { detail: details()[T4], records: records()[T4] },
    context,
  );
  assert.deepEqual(
    {
      litterPercent: t4.litterPercent,
      litterLow: t4.litterLow,
      binFull: t4.binFull,
      deodorizerDays: t4.deodorizerDays,
      sprayDays: t4.sprayDays,
      deodorizerLow: t4.deodorizerLow,
      usesToday: t4.usesToday,
      workState: t4.workState,
      canDeodorize: t4.canDeodorize,
      error: t4.error,
    },
    {
      litterPercent: 62,
      litterLow: false,
      binFull: false,
      deodorizerDays: 20,
      sprayDays: undefined,
      deodorizerLow: false,
      usesToday: 1,
      workState: 'idle',
      canDeodorize: true,
      error: null,
    },
  );
  const t6 = readDevice(
    base(T6, 't6', 'litter'),
    { detail: details()[T6], records: records()[T6] },
    context,
  );
  assert.equal(t6.usesToday, 3, 'inTimes');
  assert.equal(t6.workState, 'cleaning');
  assert.equal(t6.canDeodorize, false);
  const plainT4 = readDevice(base(T4, 't4', 'litter'), { detail: { state: {} } }, context);
  assert.equal(plainT4.canDeodorize, false, 'a Pura Max without its K3');
  // Yesterday's visits are not today's uses.
  const yesterday = readDevice(
    base(T4, 't4', 'litter'),
    { detail: { state: {} }, records: records()[T4] },
    { zone: ZONE, now: NOW + 86_400_000 },
  );
  assert.equal(yesterday.usesToday, 0);
});

test('work states', () => {
  assert.equal(workStateOf(null), 'idle');
  assert.equal(workStateOf({ workMode: 0, workProcess: 10 }), 'cleaning');
  assert.equal(workStateOf({ workMode: 0, workProcess: 20 }), 'paused');
  assert.equal(workStateOf({ workMode: 1, workProcess: 42 }), 'paused');
  assert.equal(workStateOf({ workMode: 9, workProcess: 10 }), 'maintenance');
  assert.equal(workStateOf({ workMode: 77 }), 'busy');
});

test('fountains: the Bluetooth W5 and the Wi-Fi Eversweet Ultra', () => {
  const w5 = readDevice(base(W5, 'w5', 'fountain'), { detail: details()[W5] }, context);
  assert.deepEqual(
    [w5.ble, w5.waterLow, w5.filterPercent, w5.filterWarning, w5.pumpRunning, w5.online, w5.error],
    [true, false, 86, false, true, undefined, undefined],
  );
  const off = readDevice(
    base(W5, 'w5', 'fountain'),
    { detail: { ...details()[W5], powerStatus: 0, breakdownWarning: 1 } },
    context,
  );
  assert.equal(off.pumpRunning, false);
  assert.equal(off.error, 'breakdown');
  const ctw3 = readDevice(
    base('9', 'ctw3', 'fountain'),
    {
      detail: {
        lackWarning: 1,
        status: { powerStatus: 1, runStatus: 0 },
        electricity: { batteryPercent: 55, batteryVoltage: 3900 },
      },
    },
    context,
  );
  assert.deepEqual([ctw3.waterLow, ctw3.pumpRunning, ctw3.battery], [true, false, 55]);
  const w7h = readDevice(base(W7H, 'w7h', 'fountain'), { detail: details()[W7H] }, context);
  assert.deepEqual(
    [w7h.ble, w7h.waterLow, w7h.pumpRunning, w7h.filterDays, w7h.drinksToday, w7h.wasteFull],
    [false, false, true, 25, 12, false],
  );
  const empty = readDevice(
    base(W7H, 'w7h', 'fountain'),
    { detail: { state: { cwtState: 2, wtState: 2 } } },
    context,
  );
  assert.deepEqual([empty.waterLow, empty.wasteFull], [true, true]);
});

test('per pet: visits of the day, last visit, last weight', () => {
  const pets = [{ id: FELIX }, { id: NALA }];
  const devices = [
    { id: T4, visits: readVisits('t4', records()[T4]) },
    { id: T6, visits: readVisits('t6', records()[T6]) },
    {
      id: '9',
      visits: [
        {
          key: 'x',
          at: Date.parse('2026-10-16T09:30:00Z'),
          petId: FELIX,
          weight: undefined,
          duration: 30,
        },
      ],
    },
  ];
  const stats = petStats(pets, devices, context);
  const felix = stats.get(FELIX);
  assert.equal(felix.visitsToday, 2);
  assert.equal(felix.last.key, 'x');
  assert.equal(felix.weighed.key, 'e-t4-2', 'a visit without weight keeps the last weight');
  assert.equal(felix.weighed.deviceId, T4);
  assert.equal(stats.get(NALA).visitsToday, 1);
});
