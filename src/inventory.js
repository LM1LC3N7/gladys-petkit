// -----------------------------------------------------------------------------
// PetKit answers -> plain objects (pure).
//
// group/family/list (+ discovery/device_roster_v2 for the devices shared in a
// family) gives the devices and the pets; device_detail (Wi-Fi devices) or
// deviceData (Bluetooth fountains) the state of each device; the records of
// the day the meals and the litter box visits. Field names follow
// py-petkit-api's models. A field PetKit leaves out stays undefined: the
// features are built from what each device reports.
// -----------------------------------------------------------------------------

import { dayOf, parseInstant, zonedInstant } from './clock.js';
import {
  BLE_FOUNTAINS,
  FEEDING,
  LITTER_WITH_CAMERA,
  MEAL_SOURCES,
  PET_VISIT_EVENT,
  WORK_MODES,
  familyOf,
} from './constants.js';

/** A finite number, undefined otherwise. */
export const numberOf = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

/** true / false from a boolean or 0/1, undefined otherwise. */
export const flagOf = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  const number = numberOf(value);
  return number === undefined ? undefined : number !== 0;
};

const textOf = (value) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const idOf = (value) => {
  const number = numberOf(value);
  return number === undefined || number <= 0 ? undefined : String(Math.trunc(number));
};

const percentOf = (value) => {
  const number = numberOf(value);
  return number === undefined || number < 0 ? undefined : Math.min(100, Math.round(number));
};

/** The list of an answer: a bare array or `{ list: [...] }`. */
const listOf = (value) =>
  Array.isArray(value) ? value : Array.isArray(value?.list) ? value.list : [];

/**
 * The devices and pets of the family list, plus the shared devices of the
 * families whose own list is empty (`rosters`: groupId -> roster devices).
 */
export function readFamilies(groups, rosters = new Map()) {
  const families = new Map();
  const devices = new Map();
  const pets = new Map();
  const skipped = new Map();
  const add = ({ id, type, name, groupId }) => {
    if (id === undefined || !type || devices.has(id) || skipped.has(id)) {
      return;
    }
    const family = familyOf(type);
    if (!family) {
      skipped.set(id, { id, type });
      return;
    }
    devices.set(id, { id, type, family, name, groupId });
  };
  for (const group of Array.isArray(groups) ? groups : []) {
    const groupId = idOf(group?.groupId);
    if (groupId !== undefined) {
      families.set(groupId, { id: groupId, name: textOf(group.name) });
    }
    for (const d of Array.isArray(group?.deviceList) ? group.deviceList : []) {
      add({
        id: idOf(d?.deviceId),
        type: textOf(d?.deviceType)?.toLowerCase(),
        name: textOf(d?.deviceName),
        groupId,
      });
    }
    for (const d of rosters.get(groupId) ?? []) {
      add({
        id: idOf(d?.id),
        type: textOf(d?.type)?.toLowerCase(),
        name: textOf(d?.name) ?? textOf(d?.deviceName),
        groupId,
      });
    }
    for (const p of Array.isArray(group?.petList) ? group.petList : []) {
      const id = idOf(p?.petId);
      if (id !== undefined && !pets.has(id)) {
        pets.set(id, { id, name: textOf(p.petName), groupId });
      }
    }
  }
  return {
    families,
    devices: [...devices.values()],
    pets: [...pets.values()],
    skipped: [...skipped.values()],
  };
}

/** The families whose device list is empty: their devices may be shared ones. */
export const emptyFamilies = (groups) =>
  (Array.isArray(groups) ? groups : [])
    .filter((g) => idOf(g?.groupId) !== undefined)
    .filter((g) => !Array.isArray(g.deviceList) || g.deviceList.length === 0)
    .map((g) => idOf(g.groupId));

function common(base, detail, state) {
  const pim = numberOf(state?.pim);
  const errorText = textOf(state?.errorMsg) ?? textOf(state?.errorCode);
  return {
    ...base,
    name: textOf(detail?.name) ?? base.name,
    serial: textOf(detail?.sn),
    firmware: detail?.firmware === undefined ? undefined : String(detail.firmware),
    online: pim === undefined ? undefined : pim !== 0,
    // An error field present but empty: no error.
    error: errorText ?? (state && ('errorMsg' in state || 'errorCode' in state) ? null : undefined),
  };
}

// --- Feeders -------------------------------------------------------------------

/** The meals the feeder dispensed (feed records of the day, executed without error). */
export function readMeals(type, records, zone) {
  const days = Array.isArray(records) ? records : Array.isArray(records?.feed) ? records.feed : [];
  const dual = FEEDING[type]?.hoppers === 2;
  const meals = [];
  for (const day of days) {
    for (const item of Array.isArray(day?.items) ? day.items : []) {
      const state = item?.state;
      if (!state || numberOf(item.status) === 1) {
        continue; // pending, or cancelled
      }
      if (numberOf(state.errCode) !== 0 || numberOf(state.result) !== 0) {
        continue; // skipped or failed
      }
      const amount = dual
        ? (numberOf(state.realAmount1) ?? numberOf(item.amount1) ?? 0) +
          (numberOf(state.realAmount2) ?? numberOf(item.amount2) ?? 0)
        : (numberOf(state.realAmount) ?? numberOf(item.amount));
      const at =
        parseInstant(state.completedAt) ??
        parseInstant(item.completedAt) ??
        zonedInstant(day.day, numberOf(item.time), zone);
      if (amount === undefined || at === undefined) {
        continue;
      }
      meals.push({
        key: `${day.day ?? ''}:${item.id ?? item.time}`,
        at,
        amount,
        source: MEAL_SOURCES[numberOf(item.src)] ?? 'other',
      });
    }
  }
  return meals.sort((a, b) => a.at - b.at);
}

export function readFeeder(base, detail, records, { zone }) {
  const state = detail?.state ?? {};
  const spec = FEEDING[base.type];
  const dual = spec.hoppers === 2;
  const feed = state.feedState ?? {};
  const low = (value, threshold = 1) => {
    const number = numberOf(value);
    return number === undefined ? undefined : number < threshold;
  };
  const food = dual
    ? [
        { hopper: 1, low: low(state.food1) },
        { hopper: 2, low: low(state.food2) },
      ]
    : [{ hopper: 0, low: low(state.food, base.type === 'd3' ? 2 : 1) }];
  const dispensed = dual
    ? [numberOf(feed.realAmountTotal1), numberOf(feed.realAmountTotal2)]
    : [numberOf(feed.realAmountTotal)];
  const batteryPower = numberOf(state.batteryPower);
  return {
    ...common(base, detail, state),
    unit: spec.unit,
    dual,
    food: food.filter((f) => f.low !== undefined),
    foodLeft: percentOf(state.percent),
    dispensed,
    desiccantDays: numberOf(state.desiccantLeftDays),
    battery: batteryPower === undefined ? undefined : Math.max(0, Math.min(100, batteryPower * 25)),
    meals: readMeals(base.type, records, zone),
  };
}

// --- Litter boxes ----------------------------------------------------------------

/** The pet visits of a litter box: records (eventType 10) or getPetOutGraph entries. */
export function readVisits(type, records) {
  const camera = LITTER_WITH_CAMERA.includes(type);
  const visits = [];
  for (const r of listOf(records)) {
    if (!camera && numberOf(r?.eventType) !== PET_VISIT_EVENT) {
      continue;
    }
    const content = r?.content ?? {};
    const timeIn = numberOf(content.timeIn);
    const timeOut = numberOf(content.timeOut);
    const at = parseInstant(timeOut) ?? parseInstant(camera ? r?.time : r?.timestamp);
    if (at === undefined) {
      continue;
    }
    const length =
      numberOf(r?.toiletTime) ??
      (timeIn !== undefined && timeOut !== undefined ? timeOut - timeIn : undefined);
    const weight = numberOf(content.petWeight);
    const petId = idOf(r?.petId);
    visits.push({
      key: textOf(r?.eventId) ?? `${petId ?? '-'}:${at}`,
      at,
      petId,
      petName: textOf(r?.petName),
      weight: weight !== undefined && weight > 0 ? weight : undefined,
      duration: length !== undefined && length >= 0 ? length : undefined,
    });
  }
  return visits.sort((a, b) => a.at - b.at);
}

/** What the litter box is doing: idle, cleaning, paused… (Home Assistant map_work_state). */
export function workStateOf(work) {
  if (!work || typeof work !== 'object') {
    return 'idle';
  }
  const mode = WORK_MODES[numberOf(work.workMode)];
  if (!mode) {
    return 'busy';
  }
  const major = Math.floor((numberOf(work.workProcess) ?? 0) / 10);
  return major === 2 || major === 4 ? 'paused' : mode;
}

export function readLitter(base, detail, records, { zone, now }) {
  const state = detail?.state ?? {};
  const visits = readVisits(base.type, records);
  const today = dayOf(now, zone);
  const liquidLack = flagOf(state.liquidLack);
  const liquidEmpty = flagOf(state.liquidEmpty);
  return {
    ...common(base, detail, state),
    litterPercent: percentOf(state.sandPercent),
    litterLow: flagOf(state.sandLack),
    binFull: flagOf(state.boxFull),
    deodorizerDays: numberOf(state.deodorantLeftDays),
    sprayDays: numberOf(state.sprayLeftDays),
    deodorizerLow:
      liquidLack === undefined && liquidEmpty === undefined
        ? undefined
        : Boolean(liquidLack || liquidEmpty),
    workState: workStateOf(state.workState),
    usesToday:
      numberOf(detail?.inTimes) ?? visits.filter((v) => dayOf(v.at, zone) === today).length,
    canDeodorize:
      ['t3', 't5', 't7'].includes(base.type) || (base.type === 't4' && Boolean(detail?.k3Device)),
    visits,
  };
}

// --- Fountains -------------------------------------------------------------------

export function readFountain(base, detail) {
  const ble = BLE_FOUNTAINS.includes(base.type);
  const state = detail?.state ?? {};
  let waterLow;
  let pumpRunning;
  if (ble) {
    waterLow = flagOf(detail?.lackWarning);
    // The W5 sends powerStatus and runStatus at the top level.
    const status = detail?.status ?? detail ?? {};
    const power = numberOf(status.powerStatus);
    const run = numberOf(status.runStatus);
    pumpRunning = power === 0 ? false : run === undefined ? undefined : run > 0;
  } else {
    const cwt = numberOf(state.cwtState);
    waterLow = cwt === undefined ? undefined : cwt === 2 || cwt === 3;
    pumpRunning = flagOf(state.pumpState);
  }
  const electricity = detail?.electricity ?? {};
  const voltage = numberOf(electricity.batteryVoltage);
  const wt = numberOf(state.wtState);
  const breakdown = flagOf(detail?.breakdownWarning);
  const shared = common(base, detail, ble ? undefined : state);
  return {
    ...shared,
    ble,
    error: breakdown ? 'breakdown' : shared.error,
    waterLow,
    filterPercent: percentOf(detail?.filterPercent),
    filterDays: numberOf(state.filterLeftDays),
    filterWarning: flagOf(detail?.filterWarning),
    pumpRunning,
    battery:
      voltage !== undefined && voltage > 0 ? percentOf(electricity.batteryPercent) : undefined,
    drinksToday: numberOf(detail?.drinkCount),
    wasteFull: wt === undefined ? undefined : wt === 2,
  };
}

/** One device, from its family entry and its answers. */
export function readDevice(base, { detail, records } = {}, context) {
  switch (base.family) {
    case 'feeder':
      return readFeeder(base, detail, records, context);
    case 'litter':
      return readLitter(base, detail, records, context);
    default:
      return readFountain(base, detail);
  }
}

/** Per pet: the visits of the day, the last visit, and the last one with a weight. */
export function petStats(pets, devices, { zone, now }) {
  const today = dayOf(now, zone);
  const stats = new Map(
    pets.map((p) => [p.id, { visitsToday: 0, last: undefined, weighed: undefined }]),
  );
  for (const device of devices) {
    for (const visit of device.visits ?? []) {
      const entry = stats.get(visit.petId);
      if (!entry) {
        continue;
      }
      if (dayOf(visit.at, zone) === today) {
        entry.visitsToday += 1;
      }
      const dated = { ...visit, deviceId: device.id };
      if (!entry.last || visit.at > entry.last.at) {
        entry.last = dated;
      }
      if (visit.weight !== undefined && (!entry.weighed || visit.at > entry.weighed.at)) {
        entry.weighed = dated;
      }
    }
  }
  return stats;
}
