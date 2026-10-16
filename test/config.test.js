// -----------------------------------------------------------------------------
// The configuration, normalized, and the state kept in /data.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS, accountKey, normalizeConfig } from '../src/config.js';
import { fileStore, normalizeMemory } from '../src/store.js';

test('defaults', () => {
  const config = normalizeConfig(undefined, { zone: 'Europe/Paris' });
  assert.deepEqual(config, {
    username: '',
    password: '',
    region: 'europe',
    account: '',
    timezone: 'Europe/Paris',
    timezoneInvalid: false,
    pollInterval: DEFAULTS.poll_interval,
    language: 'fr',
  });
});

test('values from the form, clamped and checked', () => {
  const config = normalizeConfig(
    {
      username: '  Me@Example.com ',
      password: ' secret ',
      region: 'ASIA',
      timezone: 'America/New_York',
      poll_interval: '30',
      language: 'EN',
    },
    { zone: 'UTC' },
  );
  assert.equal(config.username, 'Me@Example.com');
  assert.equal(config.password, ' secret ', 'a password is never trimmed');
  assert.equal(config.region, 'asia');
  assert.equal(config.timezone, 'America/New_York');
  assert.equal(config.pollInterval, 60);
  assert.equal(config.language, 'en');
  assert.equal(normalizeConfig({ poll_interval: 5000 }).pollInterval, 900);
  assert.equal(normalizeConfig({ region: 'mars' }).region, 'europe');
  assert.equal(normalizeConfig({ language: 'de' }).language, 'fr');
  const bad = normalizeConfig({ timezone: 'Mars/Olympus' }, { zone: 'UTC' });
  assert.deepEqual([bad.timezone, bad.timezoneInvalid], ['UTC', true]);
});

test('the account key: one per user name and server, without the user name', () => {
  assert.equal(accountKey('Me@Example.com ', 'europe'), accountKey('me@example.com', 'europe'));
  assert.notEqual(accountKey('me@example.com', 'europe'), accountKey('me@example.com', 'asia'));
  assert.equal(accountKey('me@example.com', 'europe').length, 16);
  assert.ok(!accountKey('me@example.com', 'europe').includes('example'));
});

test('the state in /data, repaired', () => {
  assert.deepEqual(normalizeMemory(null), {
    account: null,
    session: null,
    lastLoginAt: undefined,
  });
  const session = { id: 's', url: 'https://api.eu-pet.com/latest/', loggedInAt: 1, expiresAt: 2 };
  assert.deepEqual(normalizeMemory({ account: 'k', session, lastLoginAt: 1 }), {
    account: 'k',
    session: { ...session, userId: undefined, country: undefined },
    lastLoginAt: 1,
  });
  assert.equal(
    normalizeMemory({ account: 'k', session: { ...session, url: 'http://x' } }).session,
    null,
  );
  assert.equal(normalizeMemory({ session }).session, null, 'a session without its account');
});

test('the file store writes atomically, readable by the owner only', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'petkit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = fileStore(join(dir, 'state.json'));
  assert.equal(await store.load(), null);
  await store.save({ account: 'k' });
  assert.deepEqual(await store.load(), { account: 'k' });
  assert.equal((await stat(join(dir, 'state.json'))).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')).account, 'k');
});
