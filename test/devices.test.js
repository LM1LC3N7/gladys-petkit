// -----------------------------------------------------------------------------
// The Gladys devices and states of a reading.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  COMMAND_ROLES,
  FEATURES,
  PET_ROLES,
  buildDevices,
  deviceStates,
  errorText,
  parseDeviceId,
  parseFeatureId,
  rolesOf,
} from '../src/devices.js';
import { FEATURE_NAMES, featureName } from '../src/i18n.js';
import { readDevice, readFamilies } from '../src/inventory.js';
import {
  D4,
  D4SH,
  FAMILY,
  NOW,
  T4,
  W5,
  ZONE,
  details,
  families,
  records,
} from './fixtures/petkit.js';

/**
 * The units Gladys accepts per category (DEVICE_FEATURE_UNITS_BY_CATEGORY of
 * server/utils/constants.js, Gladys master 165e0d94): a feature with another
 * unit makes Gladys refuse the whole device list.
 */
const UNITS_BY_CATEGORY = {
  battery: ['percent'],
  'level-sensor': ['mm', 'cm', 'm', 'km', 'inch', 'feet', 'mile', 'percent'],
  maintenance: ['percent'],
  duration: [
    'microseconds',
    'milliseconds',
    'seconds',
    'minutes',
    'hours',
    'days',
    'weeks',
    'months',
  ],
};

const context = { zone: ZONE, now: NOW };

function account() {
  const inventory = readFamilies(families());
  const read = (id) => {
    const base = inventory.devices.find((d) => d.id === id);
    return readDevice(base, { detail: details()[id], records: records()[id] }, context);
  };
  return { ...inventory, devices: inventory.devices.map((d) => read(d.id)) };
}

test('every feature has a name in both languages and a unit Gladys accepts', async () => {
  for (const [role, feature] of Object.entries(FEATURES)) {
    assert.ok(FEATURE_NAMES[role]?.en && FEATURE_NAMES[role]?.fr, `${role} has no name`);
    if (feature.unit) {
      assert.ok(
        UNITS_BY_CATEGORY[feature.category]?.includes(feature.unit),
        `${role}: ${feature.unit} is not a unit of ${feature.category}`,
      );
    }
  }
  for (const role of COMMAND_ROLES) {
    assert.equal(FEATURES[role].read_only, false, role);
    assert.equal(FEATURES[role].category, 'button');
  }
  // The fake Gladys of the SDK checks the categories, types and units.
  const gladys = createFakeGladys();
  await gladys.publishDiscoveredDevices(buildDevices(gladys, account(), new Map(), 'en'));
  assert.equal(
    gladys.fake.discoveredDevices.length,
    8,
    '6 devices (no shared family here), 2 pets',
  );
});

test('amounts carry their unit in their name', () => {
  assert.equal(featureName('dispensed-today', 'en', 'g'), 'Dispensed today (g)');
  assert.equal(featureName('last-meal', 'fr', 'portions'), 'Dernier repas (portions)');
  assert.equal(featureName('food', 'en', 'g'), 'Food level');
});

test('the pets come with a litter box only, with three features', () => {
  const gladys = createFakeGladys();
  const full = account();
  const devices = buildDevices(gladys, full, new Map(), 'fr');
  const felix = devices.find((d) => d.external_id.endsWith(':pet:101401310'));
  assert.equal(felix.name, 'Felix');
  assert.deepEqual(
    felix.features.map((f) => f.external_id.split(':').at(-1)),
    PET_ROLES,
  );
  assert.deepEqual(felix.params, [
    { name: 'family', value: 'Home' },
    { name: 'petkit_id', value: '101401310' },
  ]);
  const noLitter = { ...full, devices: full.devices.filter((d) => d.family !== 'litter') };
  assert.equal(
    buildDevices(gladys, noLitter, new Map(), 'fr').some((d) => d.external_id.includes(':pet:')),
    false,
  );
});

test('a device without a name is named after its model', () => {
  const gladys = createFakeGladys();
  const unnamed = {
    families: new Map(),
    pets: [],
    devices: [readDevice({ id: '5', type: 't6', family: 'litter' }, {}, context)],
  };
  assert.equal(buildDevices(gladys, unnamed, new Map(), 'en')[0].name, 'Purobot Ultra 5');
});

test('the roles seen once stay, so a reading without a field does not drop a feature', () => {
  const gladys = createFakeGladys();
  const full = account();
  const d4 = full.devices.find((d) => d.id === D4);
  const roles = new Map([[D4, [...rolesOf(d4), 'battery']]]);
  const [device] = buildDevices(gladys, { ...full, devices: [d4] }, roles, 'en');
  assert.ok(device.features.some((f) => f.external_id.endsWith(':battery')));
});

test('levels: 0 low, 1 normal, 2 high (a full bin)', () => {
  const gladys = createFakeGladys();
  const ids = gladys.externalIds('device', T4);
  const reading = readDevice(
    { id: T4, type: 't4', family: 'litter', groupId: FAMILY },
    { detail: { state: { sandLack: true, boxFull: true, liquidLack: true } } },
    context,
  );
  const states = Object.fromEntries(
    deviceStates(ids, reading, 'en').map((s) => [
      s.device_feature_external_id.split(':').at(-1),
      s.state ?? s.text,
    ]),
  );
  assert.deepEqual(states, {
    'work-state': 'Idle',
    'litter-low': 0,
    'waste-bin': 2,
    'deodorizer-low': 0,
    'uses-today': 0,
  });
  const fountain = readDevice(
    { id: W5, type: 'w5', family: 'fountain' },
    { detail: details()[W5] },
    context,
  );
  const w5 = deviceStates(gladys.externalIds('device', W5), fountain, 'en');
  assert.deepEqual(
    w5.map((s) => [s.device_feature_external_id.split(':').at(-1), s.state]),
    [
      ['water', 1],
      ['filter', 86],
      ['pump', 1],
    ],
  );
});

test('error texts', () => {
  assert.equal(errorText(null, 'en'), 'No error');
  assert.equal(errorText('breakdown', 'fr'), 'Alerte de panne');
  assert.equal(errorText('Jammed', 'en'), 'Jammed');
  assert.equal(errorText('x'.repeat(300), 'en').length, 200);
});

test('external ids', () => {
  assert.deepEqual(parseFeatureId(`ext:sel:device:${D4SH}:feed-2`), {
    kind: 'device',
    id: D4SH,
    role: 'feed-2',
  });
  assert.deepEqual(parseFeatureId('ext:sel:pet:7:weight'), {
    kind: 'pet',
    id: '7',
    role: 'weight',
  });
  assert.equal(parseFeatureId('ext:sel:other'), undefined);
  assert.deepEqual(parseDeviceId(`ext:sel:device:${D4}`), { kind: 'device', id: D4 });
  assert.equal(parseDeviceId(`ext:sel:device:${D4}:feed`), undefined);
  assert.equal(parseDeviceId(undefined), undefined);
});
