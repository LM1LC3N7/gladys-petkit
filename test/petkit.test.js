// -----------------------------------------------------------------------------
// The transport (against a loopback HTTP server: gzip, limits, timeout) and the
// reading of PetKit answers and errors.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import {
  PetkitError,
  errorReason,
  formBody,
  httpRequest,
  parseAnswer,
  pythonDict,
  pythonJson,
} from '../src/petkit.js';

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('the request goes out with its method, headers and form; the answer comes back unzipped', async (t) => {
  let seen;
  const base = await serve(t, (req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      seen = { method: req.method, url: req.url, session: req.headers['x-session'], body };
      res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
      res.end(zlib.gzipSync(JSON.stringify({ result: { ok: 'é' } })));
    });
  });
  const answer = await httpRequest(`${base}/latest/t4/controlDevice?x=1`, {
    method: 'POST',
    headers: { 'X-Session': 's1', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'id=1&type=start',
  });
  assert.deepEqual(seen, {
    method: 'POST',
    url: '/latest/t4/controlDevice?x=1',
    session: 's1',
    body: 'id=1&type=start',
  });
  assert.equal(answer.status, 200);
  assert.deepEqual(parseAnswer(answer), { ok: 'é' });
});

test('deflate too, and plain answers', async (t) => {
  const base = await serve(t, (req, res) => {
    if (req.url === '/deflate') {
      res.writeHead(200, { 'content-encoding': 'deflate' });
      res.end(zlib.deflateSync('{"result":1}'));
      return;
    }
    res.end('{"result":2}');
  });
  assert.equal(parseAnswer(await httpRequest(`${base}/deflate`)), 1);
  assert.equal(parseAnswer(await httpRequest(`${base}/plain`)), 2);
});

test('an answer too large, a broken one, a server that never answers, a closed port', async (t) => {
  const base = await serve(t, (req, res) => {
    if (req.url === '/big') {
      res.end('x'.repeat(5000));
    } else if (req.url === '/bomb') {
      res.writeHead(200, { 'content-encoding': 'gzip' });
      res.end(zlib.gzipSync('x'.repeat(100_000)));
    } else if (req.url === '/broken') {
      res.writeHead(200, { 'content-encoding': 'gzip' });
      res.end('not gzip');
    }
    // /slow: never answers
  });
  await assert.rejects(httpRequest(`${base}/big`, { maxBytes: 1000 }), { kind: 'size' });
  await assert.rejects(httpRequest(`${base}/bomb`, { maxBytes: 10_000 }), { kind: 'size' });
  await assert.rejects(httpRequest(`${base}/broken`), { kind: 'bad_response' });
  await assert.rejects(httpRequest(`${base}/slow`, { timeout: 200 }), {
    kind: 'timeout',
    message: 'no answer within 1 s',
  });
  await assert.rejects(httpRequest('http://127.0.0.1:9/'), {
    kind: 'network',
    message: 'connection refused',
  });
});

test('PetKit errors come with HTTP 200 and a code', () => {
  const ok = (body) => ({ status: 200, body: JSON.stringify(body) });
  const kinds = [
    [1, 'busy'],
    [5, 'session'],
    [122, 'refused'],
    [125, 'unknown_account'],
    [703, 'device'],
    [1201, 'api'],
  ];
  for (const [code, kind] of kinds) {
    assert.throws(() => parseAnswer(ok({ error: { code, msg: 'm' } })), { kind, code });
  }
  assert.throws(() => parseAnswer(ok({ error: { code: 1201, msg: 'Device is working' } })), {
    message: 'Device is working',
  });
  assert.throws(() => parseAnswer({ status: 200, body: '<html>' }), { kind: 'bad_response' });
  assert.throws(() => parseAnswer(ok({ data: 1 })), { kind: 'bad_response' });
  assert.throws(() => parseAnswer({ status: 502, body: '' }), { kind: 'unavailable', status: 502 });
  assert.throws(() => parseAnswer({ status: 404, body: '' }), { kind: 'http', status: 404 });
  assert.equal(parseAnswer(ok({ result: null })), null);
});

test('the reasons shown in the status never carry a secret', () => {
  assert.equal(
    errorReason(new PetkitError('api', 'Device is working', { code: 1201 })),
    'Device is working (PetKit code 1201)',
  );
  assert.equal(
    errorReason(new PetkitError('unavailable', 'PetKit is unavailable', { status: 503 })),
    'PetKit is unavailable (HTTP 503)',
  );
  assert.equal(errorReason(new Error('boom')), 'boom');
});

test('the encodings of the requests', () => {
  assert.equal(formBody({ a: 1, b: 'x y&z', c: undefined, d: null }), 'a=1&b=x+y%26z');
  assert.equal(
    pythonDict({ locale: 'en-US', timezone: '2.0' }),
    "{'locale': 'en-US', 'timezone': '2.0'}",
  );
  assert.equal(pythonJson({ start_action: 0 }), '{"start_action": 0}');
});
