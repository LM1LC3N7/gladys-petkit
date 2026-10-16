// -----------------------------------------------------------------------------
// End to end: the real SDK wiring (src/handlers.js) against the SDK's fake
// Gladys and a fake PetKit cloud behind the transport. Timers and Date are
// mocked: the tests move the clock second by second, like the scheduler sees
// it.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { PetkitApp } from '../src/app.js';
import { accountKey } from '../src/config.js';
import { ACTIONS, SCENE_ACTIONS, SCENE_TRIGGERS } from '../src/constants.js';
import { registerHandlers } from '../src/handlers.js';
import {
  D4,
  D4SH,
  DAY,
  EU,
  FELIX,
  HOUR,
  K3,
  MINI,
  MINUTE,
  NALA,
  NOW,
  PASSWORD,
  T4,
  T6,
  TODAY,
  USERNAME,
  W5,
  W7H,
  ZONE,
  sec,
} from './fixtures/petkit.js';
import { fakePetkit, memoryStore, settle } from './helpers/fakePetkit.js';

const CONFIG = { username: USERNAME, password: PASSWORD, region: 'europe', timezone: ZONE };
const dev = (id) => `ext:test-integration:device:${id}`;
const pet = (id) => `ext:test-integration:pet:${id}`;
const md5 = (text) => createHash('md5').update(text).digest('hex');

async function setup(t, { config = CONFIG, store = memoryStore(), server = fakePetkit() } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: NOW });
  const gladys = createFakeGladys({ config });
  const app = new PetkitApp({
    gladys,
    logger: createLogger({ level: 'silent' }),
    transport: server.transport,
    now: () => Date.now(),
    store,
  });
  registerHandlers(gladys, app);
  await gladys.connect();
  await settle();
  t.after(() => app.stop());
  const advance = async (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
      t.mock.timers.tick(1000);
      await settle();
    }
  };
  return { gladys, app, server, store, advance };
}

const deviceOf = (gladys, id) => gladys.fake.discoveredDevices.find((d) => d.external_id === id);
const featureOf = (gladys, id, role) =>
  deviceOf(gladys, id).features.find((f) => f.external_id === `${id}:${role}`);
const create = async (gladys, ...ids) => {
  for (const id of ids) {
    await gladys.fake.deviceCreated(deviceOf(gladys, id));
  }
  await settle();
};
const createAll = (gladys) =>
  create(gladys, ...gladys.fake.discoveredDevices.map((d) => d.external_id));
const statesOf = (gladys, featureId) =>
  gladys.fake.states.filter((s) => s.device_feature_external_id === featureId);
const last = (gladys, id, role) => gladys.fake.lastState(`${id}:${role}`);
const badgeOf = (gladys, id) =>
  gladys.fake.transports.filter((b) => b.device_external_id === id).at(-1);
const press = (gladys, id, role) =>
  gladys.fake.setValue(deviceOf(gladys, id), featureOf(gladys, id, role), 1);
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((e) => e.key === key);

test('without credentials, the status asks for them and nothing is requested', async (t) => {
  const { gladys, server } = await setup(t, { config: {} });
  assert.equal(server.requests.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /second account added to your family/);
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.fr, /second compte ajouté à votre famille/);
});

test('one sign-in on the server of the region, then the devices and pets in Discovery', async (t) => {
  const { gladys, server, store } = await setup(t);
  const paths = server.requests.map((r) => r.path);
  assert.deepEqual(paths.slice(0, 4), [
    'v1/regionservers',
    'user/login',
    'group/family/list',
    'discovery/device_roster_v2',
  ]);
  const [login] = server.logins();
  assert.equal(login.url, `${EU}user/login`);
  assert.deepEqual(Object.keys(login.form), [
    'oldVersion',
    'client',
    'encrypt',
    'region',
    'username',
    'password',
  ]);
  assert.equal(login.form.region, 'ad', 'the first country of the server, like Home Assistant');
  assert.equal(login.form.password, md5(PASSWORD), 'only the MD5 of the password is sent');
  assert.equal(login.form.encrypt, '1');
  assert.equal(
    login.form.client,
    "{'locale': 'en-US', 'name': '23127PN0CG', 'osVersion': '16.1', 'phoneBrand': 'Xiaomi', 'platform': 'android', 'source': 'app.petkit-android', 'version': '13.2.1', 'timezoneId': 'Europe/Paris', 'timezone': '2.0'}",
  );
  assert.equal(login.headers['X-TimezoneId'], 'Europe/Paris');
  assert.equal(login.headers['X-Timezone'], '2.0');
  assert.equal(login.headers['X-Session'], undefined);
  // The shared family's devices, then every device: its state and its records of the day.
  assert.equal(server.reads('discovery/device_roster_v2')[0].form.day, TODAY);
  const t4Records = server.reads('t4/getDeviceRecord')[0];
  assert.deepEqual(t4Records.query, { date: TODAY, deviceId: T4 });
  assert.equal(server.reads('d4/dailyFeeds')[0].query.days, TODAY);
  assert.equal(server.reads('w5/deviceData')[0].query.id, W5);
  assert.equal(server.reads('t6/getPetOutGraph')[0].query.timestamp, String(NOW / 1000));
  assert.equal(server.reads('k3/device_detail').length, 0, 'the purifier is not read');
  for (const r of server.requests.slice(2)) {
    assert.equal(r.session, 'session-1');
    assert.equal(r.headers['F-Session'], 'session-1');
  }

  const discovered = gladys.fake.discoveredDevices.map((d) => d.external_id);
  assert.deepEqual(discovered, [
    dev(D4SH),
    dev(D4),
    dev(T4),
    dev(T6),
    dev(W5),
    dev(W7H),
    dev(MINI),
    pet(FELIX),
    pet(NALA),
  ]);
  assert.ok(!discovered.includes(dev(K3)));
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, true);
  assert.equal(
    status.message.en,
    'Connected to PetKit: 7 devices, 2 pets. Open Discovery to add them. Session valid until 2026-10-23.',
  );
  assert.equal(store.data.account, accountKey(USERNAME, 'europe'));
  assert.equal(store.data.session.id, 'session-1');
  assert.equal(store.data.session.url, EU);
  assert.equal(store.data.lastLoginAt, NOW);
});

test('the features follow what each device reports', async (t) => {
  const { gladys } = await setup(t);
  const roles = (id) =>
    deviceOf(gladys, id).features.map((f) => f.external_id.slice(id.length + 1));
  assert.deepEqual(roles(dev(D4SH)), [
    'feed-1',
    'feed-2',
    'food-1',
    'food-2',
    'dispensed-today-1',
    'dispensed-today-2',
    'last-meal',
    'desiccant',
    'battery',
    'online',
  ]);
  assert.deepEqual(roles(dev(D4)), [
    'feed',
    'food',
    'food-left',
    'dispensed-today',
    'last-meal',
    'desiccant',
    'error',
    'online',
  ]);
  assert.deepEqual(roles(dev(T4)), [
    'clean',
    'deodorize',
    'work-state',
    'litter-level',
    'litter-low',
    'waste-bin',
    'deodorizer-days',
    'deodorizer-low',
    'uses-today',
    'last-used-by',
    'error',
    'online',
  ]);
  assert.deepEqual(roles(dev(T6)), [
    'clean',
    'work-state',
    'litter-level',
    'waste-bin',
    'spray-days',
    'uses-today',
    'last-used-by',
    'online',
  ]);
  assert.deepEqual(roles(dev(W5)), ['water', 'filter', 'pump']);
  assert.deepEqual(roles(dev(W7H)), [
    'water',
    'filter-days',
    'pump',
    'drinks-today',
    'waste-tank',
    'online',
  ]);
  assert.deepEqual(roles(pet(FELIX)), ['weight', 'visit-duration', 'visits-today']);
  const feed = featureOf(gladys, dev(D4SH), 'feed-2');
  assert.equal(feed.name, 'Distribuer une portion, réservoir 2');
  assert.equal(feed.read_only, false);
  assert.equal(featureOf(gladys, dev(D4SH), 'dispensed-today-1').name.endsWith('(portions)'), true);
  assert.equal(featureOf(gladys, dev(D4), 'last-meal').name, 'Dernier repas (g)');
  const params = Object.fromEntries(
    deviceOf(gladys, dev(MINI)).params.map((p) => [p.name, p.value]),
  );
  assert.deepEqual(params, {
    family: 'Shared',
    model: 'feedermini',
    serial_number: '20230101M00001',
    firmware: '600',
    petkit_id: MINI,
  });
});

test('created devices get their values, dated ones with their time, and their badges', async (t) => {
  const { gladys } = await setup(t);
  await createAll(gladys);
  // Feeders: hopper 2 empty, the last meal dated with its completion.
  assert.equal(last(gladys, dev(D4SH), 'food-1'), 1);
  assert.equal(last(gladys, dev(D4SH), 'food-2'), 0);
  assert.equal(last(gladys, dev(D4SH), 'dispensed-today-2'), 3);
  assert.equal(last(gladys, dev(D4SH), 'battery'), 100);
  const [meal] = statesOf(gladys, `${dev(D4SH)}:last-meal`);
  assert.deepEqual([meal.state, meal.created_at], [1, '2026-10-16T07:00:03.000Z']);
  assert.equal(last(gladys, dev(D4), 'food-left'), 64);
  assert.equal(last(gladys, dev(D4), 'error'), 'Aucune erreur');
  assert.equal(statesOf(gladys, `${dev(D4)}:last-meal`)[0].created_at, '2026-10-16T06:00:01.000Z');
  assert.equal(last(gladys, dev(MINI), 'food'), 0, 'the Mini is empty');
  assert.equal(last(gladys, dev(MINI), 'battery'), 50);
  assert.equal(statesOf(gladys, `${dev(MINI)}:last-meal`).length, 0, 'a skipped meal is no meal');
  // Litter boxes.
  assert.equal(last(gladys, dev(T4), 'litter-level'), 62);
  assert.equal(last(gladys, dev(T4), 'waste-bin'), 1);
  assert.equal(last(gladys, dev(T4), 'uses-today'), 1);
  assert.equal(last(gladys, dev(T4), 'work-state'), 'En attente');
  assert.equal(last(gladys, dev(T4), 'last-used-by'), 'Felix');
  assert.equal(last(gladys, dev(T6), 'waste-bin'), 2, 'a full bin reads high');
  assert.equal(last(gladys, dev(T6), 'uses-today'), 3, 'inTimes when PetKit counts');
  assert.equal(last(gladys, dev(T6), 'work-state'), 'Nettoyage');
  assert.equal(last(gladys, dev(T6), 'last-used-by'), 'Animal inconnu');
  // Fountains.
  assert.equal(last(gladys, dev(W5), 'water'), 1);
  assert.equal(last(gladys, dev(W5), 'filter'), 86);
  assert.equal(last(gladys, dev(W5), 'pump'), 1);
  assert.equal(last(gladys, dev(W7H), 'drinks-today'), 12);
  assert.equal(last(gladys, dev(W7H), 'filter-days'), 25);
  // Pets: the weight of their last visit, in kg.
  const [weight] = statesOf(gladys, `${pet(FELIX)}:weight`);
  assert.deepEqual([weight.state, weight.created_at], [4.52, '2026-10-16T08:30:00.000Z']);
  assert.equal(last(gladys, pet(FELIX), 'visit-duration'), 80);
  assert.equal(last(gladys, pet(NALA), 'weight'), 3.87);
  assert.equal(last(gladys, pet(NALA), 'visits-today'), 1);
  // Badges.
  assert.equal(badgeOf(gladys, dev(D4)).transport, DEVICE_TRANSPORTS.CLOUD);
  assert.equal(badgeOf(gladys, pet(FELIX)).transport, DEVICE_TRANSPORTS.CLOUD);
});

test('one read per interval with the same session, the device list every 30 minutes', async (t) => {
  const { server, advance } = await setup(t);
  await advance(2 * MINUTE);
  assert.equal(server.reads('d4/device_detail').length, 2);
  assert.equal(server.reads('group/family/list').length, 1);
  await advance(30 * MINUTE);
  assert.equal(server.reads('d4/device_detail').length, 17);
  assert.equal(server.reads('group/family/list').length, 2);
  assert.equal(server.logins().length, 1);
});

test('a restart reuses the session of the same account, not of another one', async (t) => {
  const server = fakePetkit();
  const id = server.issue();
  const session = { id, url: EU, country: 'AD', loggedInAt: NOW - HOUR, expiresAt: NOW + DAY };
  const store = memoryStore({
    account: accountKey(USERNAME, 'europe'),
    session,
    lastLoginAt: NOW - HOUR,
  });
  const { gladys } = await setup(t, { server, store });
  assert.equal(server.logins().length, 0);
  assert.equal(server.reads('group/family/list')[0].session, id);
  assert.equal(gladys.fake.connectionStatus.connected, true);

  t.mock.timers.reset();
  const other = fakePetkit();
  const foreign = memoryStore({ account: accountKey('else@example.com', 'europe'), session });
  await setup(t, { server: other, store: foreign });
  assert.equal(other.logins().length, 1, 'the session of another account is not used');
});

test('the events of the next readings: meals, visits, alerts; nothing for the first reading', async (t) => {
  const { gladys, server, advance } = await setup(t);
  await createAll(gladys);
  assert.deepEqual(gladys.fake.sceneEvents, [], 'the first reading is history');

  // 12:01 Paris: the D4 lunch, Nala in the Pura Max, its bin full, the W5 dry.
  server.records[D4].feed[0].items[1].state = {
    errCode: 0,
    result: 0,
    realAmount: 20,
    completedAt: '2026-10-16T10:00:30.000+0000',
  };
  server.records[T4].push({
    eventId: 'e-t4-3',
    eventType: 10,
    petId: Number(NALA),
    petName: 'Nala',
    timestamp: sec('2026-10-16T10:01:00Z'),
    content: {
      petWeight: 3900,
      timeIn: sec('2026-10-16T10:00:10Z'),
      timeOut: sec('2026-10-16T10:01:00Z'),
    },
  });
  server.details[T4].state.boxFull = true;
  server.details[W5].lackWarning = 1;
  await advance(2 * MINUTE);

  const [meal] = eventsOf(gladys, SCENE_TRIGGERS.MEAL_DISPENSED);
  assert.deepEqual(meal.data, {
    feeder: dev(D4),
    feeder_name: 'Solo',
    amount: 20,
    unit: 'g',
    source: 'plan',
    at: '2026-10-16T10:00:30.000Z',
  });
  const [visit] = eventsOf(gladys, SCENE_TRIGGERS.LITTER_BOX_USED);
  assert.deepEqual(visit.data, {
    litter_box: dev(T4),
    pet: pet(NALA),
    litter_box_name: 'Pura Max',
    pet_name: 'Nala',
    weight: 3.9,
    duration: 50,
    at: '2026-10-16T10:01:00.000Z',
  });
  const alerts = eventsOf(gladys, SCENE_TRIGGERS.ALERT).map((e) => e.data);
  assert.deepEqual(alerts, [
    { device: dev(T4), alert: 'bin_full', device_name: 'Pura Max', message: 'Bac à déchets plein' },
    { device: dev(W5), alert: 'low_water', device_name: 'Fountain', message: "Manque d'eau" },
  ]);
  assert.equal(last(gladys, dev(T4), 'last-used-by'), 'Nala');
  assert.equal(last(gladys, pet(NALA), 'weight'), 3.9);
  assert.equal(last(gladys, dev(W5), 'water'), 0);
  // The same records again: no new event; a condition that lasts fires once.
  await advance(2 * MINUTE);
  assert.equal(gladys.fake.sceneEvents.length, 4);
  // The bin emptied, then full again: a new alert.
  server.details[T4].state.boxFull = false;
  await advance(2 * MINUTE);
  server.details[T4].state.boxFull = true;
  await advance(2 * MINUTE);
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.ALERT).length, 3);
});

test('a record first seen long after it happened is not fired', async (t) => {
  const { gladys, server, advance } = await setup(t);
  // A meal of 07:30 Paris that PetKit only reports now (an outage).
  server.records[D4].feed[0].items.push({
    id: 's19800',
    time: 19800,
    amount: 10,
    src: 1,
    status: 2,
    state: { errCode: 0, result: 0, realAmount: 10, completedAt: sec('2026-10-16T05:30:00Z') },
  });
  await advance(2 * MINUTE);
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.MEAL_DISPENSED).length, 0);
});

test('the feed buttons dispense the smallest amount; the meal they cause fires no event', async (t) => {
  const { gladys, server, advance } = await setup(t);
  await createAll(gladys);
  assert.deepEqual(await press(gladys, dev(D4), 'feed'), { success: true });
  assert.deepEqual(await press(gladys, dev(D4SH), 'feed-2'), { success: true });
  const [solo, dual] = server.commands();
  assert.equal(solo.url, `${EU}d4/saveDailyFeed`);
  assert.deepEqual(solo.form, { day: TODAY, deviceId: D4, name: '', time: '-1', amount: '10' });
  assert.deepEqual(dual.form, {
    day: TODAY,
    deviceId: D4SH,
    name: '',
    time: '-1',
    amount1: '0',
    amount2: '1',
  });
  // The D4 reports the manual meal ("app"), then a meal of its plan.
  server.records[D4].feed[0].items.push({
    id: 'm1',
    time: -1,
    amount: 10,
    src: 3,
    status: 0,
    state: { errCode: 0, result: 0, realAmount: 10, completedAt: sec('2026-10-16T10:00:05Z') },
  });
  await advance(16_000);
  assert.equal(server.reads('d4/device_detail').length, 2, 'a read soon after the command');
  assert.equal(eventsOf(gladys, SCENE_TRIGGERS.MEAL_DISPENSED).length, 0);
  assert.equal(last(gladys, dev(D4), 'last-meal'), 10, 'the meal is still the last meal');
  server.records[D4].feed[0].items.push({
    id: 'm2',
    time: -1,
    amount: 20,
    src: 3,
    status: 0,
    state: { errCode: 0, result: 0, realAmount: 20, completedAt: sec('2026-10-16T10:01:00Z') },
  });
  await advance(2 * MINUTE);
  assert.equal(
    eventsOf(gladys, SCENE_TRIGGERS.MEAL_DISPENSED).length,
    1,
    'only one echo per command',
  );
});

test('the Mini and the Fresh Element use the old snake_case feeding call', async (t) => {
  const { gladys, server } = await setup(t);
  await createAll(gladys);
  await press(gladys, dev(MINI), 'feed');
  assert.equal(server.commands()[0].url, `${EU}feedermini/save_dailyfeed`);
  assert.equal(server.commands()[0].form.amount, '5');
});

test('the Feed scene action: amount checked against the feeder, hopper chosen', async (t) => {
  const { gladys, server } = await setup(t);
  await createAll(gladys);
  const ok = await gladys.fake.sceneAction(SCENE_ACTIONS.FEED, {
    feeder: dev(D4),
    amount: 30,
    hopper: '1',
  });
  assert.deepEqual(ok, { success: true, data: { outputs: { amount: 30, unit: 'g' } } });
  assert.equal(server.commands().at(-1).form.amount, '30');
  const dual = await gladys.fake.sceneAction(SCENE_ACTIONS.FEED, {
    feeder: dev(D4SH),
    amount: 3,
    hopper: '2',
  });
  assert.equal(dual.success, true);
  assert.deepEqual(
    [server.commands().at(-1).form.amount1, server.commands().at(-1).form.amount2],
    ['0', '3'],
  );
  const bad = await gladys.fake.sceneAction(SCENE_ACTIONS.FEED, { feeder: dev(D4), amount: 15 });
  assert.equal(bad.success, false);
  assert.match(bad.error, /10, 20, 30, 40, 50 grammes/);
  const notFeeder = await gladys.fake.sceneAction(SCENE_ACTIONS.FEED, {
    feeder: dev(T4),
    amount: 10,
  });
  assert.equal(notFeeder.success, false);
  assert.match(notFeeder.error, /pas un distributeur/);
  assert.equal(server.commands().length, 2);
});

test('clean and deodorize start the litter box actions', async (t) => {
  const { gladys, server } = await setup(t);
  await createAll(gladys);
  assert.deepEqual(await press(gladys, dev(T6), 'clean'), { success: true });
  assert.deepEqual(await press(gladys, dev(T4), 'deodorize'), { success: true });
  const [clean, deodorize] = server.commands();
  assert.equal(clean.url, `${EU}t6/controlDevice`);
  assert.deepEqual(clean.form, { id: T6, kv: '{"start_action": 0}', type: 'start' });
  assert.deepEqual(deodorize.form, { id: T4, kv: '{"start_action": 2}', type: 'start' });
  // A command PetKit refuses: the ack carries its message.
  server.queue.push({
    match: (r) => r.path === 't4/controlDevice',
    answer: {
      status: 200,
      headers: {},
      body: JSON.stringify({ error: { code: 1201, msg: 'Device is working' } }),
    },
  });
  const refused = await press(gladys, dev(T4), 'clean');
  assert.equal(refused.success, false);
  assert.match(refused.error, /Device is working \(PetKit code 1201\)/);
  // A sensor is not a command.
  const sensor = await gladys.fake.setValue(
    deviceOf(gladys, dev(T4)),
    featureOf(gladys, dev(T4), 'litter-level'),
    1,
  );
  assert.equal(sensor.success, false);
});

test('a refused password stops the sign-ins until the configuration changes or the test button', async (t) => {
  const { gladys, server, advance } = await setup(t, {
    config: { ...CONFIG, password: 'wrong' },
  });
  assert.equal(server.logins().length, 1);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the e-mail or password/);
  await advance(30 * MINUTE);
  assert.equal(server.logins().length, 1, 'never retried by itself');
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(server.logins().length, 2, 'the button tries once');
  assert.match(ack.data.message.en, /refused/);
  await gladys.fake.configUpdated(CONFIG);
  await settle();
  assert.equal(server.logins().length, 3);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('an account on another server: the status says to check the server', async (t) => {
  const server = fakePetkit();
  server.username = 'someone-else@example.com';
  const { gladys } = await setup(t, { server });
  assert.match(gladys.fake.connectionStatus.message.fr, /serveur Europe/);
});

test('a session closed by the PetKit app: no sign-in before 15 minutes, then a stop', async (t) => {
  const { gladys, server, advance } = await setup(t);
  server.kick(); // the user opens the PetKit app with the same account
  await advance(2 * MINUTE);
  assert.equal(server.logins().length, 1, 'no sign-in right away');
  assert.match(gladys.fake.connectionStatus.message.en, /signed in to the PetKit app too/);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  await advance(10 * MINUTE);
  assert.equal(server.logins().length, 1);
  await advance(5 * MINUTE);
  assert.equal(server.logins().length, 2, 'one sign-in 15 minutes after the previous one');
  assert.equal(gladys.fake.connectionStatus.connected, true);
  server.kick();
  await advance(30 * MINUTE);
  assert.equal(server.logins().length, 2, 'closed again: it waits for the user');
  assert.match(gladys.fake.connectionStatus.message.en, /keeps closing the session/);
  await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(server.logins().length, 3);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('an old session closed by PetKit: one sign-in and the read goes on', async (t) => {
  const { gladys, server, advance } = await setup(t);
  await advance(40 * MINUTE);
  server.kick();
  await advance(2 * MINUTE);
  assert.equal(server.logins().length, 2);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a session about to expire is renewed before its end', async (t) => {
  const server = fakePetkit({ lifetime: 2 * HOUR });
  const { advance } = await setup(t, { server });
  await advance(58 * MINUTE);
  assert.equal(server.logins().length, 1);
  await advance(4 * MINUTE);
  assert.equal(server.logins().length, 2);
});

test('PetKit unreachable: backoff, unreachable badges, then back', async (t) => {
  const { gladys, server, advance } = await setup(t);
  await createAll(gladys);
  server.down = true;
  await advance(2 * MINUTE);
  assert.match(gladys.fake.connectionStatus.message.en, /cannot be reached \(connection refused\)/);
  assert.equal(badgeOf(gladys, dev(D4)).transport, DEVICE_TRANSPORTS.UNREACHABLE);
  const tries = server.requests.length;
  await advance(MINUTE);
  assert.equal(server.requests.length, tries, 'paused');
  server.down = false;
  await advance(3 * MINUTE);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(badgeOf(gladys, dev(D4)).transport, DEVICE_TRANSPORTS.CLOUD);
});

test('PetKit busy: a pause of 5 minutes', async (t) => {
  const { gladys, server, advance } = await setup(t);
  server.queue.push({
    match: (r) => r.path === 'd4/device_detail',
    answer: { status: 200, headers: {}, body: '{"error":{"code":1,"msg":"busy"}}' },
  });
  await advance(2 * MINUTE);
  assert.match(gladys.fake.connectionStatus.message.en, /busy: pausing for 5 min/);
  const before = server.reads('d4/device_detail').length;
  await advance(4 * MINUTE);
  assert.equal(server.reads('d4/device_detail').length, before);
  await advance(2 * MINUTE);
  assert.ok(server.reads('d4/device_detail').length > before);
});

test('a device PetKit no longer knows: the others go on, its badge is unreachable', async (t) => {
  const { gladys, server, advance } = await setup(t);
  await createAll(gladys);
  delete server.details[W7H];
  server.details[D4].state.percent = 40;
  await advance(2 * MINUTE);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(badgeOf(gladys, dev(W7H)).transport, DEVICE_TRANSPORTS.UNREACHABLE);
  assert.equal(last(gladys, dev(D4), 'food-left'), 40);
});

test('a device PetKit reports offline gets a degraded badge', async (t) => {
  const server = fakePetkit();
  server.details[T6].state.pim = 0;
  const { gladys } = await setup(t, { server });
  await createAll(gladys);
  const badge = badgeOf(gladys, dev(T6));
  assert.equal(badge.transport, DEVICE_TRANSPORTS.UNREACHABLE);
  assert.equal(badge.degraded, true);
  assert.match(badge.message.fr, /hors ligne/);
  assert.equal(last(gladys, dev(T6), 'online'), 0);
});

test('the language renames the features; the interval reschedules', async (t) => {
  const { gladys, server, advance } = await setup(t);
  await gladys.fake.configUpdated({ ...CONFIG, language: 'en', poll_interval: 600 });
  await settle();
  assert.equal(featureOf(gladys, dev(T4), 'clean').name, 'Clean now');
  assert.equal(server.logins().length, 1, 'the account did not change');
  const reads = server.reads('d4/device_detail').length;
  await advance(5 * MINUTE);
  assert.equal(server.reads('d4/device_detail').length, reads);
  await advance(5 * MINUTE);
  assert.equal(server.reads('d4/device_detail').length, reads + 1);
});

test('Test the connection: a summary, then a cooldown', async (t) => {
  const { gladys } = await setup(t);
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(ack.data.message.en, /^Server Europe: 2 families, 7 devices, 2 pets\./);
  assert.match(ack.data.message.en, /Pura Max \(t4\)\./);
  assert.match(ack.data.message.en, /1 device not supported yet\./);
  assert.match(ack.data.message.fr, /Session valable jusqu'au 2026-10-23\./);
  const again = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(again.data.message.en, /^Already read less than 30 seconds ago/);
});

test('a Gladys reconnection resends the Discovery list and the status without reading PetKit', async (t) => {
  const { gladys, server } = await setup(t);
  const requests = server.requests.length;
  const published = () =>
    gladys.fake.requests.filter((r) => r.method === 'POST' && /discover/.test(r.path)).length;
  const before = published();
  await gladys.disconnect();
  await gladys.connect();
  await settle();
  assert.equal(server.requests.length, requests);
  assert.equal(published(), before + 1);
  assert.equal(gladys.fake.discoveredDevices.length, 9);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('an account without litter box gets no pet devices', async (t) => {
  const server = fakePetkit();
  server.families[0].deviceList = server.families[0].deviceList.filter(
    (d) => !d.deviceType.startsWith('t'),
  );
  const { gladys } = await setup(t, { server });
  assert.equal(
    gladys.fake.discoveredDevices.some((d) => d.external_id.includes(':pet:')),
    false,
  );
  assert.match(gladys.fake.connectionStatus.message.en, /5 devices, 0 pets/);
});
