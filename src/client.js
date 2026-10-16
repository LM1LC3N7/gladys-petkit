// -----------------------------------------------------------------------------
// The PetKit account: the server of its region, the session (a sign-in with
// the user name and the MD5 of the password), kept until it expires, and the
// calls the integration needs. Every request goes through the transport of
// src/petkit.js.
//
// One session per account at PetKit: a sign-in elsewhere (the PetKit app with
// the same account) closes ours, and ours closes theirs. So the sign-ins are
// rationed: never two automatic ones closer than TIMINGS.loginGap, and a
// session closed soon after its sign-in is reported ("kicked") instead of
// signing in again at once.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { offsetText, parseInstant } from './clock.js';
import { APP, PASSPORT_URL, PATHS, SERVERS, TIMINGS } from './constants.js';
import {
  PetkitError,
  formBody,
  httpRequest,
  parseAnswer,
  pythonDict,
  pythonJson,
} from './petkit.js';

const md5 = (text) => createHash('md5').update(text, 'utf8').digest('hex');

/** The session of a sign-in answer, dated with the local clock. */
export function sessionOf(answer, { url, country, now }) {
  const raw = answer?.session;
  if (!raw || typeof raw.id !== 'string' || raw.id === '') {
    throw new PetkitError('bad_response', 'PetKit sent no session');
  }
  const expiresIn = Number(raw.expiresIn);
  const createdAt = parseInstant(raw.createdAt);
  // The server clock may differ: the expiry counts from the earlier of the two.
  const start = Math.min(createdAt ?? now, now);
  return {
    id: raw.id,
    userId: raw.userId === undefined ? undefined : String(raw.userId),
    url,
    country,
    loggedInAt: now,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? start + expiresIn * 1000 : undefined,
  };
}

export class PetkitClient {
  constructor({ transport = httpRequest, now = Date.now, onSession } = {}) {
    this.transport = transport;
    this.now = now;
    /** Called with `{ session, lastLoginAt }` after each change (never throws). */
    this.onSession = onSession;
    this.username = '';
    this.password = '';
    this.region = 'europe';
    this.timezone = 'UTC';
    /** { id, userId, url, country, loggedInAt, expiresAt } | null */
    this.session = null;
    /** When this client (or the previous run, from /data) last signed in. */
    this.lastLoginAt = undefined;
    /** One sign-in allowed without the gap (configuration change, test button). */
    this.loginAllowed = true;
    /** Sessions closed soon after their sign-in, in a row. */
    this.kicks = 0;
    this.signingIn = undefined;
  }

  /** `allowLogin`: a sign-in may happen at once (the user changed the account). */
  configure({ username, password, region, timezone, session = null, lastLoginAt, allowLogin }) {
    this.username = username;
    this.password = password;
    this.region = region;
    this.timezone = timezone;
    this.session = session?.id ? session : null;
    this.lastLoginAt = lastLoginAt;
    this.loginAllowed = Boolean(allowLogin);
    this.kicks = 0;
  }

  get hasCredentials() {
    return this.username !== '' && this.password !== '';
  }

  /** Lets the next sign-in skip the gap: the user asked for it. */
  allowLogin() {
    this.loginAllowed = true;
  }

  /** When the next automatic sign-in may happen (ms since the epoch). */
  get nextLoginAt() {
    return this.loginAllowed || this.lastLoginAt === undefined
      ? this.now()
      : this.lastLoginAt + TIMINGS.loginGap;
  }

  headers(session, body) {
    const now = this.now();
    const headers = {
      Accept: '*/*',
      'Accept-Language': 'en-US;q=1, it-US;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': APP.userAgent,
      'X-Img-Version': '1',
      'X-Locale': APP.locale,
      'X-Client': `${APP.platform}(${APP.osVersion};${APP.model})`,
      'X-Hour': '24',
      'X-TimezoneId': this.timezone,
      'X-Api-Version': APP.apiVersion,
      'X-Timezone': offsetText(this.timezone, now),
    };
    if (session) {
      headers['F-Session'] = session.id;
      headers['X-Session'] = session.id;
    }
    if (body !== undefined) {
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    return headers;
  }

  /** One request to `base` + `path`; resolves the `result` of the answer. */
  async send(method, base, path, { query, form, session } = {}) {
    const search = query ? `?${formBody(query)}` : '';
    const body = form === undefined ? undefined : typeof form === 'string' ? form : formBody(form);
    const answer = await this.transport(`${base}${path}${search}`, {
      method,
      headers: this.headers(session, body),
      body,
    });
    return parseAnswer(answer);
  }

  /** The server and the country of the configured region (the public server list). */
  async server() {
    const fallback = SERVERS[this.region] ?? SERVERS.europe;
    if (!fallback.anchor) {
      return { url: fallback.url, country: fallback.country };
    }
    let list;
    try {
      list = (await this.send('GET', PASSPORT_URL, PATHS.regionServers))?.list;
    } catch {
      // The list is a convenience: the known server still answers the sign-in.
      return { url: fallback.url, country: fallback.country, fallback: true };
    }
    const entries = Array.isArray(list) ? list : [];
    const anchor = entries.find((e) => e?.id === fallback.anchor);
    if (!anchor || typeof anchor.gateway !== 'string' || !/^https:\/\//.test(anchor.gateway)) {
      return { url: fallback.url, country: fallback.country, fallback: true };
    }
    const url = anchor.gateway.endsWith('/') ? anchor.gateway : `${anchor.gateway}/`;
    const countries = entries
      .filter((e) => e?.gateway === anchor.gateway && typeof e.id === 'string')
      .map((e) => e.id)
      .sort();
    return { url, country: countries[0] ?? fallback.anchor };
  }

  /**
   * Signs in; one sign-in at a time, the others wait for it. An automatic
   * sign-in closer than TIMINGS.loginGap to the previous one fails with
   * `login_wait`: the caller pauses until `nextLoginAt`.
   */
  login() {
    if (!this.hasCredentials) {
      return Promise.reject(new PetkitError('no_credentials', 'no user name or password'));
    }
    if (this.signingIn) {
      return this.signingIn;
    }
    if (this.now() < this.nextLoginAt) {
      return Promise.reject(new PetkitError('login_wait', 'waiting before signing in again'));
    }
    const { username } = this;
    this.signingIn = (async () => {
      const { url, country } = await this.server();
      const now = this.now();
      this.loginAllowed = false;
      this.lastLoginAt = now;
      const client = pythonDict({
        locale: APP.locale,
        name: APP.model,
        osVersion: APP.osVersion,
        phoneBrand: APP.brand,
        platform: APP.platform,
        source: APP.source,
        version: APP.apiVersion,
        timezoneId: this.timezone,
        timezone: offsetText(this.timezone, now),
      });
      let answer;
      try {
        answer = await this.send('POST', url, PATHS.login, {
          form: {
            oldVersion: APP.apiVersion,
            client,
            encrypt: 1,
            region: country.toLowerCase(),
            username,
            password: md5(this.password),
          },
        });
      } finally {
        await this.save();
      }
      const session = sessionOf(answer, { url, country, now });
      // A sign-in started for another account never overwrites the new one.
      if (this.username === username) {
        this.session = session;
        await this.save();
      }
      return session;
    })().finally(() => {
      this.signingIn = undefined;
    });
    return this.signingIn;
  }

  async save() {
    try {
      await this.onSession?.({ session: this.session, lastLoginAt: this.lastLoginAt });
    } catch {
      // Persisting is best effort: the next sign-in is still rationed in memory.
    }
  }

  /** Whether the session is missing or about to expire. */
  needsLogin() {
    if (!this.session) {
      return true;
    }
    const { expiresAt } = this.session;
    return expiresAt !== undefined && this.now() >= expiresAt - TIMINGS.sessionMargin;
  }

  async ensureSession() {
    if (this.needsLogin()) {
      await this.login();
    }
    return this.session;
  }

  /** A call with the session; a closed session is renewed once, unless it was just made. */
  async call(method, path, options = {}) {
    const session = await this.ensureSession();
    try {
      const result = await this.send(method, session.url, path, { ...options, session });
      if (this.now() - session.loggedInAt >= TIMINGS.kickWindow) {
        this.kicks = 0;
      }
      return result;
    } catch (err) {
      if (err.kind !== 'session') {
        throw err;
      }
      if (this.session?.id === session.id) {
        this.session = null;
        await this.save();
      }
      if (this.now() - session.loggedInAt < TIMINGS.kickWindow) {
        this.kicks += 1;
        throw new PetkitError('kicked', 'PetKit closed the session soon after the sign-in', {
          code: err.code,
        });
      }
      const fresh = await this.ensureSession();
      return this.send(method, fresh.url, path, { ...options, session: fresh });
    }
  }

  // --- The calls ---------------------------------------------------------------

  /** The families (groups) of the account, with their devices and pets. */
  async families() {
    const result = await this.call('GET', PATHS.familyList);
    return Array.isArray(result) ? result : [];
  }

  /** The devices shared with the account in a family (absent from the family list). */
  async roster(groupId, day) {
    const result = await this.call('POST', PATHS.deviceRoster, {
      form: `day=${encodeURIComponent(day)}&groupId=${encodeURIComponent(groupId)}`,
    });
    return Array.isArray(result?.devices) ? result.devices : [];
  }

  /** The state of a Wi-Fi device (feeder, litter box, Eversweet Ultra). */
  detail(type, id) {
    return this.call('POST', PATHS.detail(type), { query: { id } });
  }

  /** The last data a Bluetooth fountain synced through a relay device. */
  bleData(type, id) {
    return this.call('POST', PATHS.bleData(type), { query: { id } });
  }

  /** The records of a device (meals, litter box visits). */
  records(type, endpoint, query) {
    return this.call('POST', PATHS.records(type, endpoint), { query });
  }

  /** Dispenses food now: `{ amount }`, or `{ amount1, amount2 }` on a two-hopper feeder. */
  feed(type, id, day, amounts) {
    return this.call('POST', PATHS.manualFeed(type), {
      form: { day, deviceId: id, name: '', time: '-1', ...amounts },
    });
  }

  /** Starts a litter box action (`start_action`: 0 clean, 2 deodorize). */
  startAction(type, id, action) {
    return this.call('POST', PATHS.control(type), {
      form: { id, kv: pythonJson({ start_action: action }), type: 'start' },
    });
  }
}
