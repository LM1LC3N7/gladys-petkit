// -----------------------------------------------------------------------------
// The account client: the server of each region, the session, the rationing
// of the sign-ins, and the requests of the commands.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PetkitClient, sessionOf } from '../src/client.js';
import { CHINA_URL, TIMINGS } from '../src/constants.js';
import { DAY, EU, HOUR, MINUTE, NOW, PASSWORD, USERNAME, ZONE } from './fixtures/petkit.js';
import { fakePetkit } from './helpers/fakePetkit.js';

function client({ server = fakePetkit(), region = 'europe', lastLoginAt, allowLogin = true } = {}) {
  let now = NOW;
  const saved = [];
  const petkit = new PetkitClient({
    transport: server.transport,
    now: () => now,
    onSession: (state) => saved.push(structuredClone(state)),
  });
  petkit.configure({
    username: USERNAME,
    password: PASSWORD,
    region,
    timezone: ZONE,
    lastLoginAt,
    allowLogin,
  });
  return { petkit, server, saved, advance: (ms) => (now += ms) };
}

test('the server of each region comes from the public list', async () => {
  const cases = [
    ['europe', EU, 'ad'],
    ['international', 'https://api.petkt.com/latest/', 'ag'],
    ['asia', 'https://api.petktasia.com/latest/', 'ae'],
    ['russia', 'https://api-ru.petkit.cn/latest/', 'ru'],
  ];
  for (const [region, url, country] of cases) {
    const { petkit, server } = client({ region });
    await petkit.login();
    const [login] = server.logins();
    assert.equal(login.url, `${url}user/login`, region);
    assert.equal(login.form.region, country, region);
  }
});

test('China is reached directly; a list that cannot be read falls back to the known server', async () => {
  const china = client({ region: 'china' });
  await china.petkit.login();
  assert.deepEqual(
    china.server.requests.map((r) => r.url),
    [`${CHINA_URL}user/login`],
  );
  assert.equal(china.server.logins()[0].form.region, 'cn');

  const { petkit, server } = client();
  server.queue.push({
    match: (r) => r.path === 'v1/regionservers',
    answer: { status: 503, headers: {}, body: '' },
  });
  await petkit.login();
  assert.equal(server.logins()[0].url, `${EU}user/login`);
  assert.equal(server.logins()[0].form.region, 'ad');
});

test('the session: its id in both headers, its expiry from createdAt and expiresIn', async () => {
  const { petkit, server, saved } = client();
  const session = await petkit.login();
  assert.equal(session.id, 'session-1');
  assert.equal(session.url, EU);
  assert.equal(session.expiresAt, NOW + 7 * DAY);
  assert.equal(saved.at(-1).session.id, 'session-1');
  assert.equal(saved.at(-1).lastLoginAt, NOW);
  await petkit.families();
  const read = server.reads('group/family/list')[0];
  assert.equal(read.headers['X-Session'], 'session-1');
  assert.equal(read.headers['F-Session'], 'session-1');
  assert.equal(read.headers['X-Api-Version'], '13.2.1');
  assert.equal(read.headers['User-Agent'], 'okhttp/3.14.9');
  assert.equal(read.headers['Accept-Encoding'], 'gzip, deflate');
  assert.equal(read.method, 'GET');
});

test('sessionOf: a server clock ahead does not stretch the session; no expiresIn, no expiry', () => {
  const later = sessionOf(
    { session: { id: 'a', expiresIn: 3600, createdAt: '2026-10-16T11:00:00.000+0000' } },
    { url: EU, country: 'AD', now: NOW },
  );
  assert.equal(later.expiresAt, NOW + HOUR);
  const earlier = sessionOf(
    { session: { id: 'b', expiresIn: 3600, createdAt: '2026-10-16T09:30:00.000+0000' } },
    { url: EU, country: 'AD', now: NOW },
  );
  assert.equal(earlier.expiresAt, NOW + 30 * MINUTE);
  assert.equal(sessionOf({ session: { id: 'c' } }, { url: EU, now: NOW }).expiresAt, undefined);
  assert.throws(() => sessionOf({}, { url: EU, now: NOW }), { kind: 'bad_response' });
});

test('one sign-in at a time, and never two automatic ones within 15 minutes', async () => {
  const { petkit, server, advance } = client({ lastLoginAt: NOW - 5 * MINUTE, allowLogin: false });
  await assert.rejects(petkit.login(), { kind: 'login_wait' });
  assert.equal(petkit.nextLoginAt, NOW + 10 * MINUTE);
  assert.equal(server.requests.length, 0);
  advance(10 * MINUTE);
  const [a, b] = await Promise.all([petkit.login(), petkit.login()]);
  assert.equal(a, b);
  assert.equal(server.logins().length, 1);
  advance(MINUTE);
  await assert.rejects(petkit.login(), { kind: 'login_wait' });
  petkit.allowLogin();
  await petkit.login();
  assert.equal(server.logins().length, 2, 'the user asked: at once');
});

test('a refused sign-in still counts for the rationing', async () => {
  const server = fakePetkit();
  server.password = 'other';
  const { petkit, saved } = client({ server });
  await assert.rejects(petkit.login(), { kind: 'refused', code: 122 });
  assert.equal(saved.at(-1).lastLoginAt, NOW);
  await assert.rejects(petkit.login(), { kind: 'login_wait' });
  assert.equal(server.logins().length, 1);
});

test('a session closed soon after its sign-in: kicked, no new sign-in', async () => {
  const { petkit, server, advance } = client();
  await petkit.families();
  server.kick();
  advance(5 * MINUTE);
  await assert.rejects(petkit.families(), { kind: 'kicked' });
  assert.equal(petkit.kicks, 1);
  assert.equal(petkit.session, null);
  assert.equal(server.logins().length, 1);
  await assert.rejects(petkit.families(), { kind: 'login_wait' });
});

test('an old session closed: one sign-in and the call is retried; a long-lived session clears the kicks', async () => {
  const { petkit, server, advance } = client();
  await petkit.families();
  petkit.kicks = 1;
  advance(TIMINGS.kickWindow + MINUTE);
  await petkit.families();
  assert.equal(petkit.kicks, 0);
  server.kick();
  const groups = await petkit.families();
  assert.equal(groups.length, 2);
  assert.equal(server.logins().length, 2);
});

test('the session is renewed an hour before it expires', async () => {
  const server = fakePetkit({ lifetime: 3 * HOUR });
  const { petkit, advance } = client({ server });
  await petkit.families();
  advance(HOUR + 59 * MINUTE);
  await petkit.families();
  assert.equal(server.logins().length, 1);
  advance(2 * MINUTE);
  await petkit.families();
  assert.equal(server.logins().length, 2);
});

test('the requests of the reads and commands', async () => {
  const { petkit, server } = client();
  await petkit.detail('t4', '400200001');
  await petkit.bleData('w5', '100000001');
  await petkit.roster('7002', '20261016');
  await petkit.feed('d4sh', '300035322', '20261016', { amount1: 2, amount2: 0 });
  await petkit.startAction('t4', '400200001', 0).catch(() => {});
  const [detail, ble, roster, feed, control] = server.requests.slice(2);
  assert.equal(detail.url, `${EU}t4/device_detail?id=400200001`);
  assert.equal(detail.method, 'POST');
  assert.equal(detail.form, undefined);
  assert.equal(ble.url, `${EU}w5/deviceData?id=100000001`);
  assert.deepEqual(roster.form, { day: '20261016', groupId: '7002' });
  assert.equal(feed.url, `${EU}d4sh/saveDailyFeed`);
  assert.deepEqual(feed.form, {
    day: '20261016',
    deviceId: '300035322',
    name: '',
    time: '-1',
    amount1: '2',
    amount2: '0',
  });
  assert.equal(feed.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(
    feed.headers['Content-Length'],
    Buffer.byteLength(new URLSearchParams(feed.form).toString()),
  );
  assert.deepEqual(control.form, { id: '400200001', kv: '{"start_action": 0}', type: 'start' });
});
