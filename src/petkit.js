// -----------------------------------------------------------------------------
// The only network access: HTTPS requests to the PetKit cloud, and the errors
// they end with.
//
// The API is the one of the PetKit app, undocumented; what is used here was
// read from py-petkit-api (MIT). Every answer is HTTP 200 with a JSON body:
// `{ "result": … }`, or `{ "error": { "code": n, "msg": "…" } }` (code 5 for a
// missing or closed session: checked without a session on 2026-10-16).
// -----------------------------------------------------------------------------

import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { API_ERRORS, LIMITS, TIMINGS } from './constants.js';

/**
 * A failed PetKit call. `kind`:
 * - `no_credentials`: no user name or password in the configuration (never sent);
 * - `refused`: the sign-in was refused (wrong user name or password, code 122);
 * - `unknown_account`: no such account on this server (code 125: wrong server);
 * - `session`: PetKit closed or refused the session (code 5);
 * - `kicked`: the session was closed soon after its sign-in (another app);
 * - `login_wait`: an automatic sign-in waits for the minimum gap between two;
 * - `busy`: PetKit asked to come back later (code 1);
 * - `device`: the device is unknown to PetKit (code 703) or refused the command;
 * - `api`: any other PetKit error code;
 * - `unavailable`: PetKit is down (HTTP 5xx);
 * - `network`, `timeout`: no answer;
 * - `bad_response`, `size`: an answer that is not the expected JSON;
 * - `http`: any other HTTP status.
 */
export class PetkitError extends Error {
  constructor(kind, message, { status, code } = {}) {
    super(message);
    this.name = 'PetkitError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

const NETWORK_REASONS = {
  ECONNREFUSED: 'connection refused',
  ECONNRESET: 'connection reset',
  EHOSTUNREACH: 'host unreachable',
  ENETUNREACH: 'network unreachable',
  ENOTFOUND: 'unknown host name',
  EAI_AGAIN: 'host name not resolved',
  ETIMEDOUT: 'connection timed out',
  EPIPE: 'connection closed',
};

/** A socket error -> PetkitError (never the request: the sign-in carries the password hash). */
export function networkError(err) {
  if (err instanceof PetkitError) {
    return err;
  }
  const reason = NETWORK_REASONS[err?.code] ?? err?.code ?? 'network error';
  return new PetkitError('network', reason);
}

/** A short, secret-free reason for a log or a status message. */
export function errorReason(err) {
  if (err instanceof PetkitError) {
    if (err.code !== undefined) {
      return `${err.message} (PetKit code ${err.code})`;
    }
    return err.status ? `${err.message} (HTTP ${err.status})` : err.message;
  }
  return String(err?.message ?? err);
}

function decode(buffer, encoding, maxBytes) {
  const options = { maxOutputLength: maxBytes };
  switch (String(encoding ?? '').toLowerCase()) {
    case 'gzip':
      return zlib.gunzipSync(buffer, options);
    case 'deflate':
      return zlib.inflateSync(buffer, options);
    case '':
    case 'identity':
      return buffer;
    default:
      throw new PetkitError('bad_response', `unknown content encoding ${encoding}`);
  }
}

/**
 * One request; resolves `{ status, headers, body }` (body decompressed, as
 * text) whatever the status. The promise settles once: a request destroyed for
 * its size or its timeout may still end or fail after that.
 * @param {string} url
 * @param {{ method?: string, headers?: object, body?: string, timeout?: number, maxBytes?: number }} options
 */
export function httpRequest(
  url,
  {
    method = 'GET',
    headers = {},
    body,
    timeout = TIMINGS.requestTimeout,
    maxBytes = LIMITS.responseBytes,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    let timer;
    let settled = false;
    const settle = (fn, value) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        fn(value);
      }
    };
    const req = lib.request(target, { method, headers }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          settle(reject, new PetkitError('size', 'answer too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        try {
          const raw = decode(Buffer.concat(chunks), res.headers['content-encoding'], maxBytes);
          settle(resolve, {
            status: res.statusCode,
            headers: res.headers,
            body: raw.toString('utf8'),
          });
        } catch (err) {
          settle(
            reject,
            err instanceof PetkitError
              ? err
              : err?.code === 'ERR_BUFFER_TOO_LARGE'
                ? new PetkitError('size', 'answer too large')
                : new PetkitError(
                    'bad_response',
                    'PetKit sent an answer that cannot be decompressed',
                  ),
          );
        }
      });
      res.on('error', (err) => settle(reject, networkError(err)));
    });
    timer = setTimeout(() => {
      settle(reject, new PetkitError('timeout', `no answer within ${Math.ceil(timeout / 1000)} s`));
      req.destroy();
    }, timeout);
    req.on('error', (err) => settle(reject, networkError(err)));
    req.end(body);
  });
}

/** The error of a PetKit `error` object. `login`: the answer of the sign-in. */
export function apiError({ code, msg } = {}) {
  const number = Number(code);
  const text = typeof msg === 'string' && msg !== '' ? msg.slice(0, 160) : 'request refused';
  switch (number) {
    case API_ERRORS.BUSY:
      return new PetkitError('busy', 'PetKit is busy', { code: number });
    case API_ERRORS.SESSION:
      return new PetkitError('session', 'PetKit closed the session', { code: number });
    case API_ERRORS.LOGIN_REFUSED:
      return new PetkitError('refused', 'user name or password refused', { code: number });
    case API_ERRORS.UNKNOWN_ACCOUNT:
      return new PetkitError('unknown_account', 'no such account on this PetKit server', {
        code: number,
      });
    case API_ERRORS.DEVICE_NOT_FOUND:
      return new PetkitError('device', 'device unknown to PetKit', { code: number });
    default:
      return new PetkitError('api', text, { code: Number.isFinite(number) ? number : undefined });
  }
}

/** The `result` of an answer, or the error it carries. */
export function parseAnswer({ status, body }) {
  if (status >= 500) {
    throw new PetkitError('unavailable', 'PetKit is unavailable', { status });
  }
  if (status < 200 || status >= 300) {
    throw new PetkitError('http', 'request failed', { status });
  }
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new PetkitError('bad_response', 'PetKit sent an answer that is not JSON');
  }
  if (!json || typeof json !== 'object') {
    throw new PetkitError('bad_response', 'PetKit sent an empty answer');
  }
  if (json.error) {
    throw apiError(json.error);
  }
  if (!('result' in json)) {
    throw new PetkitError('bad_response', 'PetKit sent an answer without result');
  }
  return json.result;
}

/** A form body (application/x-www-form-urlencoded), keys in the given order. */
export const formBody = (fields) =>
  new URLSearchParams(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  ).toString();

/** A Python `str()` of a flat dict of strings, as the PetKit app sends its `client` field. */
export const pythonDict = (entries) =>
  `{${Object.entries(entries)
    .map(([key, value]) => `'${key}': '${value}'`)
    .join(', ')}}`;

/** A Python `json.dumps()` of a flat object of numbers, as the `kv` of a command. */
export const pythonJson = (entries) =>
  `{${Object.entries(entries)
    .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(', ')}}`;
