// -----------------------------------------------------------------------------
// A fake PetKit cloud behind the transport the integration is given: the
// public region list, the sign-in, the family list, the shared devices, the
// device details and records, and the commands, with PetKit's way of failing
// (HTTP 200 and an `error` object: code 5 for a closed session, 122 for a
// refused password). Records every request. No network.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { PetkitError } from '../../src/petkit.js';
import {
  DAY,
  PASSWORD,
  USERNAME,
  details,
  families,
  records,
  regionServers,
  roster,
} from '../fixtures/petkit.js';

const json = (body, status = 200) => ({
  status,
  headers: { 'content-type': 'application/json;charset=utf-8' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const result = (value) => json({ result: value });
const failure = (code, msg) => json({ error: { code, msg } });

const md5 = (text) => createHash('md5').update(text, 'utf8').digest('hex');

export function fakePetkit({ lifetime = 7 * DAY } = {}) {
  const server = {
    username: USERNAME,
    password: PASSWORD,
    lifetime,
    families: families(),
    roster: roster(),
    details: details(),
    records: records(),
    /** { method, url, host, path, query, form, headers, session } */
    requests: [],
    sessions: new Set(),
    issued: 0,
    /** No answer at all (DNS, connection refused). */
    down: false,
    /** One-shot answers: { match(request), answer } */
    queue: [],
    logins() {
      return this.requests.filter((r) => r.path === 'user/login');
    },
    reads(path) {
      return this.requests.filter((r) => r.path === path);
    },
    commands() {
      return this.requests.filter((r) => /saveDailyFeed|save_dailyfeed|controlDevice/.test(r.path));
    },
    /** Closes every session, as a sign-in from the PetKit app does. */
    kick() {
      this.sessions.clear();
    },
    issue() {
      this.issued += 1;
      const id = `session-${this.issued}`;
      this.sessions.add(id);
      return id;
    },
  };

  server.transport = async (url, { method = 'GET', headers = {}, body } = {}) => {
    const target = new URL(url);
    const prefix =
      target.host === 'passport.petkt.com' ? '/' : target.pathname.match(/^\/[^/]+\//)?.[0];
    const path = target.pathname.slice(prefix?.length ?? 1);
    const request = {
      method,
      url,
      host: target.host,
      path,
      query: Object.fromEntries(target.searchParams),
      form: body === undefined ? undefined : Object.fromEntries(new URLSearchParams(body)),
      headers,
      session: headers['X-Session'],
    };
    server.requests.push(request);
    if (server.down) {
      throw new PetkitError('network', 'connection refused');
    }
    const forced = server.queue.findIndex((q) => q.match(request));
    if (forced >= 0) {
      return server.queue.splice(forced, 1)[0].answer;
    }
    if (path === 'v1/regionservers' && method === 'GET') {
      return result(regionServers());
    }
    if (path === 'user/login' && method === 'POST') {
      const form = request.form ?? {};
      if (!form.username || !form.password || !form.client || !form.region) {
        return failure(2, 'Missing parameters');
      }
      if (form.username !== server.username) {
        return failure(125, 'The email is not registered');
      }
      if (form.password !== md5(server.password)) {
        return failure(122, 'Wrong password');
      }
      return result({
        session: {
          id: server.issue(),
          userId: '100000011',
          expiresIn: Math.round(server.lifetime / 1000),
          region: form.region,
          createdAt: new Date(Date.now()).toISOString().replace('Z', '+0000'),
        },
      });
    }
    if (!server.sessions.has(request.session) || headers['F-Session'] !== request.session) {
      return failure(5, 'Login session expired. Please log in again.');
    }
    if (path === 'group/family/list' && method === 'GET') {
      return result(server.families);
    }
    if (path === 'discovery/device_roster_v2' && method === 'POST') {
      return result(request.form?.groupId === '7002' ? server.roster : { devices: [] });
    }
    const match = /^([a-z0-9]+)\/([A-Za-z_]+)$/.exec(path);
    if (!match || method !== 'POST') {
      return json('Not found', 404);
    }
    const [, type, endpoint] = match;
    const id =
      request.query.id ?? request.query.deviceId ?? request.form?.deviceId ?? request.form?.id;
    if (['device_detail', 'deviceData'].includes(endpoint)) {
      const detail = server.details[id];
      return detail ? result(detail) : failure(703, 'Device not found');
    }
    if (
      ['dailyFeeds', 'dailyfeeds', 'getDeviceRecord', 'getPetOutGraph', 'dailyFeedAndEat'].includes(
        endpoint,
      )
    ) {
      return result(server.records[id] ?? []);
    }
    if (endpoint === 'saveDailyFeed' || endpoint === 'save_dailyfeed') {
      return server.details[id] ? result({ isExecuted: 1 }) : failure(703, 'Device not found');
    }
    if (endpoint === 'controlDevice') {
      return server.details[id] && type.startsWith('t')
        ? result('success')
        : failure(703, 'Device not found');
    }
    return failure(99, `Unknown endpoint ${endpoint}`);
  };

  return server;
}

/** An in-memory store, in place of the /data file. */
export function memoryStore(initial = null) {
  return {
    data: initial,
    saves: 0,
    async load() {
      return this.data === null ? null : structuredClone(this.data);
    },
    async save(data) {
      this.saves += 1;
      this.data = structuredClone(data);
    },
  };
}

/** Lets the pending promises settle (no timer involved). */
export const settle = async (rounds = 20) => {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};
