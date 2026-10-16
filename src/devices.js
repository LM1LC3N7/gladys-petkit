// -----------------------------------------------------------------------------
// The account -> Gladys devices, and their states (pure).
//
// One device per PetKit device, `ext:<selector>:device:<PetKit id>`, and one
// per pet of the account when it has a litter box, `ext:<selector>:pet:<id>`.
// The features follow what each device reports (`rolesOf`). Gladys has no
// mass unit: food amounts are generic sensors with their unit in the name.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { GLADYS, LIMITS } from './constants.js';
import {
  BREAKDOWN,
  MODEL_NAMES,
  NO_ERROR,
  PET_NAME,
  UNKNOWN_PET,
  WORK_STATE_NAMES,
  featureName,
  word,
} from './i18n.js';

const levelState = { category: C.LEVEL_SENSOR, type: T.LEVEL_SENSOR.LIQUID_STATE, min: 0, max: 2 };
const percentLevel = {
  category: C.LEVEL_SENSOR,
  type: T.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
  unit: U.PERCENT,
  min: 0,
  max: 100,
};
const days = { category: C.DURATION, type: T.DURATION.INTEGER, unit: U.DAYS, min: 0, max: 3650 };
const amount = { category: C.UNKNOWN, type: T.UNKNOWN.UNKNOWN, min: 0, max: 10000 };
const counter = { category: C.COUNTER_SENSOR, type: T.SENSOR.INTEGER, min: 0, max: 10000 };
const push = {
  category: C.BUTTON,
  type: T.BUTTON.PUSH,
  min: 0,
  max: 1,
  read_only: false,
  has_feedback: false,
  keep_history: false,
};
const text = { category: C.TEXT, type: T.TEXT.TEXT, min: 0, max: 0, keep_history: false };

/** The features, by role (the last part of their external id). */
export const FEATURES = {
  online: { category: C.INPUT, type: T.INPUT.BINARY, min: 0, max: 1 },
  error: text,
  battery: { category: C.BATTERY, type: T.BATTERY.INTEGER, unit: U.PERCENT, min: 0, max: 100 },
  feed: push,
  'feed-1': push,
  'feed-2': push,
  food: levelState,
  'food-1': levelState,
  'food-2': levelState,
  'food-left': percentLevel,
  'dispensed-today': amount,
  'dispensed-today-1': amount,
  'dispensed-today-2': amount,
  'last-meal': amount,
  desiccant: days,
  clean: push,
  deodorize: push,
  'litter-level': percentLevel,
  'litter-low': levelState,
  'waste-bin': levelState,
  'deodorizer-days': days,
  'spray-days': days,
  'deodorizer-low': levelState,
  'uses-today': counter,
  'last-used-by': text,
  'work-state': text,
  water: levelState,
  filter: {
    category: C.MAINTENANCE,
    type: T.MAINTENANCE.LIFE_REMAINING,
    unit: U.PERCENT,
    min: 0,
    max: 100,
  },
  'filter-days': days,
  pump: { category: C.INPUT, type: T.INPUT.BINARY, min: 0, max: 1 },
  'drinks-today': counter,
  'waste-tank': levelState,
  weight: { category: C.UNKNOWN, type: T.UNKNOWN.UNKNOWN, min: 0, max: 100 },
  'visit-duration': {
    category: C.DURATION,
    type: T.DURATION.INTEGER,
    unit: U.SECONDS,
    min: 0,
    max: 7200,
  },
  'visits-today': counter,
};

/** The push buttons: what onSetValue accepts. */
export const COMMAND_ROLES = ['feed', 'feed-1', 'feed-2', 'clean', 'deodorize'];

/** The pet features (a pet has no reading of its own: always the same three). */
export const PET_ROLES = ['weight', 'visit-duration', 'visits-today'];

export const deviceIds = (gladys, id) => gladys.externalIds('device', String(id));
export const petIds = (gladys, id) => gladys.externalIds('pet', String(id));

/** The kind, PetKit id and role of a feature external id. */
export function parseFeatureId(externalId) {
  const match = /:(device|pet):([^:]+):([^:]+)$/.exec(String(externalId ?? ''));
  return match ? { kind: match[1], id: match[2], role: match[3] } : undefined;
}

/** The PetKit id of a device external id. */
export function parseDeviceId(externalId) {
  const match = /:(device|pet):([^:]+)$/.exec(String(externalId ?? ''));
  return match ? { kind: match[1], id: match[2] } : undefined;
}

export const deviceName = (device) =>
  device.name || `${MODEL_NAMES[device.type] ?? device.type} ${device.serial ?? device.id}`;

export const petName = (pet, language) => pet.name || `${word(PET_NAME, language)} ${pet.id}`;

const defined = (value) => value !== undefined;

/** The roles a device reading supports, in display order. */
export function rolesOf(device) {
  const roles = [];
  const add = (role, condition = true) => {
    if (condition) {
      roles.push(role);
    }
  };
  if (device.family === 'feeder') {
    if (device.dual) {
      add('feed-1');
      add('feed-2');
    } else {
      add('feed');
    }
    for (const { hopper } of device.food) {
      add(hopper === 0 ? 'food' : `food-${hopper}`);
    }
    add('food-left', defined(device.foodLeft));
    device.dispensed.forEach((value, i) => {
      add(device.dual ? `dispensed-today-${i + 1}` : 'dispensed-today', defined(value));
    });
    add('last-meal');
    add('desiccant', defined(device.desiccantDays));
  } else if (device.family === 'litter') {
    add('clean');
    add('deodorize', device.canDeodorize);
    add('work-state');
    add('litter-level', defined(device.litterPercent));
    add('litter-low', defined(device.litterLow));
    add('waste-bin', defined(device.binFull));
    add('deodorizer-days', defined(device.deodorizerDays));
    add('spray-days', defined(device.sprayDays));
    add('deodorizer-low', defined(device.deodorizerLow));
    add('uses-today');
    add('last-used-by');
  } else {
    add('water', defined(device.waterLow));
    add('filter', defined(device.filterPercent));
    add('filter-days', defined(device.filterDays));
    add('pump', defined(device.pumpRunning));
    add('drinks-today', defined(device.drinksToday));
    add('waste-tank', defined(device.wasteFull));
  }
  add('battery', defined(device.battery));
  add('error', defined(device.error));
  add('online', defined(device.online));
  return roles;
}

function feature(ids, role, language, unit) {
  return {
    name: featureName(role, language, unit),
    external_id: ids.feature(role),
    read_only: true,
    has_feedback: false,
    keep_history: true,
    ...FEATURES[role],
  };
}

function params(entries) {
  return entries
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([name, value]) => ({ name, value: String(value) }));
}

/**
 * The Gladys devices of the account: its devices, then its pets (when it has a
 * litter box). `roles`: deviceId -> the roles seen so far (a feature never
 * disappears because one reading lacked its field).
 */
export function buildDevices(gladys, account, roles, language) {
  const family = (id) => account.families.get(id)?.name;
  const devices = account.devices.map((device) => {
    const ids = deviceIds(gladys, device.id);
    const own = roles.get(device.id) ?? rolesOf(device);
    return {
      name: deviceName(device),
      external_id: ids.device,
      features: own.map((role) => feature(ids, role, language, device.unit)),
      params: params([
        ['family', family(device.groupId)],
        ['model', device.type],
        ['serial_number', device.serial],
        ['firmware', device.firmware],
        ['petkit_id', device.id],
      ]),
    };
  });
  const hasLitterBox = account.devices.some((d) => d.family === 'litter');
  const pets = hasLitterBox
    ? account.pets.map((pet) => {
        const ids = petIds(gladys, pet.id);
        return {
          name: petName(pet, language),
          external_id: ids.device,
          features: PET_ROLES.map((role) => feature(ids, role, language)),
          params: params([
            ['family', family(pet.groupId)],
            ['petkit_id', pet.id],
          ]),
        };
      })
    : [];
  return [...devices, ...pets];
}

const state = (ids, role, value) => ({ device_feature_external_id: ids.feature(role), ...value });
const level = (low, high = false) => (low ? GLADYS.LOW : high ? GLADYS.HIGH : GLADYS.NORMAL);
const cut = (value, max = LIMITS.eventText) => (value.length > max ? value.slice(0, max) : value);

export function errorText(error, language) {
  if (error === null) {
    return word(NO_ERROR, language);
  }
  return error === 'breakdown' ? word(BREAKDOWN, language) : cut(String(error));
}

/** The current values of a device (sent when they change). */
export function deviceStates(ids, device, language) {
  const states = [];
  const put = (role, value) => {
    if (value !== undefined) {
      states.push(state(ids, role, typeof value === 'string' ? { text: value } : { state: value }));
    }
  };
  if (device.online !== undefined) {
    put('online', device.online ? GLADYS.ON : GLADYS.OFF);
  }
  if (device.error !== undefined) {
    put('error', errorText(device.error, language));
  }
  put('battery', device.battery);
  if (device.family === 'feeder') {
    for (const { hopper, low } of device.food) {
      put(hopper === 0 ? 'food' : `food-${hopper}`, level(low));
    }
    put('food-left', device.foodLeft);
    device.dispensed.forEach((value, i) => {
      put(device.dual ? `dispensed-today-${i + 1}` : 'dispensed-today', value);
    });
    put('desiccant', device.desiccantDays);
  } else if (device.family === 'litter') {
    put('work-state', word(WORK_STATE_NAMES[device.workState] ?? WORK_STATE_NAMES.busy, language));
    put('litter-level', device.litterPercent);
    if (device.litterLow !== undefined) {
      put('litter-low', level(device.litterLow));
    }
    if (device.binFull !== undefined) {
      put('waste-bin', level(false, device.binFull));
    }
    put('deodorizer-days', device.deodorizerDays);
    put('spray-days', device.sprayDays);
    if (device.deodorizerLow !== undefined) {
      put('deodorizer-low', level(device.deodorizerLow));
    }
    put('uses-today', device.usesToday);
  } else {
    if (device.waterLow !== undefined) {
      put('water', level(device.waterLow));
    }
    put('filter', device.filterPercent);
    put('filter-days', device.filterDays);
    if (device.pumpRunning !== undefined) {
      put('pump', device.pumpRunning ? GLADYS.ON : GLADYS.OFF);
    }
    put('drinks-today', device.drinksToday);
    if (device.wasteFull !== undefined) {
      put('waste-tank', level(false, device.wasteFull));
    }
  }
  return states;
}

const dated = (ids, role, value, at, now, key) => ({
  ...state(ids, role, value),
  created_at: new Date(Math.min(at, now)).toISOString(),
  key,
});

/** The name of the pet of a visit, as the litter box and the events show it. */
export function visitPetName(visit, pets, language) {
  const pet = visit.petId === undefined ? undefined : pets.find((p) => p.id === visit.petId);
  return pet ? petName(pet, language) : (visit.petName ?? word(UNKNOWN_PET, language));
}

/**
 * The values that belong to a moment (a meal, a visit), dated with it. `key`
 * tells them apart: each is sent once, even when equal to the previous one.
 */
export function datedStates(ids, device, { pets = [], language, now }) {
  const states = [];
  if (device.family === 'feeder') {
    const meal = device.meals.at(-1);
    if (meal) {
      states.push(dated(ids, 'last-meal', { state: meal.amount }, meal.at, now, meal.key));
    }
  } else if (device.family === 'litter') {
    const visit = device.visits.at(-1);
    if (visit) {
      const name = cut(visitPetName(visit, pets, language));
      states.push(dated(ids, 'last-used-by', { text: name }, visit.at, now, visit.key));
    }
  }
  return states;
}

/** The values of a pet: visits of the day, and its last visit and weight, dated. */
export function petStates(ids, stats, now) {
  const current = [state(ids, 'visits-today', { state: stats.visitsToday })];
  const moments = [];
  if (stats.weighed) {
    const kg = Math.round(stats.weighed.weight / 10) / 100;
    moments.push(dated(ids, 'weight', { state: kg }, stats.weighed.at, now, stats.weighed.key));
  }
  if (stats.last?.duration !== undefined) {
    const { duration, at, key } = stats.last;
    moments.push(dated(ids, 'visit-duration', { state: duration }, at, now, key));
  }
  return { current, moments };
}
