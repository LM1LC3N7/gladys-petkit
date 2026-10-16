// -----------------------------------------------------------------------------
// Manifest keys, PetKit API constants, device families, limits and timings.
//
// The PetKit API is the one of the PetKit app, undocumented. Everything here
// was read from py-petkit-api (MIT, the library of the Home Assistant
// integration) and checked against its recorded answers.
// -----------------------------------------------------------------------------

/** The public list of the regional servers, and the China server it leaves out. */
export const PASSPORT_URL = 'https://passport.petkt.com/';
export const CHINA_URL = 'https://api.petkit.cn/6/';

/**
 * The PetKit servers, as the `region` select of the manifest offers them. At
 * each sign-in, v1/regionservers gives the server of the `anchor` country and
 * the countries it serves; the sign-in sends the first of them in alphabetical
 * order, like the Home Assistant integration does. `url` and `country` are the
 * fallback when that list cannot be read (values of 2026-10-16). China is not
 * in the list: py-petkit-api reaches it directly.
 */
export const SERVERS = {
  europe: { anchor: 'FR', url: 'https://api.eu-pet.com/latest/', country: 'AD' },
  international: { anchor: 'US', url: 'https://api.petkt.com/latest/', country: 'AG' },
  asia: { anchor: 'JP', url: 'https://api.petktasia.com/latest/', country: 'AE' },
  russia: { anchor: 'RU', url: 'https://api-ru.petkit.cn/latest/', country: 'RU' },
  china: { url: CHINA_URL, country: 'CN' },
};

/** API paths, relative to the server URL. */
export const PATHS = {
  regionServers: 'v1/regionservers',
  login: 'user/login',
  familyList: 'group/family/list',
  deviceRoster: 'discovery/device_roster_v2',
  detail: (type) => `${type}/device_detail`,
  bleData: (type) => `${type}/deviceData`,
  records: (type, endpoint) => `${type}/${endpoint}`,
  manualFeed: (type) =>
    type === 'feeder' || type === 'feedermini' ? `${type}/save_dailyfeed` : `${type}/saveDailyFeed`,
  control: (type) => `${type}/controlDevice`,
};

/**
 * What the requests say about the client: the Android app of py-petkit-api
 * 1.31 (headers, login `client` and `oldVersion`).
 */
export const APP = {
  apiVersion: '13.2.1',
  platform: 'android',
  osVersion: '16.1',
  model: '23127PN0CG',
  brand: 'Xiaomi',
  source: 'app.petkit-android',
  locale: 'en-US',
  userAgent: 'okhttp/3.14.9',
};

/** PetKit error codes (the `error.code` of an HTTP 200 answer). */
export const API_ERRORS = {
  BUSY: 1,
  SESSION: 5,
  LOGIN_REFUSED: 122,
  UNKNOWN_ACCOUNT: 125,
  DEVICE_NOT_FOUND: 703,
};

/** The device types read in this version, by family. */
export const FAMILIES = {
  feeder: ['feeder', 'feedermini', 'd3', 'd4', 'd4s', 'd4h', 'd4sh'],
  litter: ['t3', 't4', 't5', 't6', 't7'],
  fountain: ['w4', 'w5', 'ctw2', 'ctw3', 'w7h'],
};

export const familyOf = (type) =>
  Object.keys(FAMILIES).find((family) => FAMILIES[family].includes(type));

/** Fountains without Wi-Fi: the cloud only knows what a relay device synced. */
export const BLE_FOUNTAINS = ['w4', 'w5', 'ctw2', 'ctw3'];

/** Litter boxes with a camera: their pet visits come from getPetOutGraph. */
export const LITTER_WITH_CAMERA = ['t5', 't6', 't7'];

/** The record call of each feeder (py-petkit-api FeederRecord.get_endpoint). */
export const FEEDER_RECORDS = {
  feeder: 'dailyfeeds',
  feedermini: 'dailyfeeds',
  d3: 'dailyFeedAndEat',
  d4: 'dailyFeeds',
  d4s: 'dailyFeeds',
  d4h: 'getDeviceRecord',
  d4sh: 'getDeviceRecord',
};

/**
 * Manual feeding per feeder: the unit of its amounts, the valid amounts and the
 * one "Feed" button dispenses (py-petkit-api MANUAL_FEED_VALID_VALUES; the
 * Fresh Element in grams by 20 like the Home Assistant number entity).
 */
const range = (from, to, step) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

export const FEEDING = {
  feeder: { unit: 'g', amounts: range(20, 400, 20) },
  feedermini: { unit: 'g', amounts: range(5, 50, 5) },
  d3: { unit: 'g', amounts: range(5, 200, 1) },
  d4: { unit: 'g', amounts: range(10, 50, 10) },
  d4h: { unit: 'g', amounts: range(10, 50, 10) },
  d4s: { unit: 'portions', amounts: range(1, 10, 1), hoppers: 2 },
  d4sh: { unit: 'portions', amounts: range(1, 10, 1), hoppers: 2 },
};

/** Litter box commands: `{ start_action: n }` through controlDevice. */
export const LITTER_ACTIONS = { clean: 0, deodorize: 2 };

/** Litter record event type of a pet visit (Home Assistant map_litter_event). */
export const PET_VISIT_EVENT = 10;

/** Litter box work modes (Home Assistant map_work_state). */
export const WORK_MODES = {
  0: 'cleaning',
  1: 'dumping',
  2: 'odor_removal',
  3: 'resetting',
  4: 'leveling',
  5: 'calibrating',
  6: 'reset_deodorant',
  7: 'light',
  8: 'reset_deodorant',
  9: 'maintenance',
};

/** Feed record `src` (Home Assistant get_dispense_status). */
export const MEAL_SOURCES = { 1: 'plan', 3: 'app', 4: 'feeder' };

/**
 * Gladys values (server/utils/constants.js of the Gladys core, not exported
 * by the SDK): a binary input 1 when on, a button push 1, a level state
 * 0 low, 1 normal, 2 high.
 */
export const GLADYS = {
  ON: 1,
  OFF: 0,
  PUSHED: 1,
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
};

export const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
};

export const SCENE_TRIGGERS = {
  LITTER_BOX_USED: 'litter_box_used',
  MEAL_DISPENSED: 'meal_dispensed',
  ALERT: 'alert_raised',
};

export const SCENE_ACTIONS = {
  FEED: 'feed',
};

/** The alerts of the alert_raised trigger, in the order of its select. */
export const ALERTS = [
  'low_food',
  'bin_full',
  'litter_low',
  'deodorizer_low',
  'low_water',
  'filter_change',
  'device_error',
];

export const POLL_INTERVAL = { min: 60, max: 900, default: 120 };

export const LIMITS = {
  /** Gladys: 300 states per minute, 300 scene events per minute. */
  statesPerMinute: 300,
  sceneEventsPerMinute: 300,
  /** States per publishStates request. */
  statesPerRequest: 100,
  /** Largest answer read, once decompressed. */
  responseBytes: 4 * 1024 * 1024,
  /** Scene event strings (Gladys accepts 1000 characters). */
  eventText: 200,
  /** Events kept while Gladys is unreachable. */
  queuedEvents: 500,
  /** Event keys remembered per device (meals, visits). */
  seenKeys: 300,
};

export const TIMINGS = {
  requestTimeout: 30_000,
  /** The publisher sends what is pending every second. */
  flushInterval: 1_000,
  /** An unchanged state is sent again every 30 minutes. */
  stateHeartbeat: 30 * 60_000,
  /** Sign in again this long before the session expires. */
  sessionMargin: 60 * 60_000,
  /** Never two automatic sign-ins closer than this. */
  loginGap: 15 * 60_000,
  /** A session closed this soon after its sign-in was taken by another app. */
  kickWindow: 30 * 60_000,
  /** The device list is read again this often (and on a Discovery scan). */
  inventoryAge: 30 * 60_000,
  /** Pauses after a failed read: 1, 2, 5, 10 then 15 minutes. */
  backoff: [60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000],
  /** After PetKit said it is busy. */
  busyPause: 5 * 60_000,
  /** An event older than this when first seen (an outage, a restart) is not fired. */
  eventMaxAge: 15 * 60_000,
  /** A meal dispensed this soon after a Gladys feed command fires no scene event. */
  commandEcho: 10 * 60_000,
  /** A read soon after a command, to show its result. */
  afterCommand: 15_000,
  /** The "Test the connection" button reads PetKit at most this often. */
  testCooldown: 30_000,
};
