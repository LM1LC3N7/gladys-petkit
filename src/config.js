// -----------------------------------------------------------------------------
// The configuration of the manifest `config_schema`, normalized.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { POLL_INTERVAL, SERVERS } from './constants.js';
import { localZone, validZone } from './clock.js';

/** Defaults, mirrored by the manifest (checked by test/manifest.test.js). */
export const DEFAULTS = {
  region: 'europe',
  timezone: '',
  poll_interval: POLL_INTERVAL.default,
  language: 'fr',
};

export const LANGUAGES = ['fr', 'en'];
export const REGIONS = Object.keys(SERVERS);

/** The account a session belongs to, without keeping the user name itself. */
export const accountKey = (username, region) =>
  createHash('sha256')
    .update(`${region}:${username.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 16);

export function normalizeConfig(raw = {}, { zone = localZone() } = {}) {
  const username = String(raw?.username ?? '').trim();
  const password = String(raw?.password ?? '');
  const region = String(raw?.region ?? DEFAULTS.region)
    .trim()
    .toLowerCase();
  const timezone = String(raw?.timezone ?? '').trim();
  const interval = Number(raw?.poll_interval);
  const language = String(raw?.language ?? DEFAULTS.language)
    .trim()
    .toLowerCase();
  const server = REGIONS.includes(region) ? region : DEFAULTS.region;
  return {
    username,
    password,
    region: server,
    account: username === '' ? '' : accountKey(username, server),
    // The time zone of the devices: PetKit dates the days and the feeding
    // plans with it. Gladys's own (the TZ of the container) by default.
    timezone: validZone(timezone) ? timezone : zone,
    timezoneInvalid: timezone !== '' && !validZone(timezone),
    pollInterval: Number.isFinite(interval)
      ? Math.round(Math.max(POLL_INTERVAL.min, Math.min(POLL_INTERVAL.max, interval)))
      : DEFAULTS.poll_interval,
    language: LANGUAGES.includes(language) ? language : DEFAULTS.language,
  };
}
