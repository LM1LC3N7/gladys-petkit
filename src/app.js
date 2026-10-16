// -----------------------------------------------------------------------------
// The integration: the PetKit account (user name, password, server), the
// device list (group/family/list, every 30 minutes and on a Discovery scan),
// one read of each device per poll (its state, and the records of the day for
// the feeders and litter boxes), the Gladys devices and states, the scene
// events, the feeding and litter box commands, the transport badges and the
// "Test the connection" button. index.js only wires the SDK handlers to it.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { PetkitClient } from './client.js';
import { dayOf } from './clock.js';
import { normalizeConfig } from './config.js';
import {
  BLE_FOUNTAINS,
  FEEDER_RECORDS,
  FEEDING,
  LIMITS,
  LITTER_ACTIONS,
  LITTER_WITH_CAMERA,
  SCENE_TRIGGERS,
  TIMINGS,
} from './constants.js';
import {
  COMMAND_ROLES,
  buildDevices,
  datedStates,
  deviceIds,
  deviceName,
  deviceStates,
  parseDeviceId,
  parseFeatureId,
  petIds,
  petName,
  petStates,
  rolesOf,
  visitPetName,
} from './devices.js';
import { deviceEvents, snapshotOf } from './events.js';
import { ALERT_NAMES, T, age, word } from './i18n.js';
import { emptyFamilies, petStats, readDevice, readFamilies } from './inventory.js';
import { StatePublisher } from './publisher.js';
import { errorReason } from './petkit.js';
import { fileStore, normalizeMemory } from './store.js';

const cut = (text, max = LIMITS.eventText) => (text.length > max ? text.slice(0, max) : text);

/** Errors after which only a change of the configuration (or the test button) helps. */
const STOPS = new Set(['refused', 'unknown_account', 'no_credentials']);
/** Errors of the whole account: the read stops there. The others concern one device. */
const DEVICE_ERRORS = new Set(['device', 'api', 'bad_response']);
/** Errors meaning PetKit did not answer usefully: the devices are unreachable. */
const OFFLINE = new Set(['network', 'timeout', 'unavailable', 'bad_response', 'size', 'http']);

export class PetkitApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'petkit' }),
    transport,
    now = Date.now,
    timers = globalThis,
    store = fileStore(),
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.store = store;
    this.client = new PetkitClient({
      transport,
      now,
      onSession: (state) => this.saveSession(state),
    });
    this.publisher = new StatePublisher({ gladys, logger, now, timers });
    this.config = normalizeConfig();
    /** The family list read last (readFamilies), and when. */
    this.inventory = undefined;
    this.inventoryAt = undefined;
    this.inventoryDue = false;
    /** The last account read: inventory + the device readings. */
    this.account = undefined;
    this.readAt = undefined;
    /** deviceId -> the raw records of the last read that had them */
    this.lastRecords = new Map();
    /** deviceId -> roles seen so far */
    this.roles = new Map();
    /** deviceId -> snapshot of the previous reading, for the events */
    this.snapshots = new Map();
    /** featureId -> key of the dated state last queued */
    this.sentDated = new Map();
    /** deviceId -> times of the feed commands sent from Gladys (no scene event for them) */
    this.echoes = new Map();
    this.published = undefined;
    /** deviceId -> badge last published (JSON) */
    this.transports = new Map();
    this.timer = undefined;
    this.soonTimer = undefined;
    this.running = undefined;
    this.generation = 0;
    /** The status that stopped the polling until the configuration changes. */
    this.stopped = undefined;
    this.offline = false;
    this.connectedOnce = false;
    this.failures = 0;
    this.pausedUntil = 0;
    this.lastTestAt = -Infinity;
    this.memory = normalizeMemory(null);
    this.started = false;
    this.lastStatus = undefined;
    this.warned = new Set();
  }

  // --- Lifecycle -------------------------------------------------------------

  /** `fresh`: the user changed the account, a sign-in may happen at once. */
  async start(raw = {}, { fresh = false } = {}) {
    this.stop();
    await this.running;
    this.config = normalizeConfig(raw);
    this.reset();
    this.memory = normalizeMemory(await this.store.load().catch(() => null));
    const { username, password, region, timezone, account } = this.config;
    const mine = this.memory.account === account;
    if (!mine) {
      this.memory = { account, session: null, lastLoginAt: undefined };
    }
    this.client.configure({
      username,
      password,
      region,
      timezone,
      session: this.memory.session,
      lastLoginAt: this.memory.lastLoginAt,
      allowLogin: fresh || !mine,
    });
    if (this.config.timezoneInvalid) {
      this.logger.warn(`Unknown time zone "${raw.timezone}": using ${timezone}`);
    }
    this.publisher.start();
    if (!this.client.hasCredentials) {
      await this.setStatus(false, T.noCredentials);
      return;
    }
    await this.setStatus(false, T.connecting);
    this.schedule();
    await this.tick();
  }

  stop() {
    this.generation += 1;
    if (this.timer) {
      this.timers.clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.soonTimer) {
      this.timers.clearTimeout(this.soonTimer);
      this.soonTimer = undefined;
    }
    this.publisher.stop();
  }

  /** Forgets the account and the failures: a new account, or a restart. */
  reset() {
    this.inventory = undefined;
    this.inventoryAt = undefined;
    this.inventoryDue = false;
    this.account = undefined;
    this.readAt = undefined;
    this.lastRecords.clear();
    this.roles.clear();
    this.snapshots.clear();
    this.sentDated.clear();
    this.echoes.clear();
    this.published = undefined;
    this.transports.clear();
    this.stopped = undefined;
    this.offline = false;
    this.connectedOnce = false;
    this.failures = 0;
    this.pausedUntil = 0;
  }

  schedule() {
    if (this.timer) {
      this.timers.clearInterval(this.timer);
    }
    this.timer = this.timers.setInterval(() => {
      this.tick().catch((err) => this.logger.error(`PetKit refresh failed: ${err.message}`));
    }, this.config.pollInterval * 1000);
  }

  /** A read soon after a command, to show its result. */
  soon() {
    if (this.soonTimer) {
      this.timers.clearTimeout(this.soonTimer);
    }
    this.soonTimer = this.timers.setTimeout(() => {
      this.soonTimer = undefined;
      this.tick().catch((err) => this.logger.error(`PetKit refresh failed: ${err.message}`));
    }, TIMINGS.afterCommand);
  }

  /**
   * Connected to Gladys. The first time, start; after a reconnection (Gladys
   * restarted), resend what Gladys keeps in memory only (Discovery list,
   * status, badges) without reading PetKit again.
   */
  async connected(raw = {}) {
    if (!this.started) {
      this.started = true;
      await this.start(raw);
      return;
    }
    await this.configUpdated(raw);
    this.published = undefined;
    this.transports.clear();
    const status = this.lastStatus;
    this.lastStatus = undefined;
    if (status) {
      const [connected, message] = JSON.parse(status);
      await this.setStatus(connected, message ?? undefined);
    }
    await this.publishDevices();
    await this.publishAllTransports();
  }

  /** A new account restarts; a new interval reschedules; a new language renames. */
  async configUpdated(raw = {}) {
    const next = normalizeConfig(raw);
    const previous = this.config;
    if (
      next.username !== previous.username ||
      next.password !== previous.password ||
      next.region !== previous.region ||
      next.timezone !== previous.timezone
    ) {
      return this.start(raw, { fresh: true });
    }
    this.config = next;
    if (next.pollInterval !== previous.pollInterval && this.timer) {
      this.schedule();
    }
    if (next.language !== previous.language) {
      await this.publishDevices();
    }
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  async saveSession({ session, lastLoginAt }) {
    this.memory = { account: this.config.account, session, lastLoginAt };
    await this.store
      .save(this.memory)
      .catch((err) => this.logger.warn(`Saving the session to /data failed: ${err.message}`));
  }

  // --- Polling ---------------------------------------------------------------

  /** One run at a time: a tick during a run joins it. */
  tick() {
    if (!this.running) {
      this.running = this.run().finally(() => {
        this.running = undefined;
      });
    }
    return this.running;
  }

  async run() {
    const generation = this.generation;
    if (!this.client.hasCredentials || this.stopped || this.now() < this.pausedUntil) {
      return;
    }
    try {
      const account = await this.read();
      if (generation !== this.generation) {
        return;
      }
      await this.apply(account);
      this.failures = 0;
      this.offline = false;
      this.connectedOnce = true;
      await this.setStatus(true, this.statusMessage());
    } catch (err) {
      if (generation !== this.generation) {
        return;
      }
      await this.failed(err);
    }
    await this.publishAllTransports();
    await this.publisher
      .flush()
      .catch((err) => this.logger.warn(`Sending to Gladys failed: ${err.message}`));
  }

  /** The device list when it is due, then each device. */
  async read() {
    const now = this.now();
    const zone = this.config.timezone;
    if (!this.inventory || this.inventoryDue || now - this.inventoryAt >= TIMINGS.inventoryAge) {
      const groups = await this.client.families();
      const rosters = new Map();
      for (const groupId of emptyFamilies(groups)) {
        try {
          rosters.set(groupId, await this.client.roster(groupId, dayOf(now, zone)));
        } catch (err) {
          if (!DEVICE_ERRORS.has(err.kind)) {
            throw err;
          }
          this.logger.warn(`Shared devices of family ${groupId}: ${errorReason(err)}`);
        }
      }
      this.inventory = readFamilies(groups, rosters);
      this.inventoryAt = now;
      this.inventoryDue = false;
    }
    const devices = [];
    for (const base of this.inventory.devices) {
      devices.push(await this.readOne(base, now, zone));
    }
    return { ...this.inventory, devices };
  }

  /** The state of one device, and its records of the day when it has some. */
  async readOne(base, now, zone) {
    const { client } = this;
    let detail;
    try {
      detail =
        base.family === 'fountain' && BLE_FOUNTAINS.includes(base.type)
          ? await client.bleData(base.type, base.id)
          : await client.detail(base.type, base.id);
    } catch (err) {
      if (!DEVICE_ERRORS.has(err.kind)) {
        throw err;
      }
      this.warnOnce(`detail:${base.id}`, `${base.type} ${base.id}: ${errorReason(err)}`);
      const previous = this.account?.devices.find((d) => d.id === base.id);
      return { ...(previous ?? readDevice(base, {}, { zone, now })), unreachable: true };
    }
    let records;
    const request = this.recordsRequest(base, now, zone);
    if (request) {
      try {
        records = await client.records(base.type, request.endpoint, request.query);
        this.lastRecords.set(base.id, records);
      } catch (err) {
        if (!DEVICE_ERRORS.has(err.kind)) {
          throw err;
        }
        this.warnOnce(`records:${base.id}`, `${base.type} ${base.id} records: ${errorReason(err)}`);
        records = this.lastRecords.get(base.id);
      }
    }
    return readDevice(base, { detail, records }, { zone, now });
  }

  /** The record call of a device: the meals of a feeder, the visits of a litter box. */
  recordsRequest(base, now, zone) {
    const day = dayOf(now, zone);
    if (base.family === 'feeder') {
      return { endpoint: FEEDER_RECORDS[base.type], query: { days: day, deviceId: base.id } };
    }
    if (base.family !== 'litter') {
      return undefined;
    }
    if (LITTER_WITH_CAMERA.includes(base.type)) {
      const timestamp = Math.floor(now / 1000);
      return { endpoint: 'getPetOutGraph', query: { timestamp, deviceId: base.id } };
    }
    const key = base.type === 't3' ? 'day' : 'date';
    return { endpoint: 'getDeviceRecord', query: { [key]: Number(day), deviceId: base.id } };
  }

  warnOnce(key, message) {
    if (!this.warned.has(key)) {
      this.warned.add(key);
      this.logger.warn(message);
    }
  }

  counts() {
    return {
      families: this.account?.families.size ?? 0,
      devices: this.account?.devices.length ?? 0,
      pets: this.petsShown().length,
    };
  }

  /** The pets get a device when the account has a litter box. */
  petsShown() {
    const account = this.account;
    return account?.devices.some((d) => d.family === 'litter') ? account.pets : [];
  }

  statusMessage() {
    return T.connected(this.counts(), this.client.session?.expiresAt);
  }

  async failed(err) {
    const reason = errorReason(err);
    const pauseUntil = async (until, message, { connected = false } = {}) => {
      this.pausedUntil = until;
      await this.setStatus(connected, message);
      this.logger.warn(
        `PetKit: ${reason}; next try in ${Math.round((until - this.now()) / 1000)} s`,
      );
    };
    if (STOPS.has(err.kind) || (err.kind === 'kicked' && this.client.kicks >= 2)) {
      // Never signed in again by itself: the account needs the user.
      const message =
        err.kind === 'refused'
          ? T.refused
          : err.kind === 'unknown_account'
            ? T.unknownAccount(this.config.region)
            : err.kind === 'kicked'
              ? T.kickedStop
              : T.noCredentials;
      this.stopped = message;
      this.logger.warn(`PetKit: ${reason}; waiting for a configuration change`);
      await this.setStatus(false, message);
      return;
    }
    this.failures += 1;
    if (err.kind === 'kicked' || err.kind === 'login_wait' || err.kind === 'session') {
      const until = Math.max(this.client.nextLoginAt, this.now() + TIMINGS.backoff[0]);
      const wait = age(until - this.now());
      await pauseUntil(until, err.kind === 'kicked' ? T.kicked(wait) : T.loginWait(wait));
      return;
    }
    if (err.kind === 'busy') {
      await pauseUntil(this.now() + TIMINGS.busyPause, T.busy(age(TIMINGS.busyPause)), {
        connected: this.connectedOnce,
      });
      return;
    }
    const wait = TIMINGS.backoff[Math.min(this.failures - 1, TIMINGS.backoff.length - 1)];
    this.offline = OFFLINE.has(err.kind) || this.offline;
    await pauseUntil(this.now() + wait, T.unreachable(reason, age(wait)));
  }

  async apply(account) {
    this.account = account;
    this.readAt = this.now();
    for (const device of account.skipped) {
      this.warnOnce(
        `skip:${device.id}`,
        `Device ${device.id} (${device.type}) is not supported yet: ignored`,
      );
    }
    for (const device of account.devices) {
      const seen = this.roles.get(device.id) ?? [];
      const current = rolesOf(device);
      this.roles.set(device.id, [...current, ...seen.filter((r) => !current.includes(r))]);
    }
    await this.publishDevices();
    this.queueStates();
    this.queueEvents();
  }

  // --- Gladys ----------------------------------------------------------------

  async publishDevices() {
    if (!this.account) {
      return;
    }
    const devices = buildDevices(this.gladys, this.account, this.roles, this.config.language);
    const json = JSON.stringify(devices);
    if (json === this.published) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.published = json;
    } catch (err) {
      this.logger.warn(`Publishing the discovered devices failed: ${err.message}`);
    }
  }

  createdFeatures() {
    return new Set(
      (this.gladys.devices ?? []).flatMap((d) => (d.features ?? []).map((f) => f.external_id)),
    );
  }

  /** The states of the created features: current values, and dated ones once each. */
  queueStates(created = this.createdFeatures()) {
    if (!this.account) {
      return;
    }
    const now = this.now();
    const { language, timezone: zone } = this.config;
    const queue = (states) => {
      for (const { device_feature_external_id: id, ...value } of states) {
        if (created.has(id)) {
          this.publisher.push(id, value);
        }
      }
    };
    const queueDated = (states) => {
      for (const { device_feature_external_id: id, key, ...value } of states) {
        if (created.has(id) && this.sentDated.get(id) !== key) {
          this.sentDated.set(id, key);
          this.publisher.pushEvent(id, value);
        }
      }
    };
    const { devices, pets } = this.account;
    for (const device of devices) {
      if (device.unreachable) {
        continue;
      }
      const ids = deviceIds(this.gladys, device.id);
      queue(deviceStates(ids, device, language));
      queueDated(datedStates(ids, device, { pets, language, now }));
    }
    const shown = this.petsShown();
    if (shown.length > 0) {
      const stats = petStats(shown, devices, { zone, now });
      for (const pet of shown) {
        const { current, moments } = petStates(petIds(this.gladys, pet.id), stats.get(pet.id), now);
        queue(current);
        queueDated(moments);
      }
    }
  }

  /** Whether a meal is the answer to a feed command from Gladys (no scene event then). */
  isEcho(device, meal) {
    const sent = (this.echoes.get(device.id) ?? []).filter(
      (at) => this.now() - at <= TIMINGS.commandEcho,
    );
    const index = sent.findIndex(
      (at) =>
        meal.source === 'app' && meal.at >= at - 60_000 && meal.at <= at + TIMINGS.commandEcho,
    );
    if (index >= 0) {
      sent.splice(index, 1);
    }
    this.echoes.set(device.id, sent);
    return index >= 0;
  }

  /** The scene events since the previous reading of each device. */
  queueEvents() {
    const now = this.now();
    const { language } = this.config;
    const { devices, pets } = this.account;
    for (const device of devices) {
      if (device.unreachable) {
        continue;
      }
      const previous = this.snapshots.get(device.id);
      const { events, stale } = deviceEvents(previous, device, now);
      this.snapshots.set(device.id, snapshotOf(device, previous));
      const name = cut(deviceName(device));
      const ids = deviceIds(this.gladys, device.id);
      for (const event of stale) {
        this.logger.info(
          `${name}: ${event.key} of ${new Date(event.at).toISOString()} is too old to fire`,
        );
      }
      for (const event of events) {
        const at = new Date(event.at).toISOString();
        if (event.key === SCENE_TRIGGERS.MEAL_DISPENSED) {
          if (this.isEcho(device, event)) {
            this.logger.info(`${name}: meal dispensed on Gladys's request (no scene event)`);
            continue;
          }
          this.logger.info(`${name}: meal dispensed (${event.amount} ${device.unit})`);
          this.publisher.pushSceneEvent(event.key, {
            feeder: ids.device,
            feeder_name: name,
            amount: event.amount,
            unit: device.unit,
            source: event.source,
            at,
          });
        } else if (event.key === SCENE_TRIGGERS.LITTER_BOX_USED) {
          const petName = cut(visitPetName(event, pets, language));
          const known = event.petId !== undefined && pets.some((p) => p.id === event.petId);
          this.logger.info(`${name}: used by ${petName}`);
          this.publisher.pushSceneEvent(event.key, {
            litter_box: ids.device,
            pet: known ? petIds(this.gladys, event.petId).device : null,
            litter_box_name: name,
            pet_name: petName,
            weight: event.weight === undefined ? null : Math.round(event.weight / 10) / 100,
            duration: event.duration ?? null,
            at,
          });
        } else {
          this.logger.info(`${name}: alert ${event.alert}`);
          this.publisher.pushSceneEvent(event.key, {
            device: ids.device,
            alert: event.alert,
            device_name: name,
            message: word(ALERT_NAMES[event.alert], language),
          });
        }
      }
    }
  }

  badge(entity) {
    if (this.stopped || this.offline) {
      return { transport: DEVICE_TRANSPORTS.UNREACHABLE };
    }
    if (entity.unreachable) {
      return { transport: DEVICE_TRANSPORTS.UNREACHABLE };
    }
    if (entity.online === false) {
      return { transport: DEVICE_TRANSPORTS.UNREACHABLE, degraded: true, message: T.offline };
    }
    return { transport: DEVICE_TRANSPORTS.CLOUD };
  }

  async publishAllTransports() {
    if (!this.account) {
      return;
    }
    const created = new Set((this.gladys.devices ?? []).map((d) => d.external_id));
    const entries = [];
    const add = (externalId, entity) => {
      if (!created.has(externalId)) {
        return;
      }
      const entry = { external_id: externalId, ...this.badge(entity) };
      const json = JSON.stringify(entry);
      if (this.transports.get(externalId) !== json) {
        this.transports.set(externalId, json);
        entries.push(entry);
      }
    };
    for (const device of this.account.devices) {
      add(deviceIds(this.gladys, device.id).device, device);
    }
    for (const pet of this.petsShown()) {
      add(petIds(this.gladys, pet.id).device, pet);
    }
    if (entries.length > 0) {
      await this.gladys
        .publishTransports(entries)
        .catch((err) => this.logger.warn(`Transport badges failed: ${err.message}`));
    }
  }

  forgetDated(device) {
    for (const f of device?.features ?? []) {
      this.sentDated.delete(f.external_id);
    }
  }

  /** A device was created (or updated): send its last values at once. */
  async deviceCreated(device) {
    this.transports.delete(device?.external_id);
    this.forgetDated(device);
    const created = this.createdFeatures();
    for (const f of device?.features ?? []) {
      created.add(f.external_id);
    }
    this.queueStates(created);
    await this.publisher
      .flush()
      .catch((err) => this.logger.warn(`Sending to Gladys failed: ${err.message}`));
    await this.publishAllTransports();
  }

  async deviceDeleted(device) {
    this.transports.delete(device?.external_id);
    this.forgetDated(device);
    if (device?.external_id) {
      this.publisher.forget(device.external_id);
    }
  }

  /** The Discovery tab asks for a scan: the device list again if the last read is old enough. */
  async scan() {
    if (
      this.client.hasCredentials &&
      !this.stopped &&
      (this.readAt === undefined || this.now() - this.readAt >= TIMINGS.testCooldown)
    ) {
      this.inventoryDue = true;
      await this.tick();
      return;
    }
    await this.publishDevices();
  }

  // --- Commands --------------------------------------------------------------

  deviceOf(id) {
    const device = this.account?.devices.find((d) => d.id === id);
    if (!device) {
      throw new Error(word(T.unknownDevice, this.config.language));
    }
    return device;
  }

  /** A push button: feed one portion, clean or deodorize the litter box. */
  async setValue(_device, feature, _value) {
    const target = parseFeatureId(feature?.external_id);
    if (!target || target.kind !== 'device' || !COMMAND_ROLES.includes(target.role)) {
      throw new Error(`${feature?.external_id} cannot be set`);
    }
    if (this.stopped) {
      throw new Error(word(this.stopped, this.config.language));
    }
    const device = this.deviceOf(target.id);
    if (target.role.startsWith('feed')) {
      const hopper = target.role === 'feed-2' ? 2 : 1;
      await this.feed(device, FEEDING[device.type]?.amounts[0], hopper);
      return;
    }
    try {
      await this.client.startAction(device.type, device.id, LITTER_ACTIONS[target.role]);
    } catch (err) {
      // The ack shows the message: PetKit's, with its code.
      throw new Error(errorReason(err), { cause: err });
    }
    this.logger.info(`${deviceName(device)}: ${target.role}`);
    this.soon();
  }

  /** Dispenses `amount` (grams or portions, the feeder's unit) now, from `hopper` (1 or 2). */
  async feed(device, amount, hopper = 1) {
    const language = this.config.language;
    const spec = FEEDING[device.type];
    if (!spec || device.family !== 'feeder') {
      throw new Error(word(T.notFeeder, language));
    }
    if (!spec.amounts.includes(amount)) {
      throw new Error(word(T.badAmount(spec.amounts, spec.unit), language));
    }
    const amounts =
      spec.hoppers === 2
        ? { amount1: hopper === 2 ? 0 : amount, amount2: hopper === 2 ? amount : 0 }
        : { amount };
    try {
      await this.client.feed(
        device.type,
        device.id,
        dayOf(this.now(), this.config.timezone),
        amounts,
      );
    } catch (err) {
      throw new Error(errorReason(err), { cause: err });
    }
    this.echoes.set(device.id, [...(this.echoes.get(device.id) ?? []), this.now()]);
    this.logger.info(`${deviceName(device)}: feeding ${amount} ${spec.unit}`);
    this.soon();
    return { amount, unit: spec.unit };
  }

  /** The "Feed" scene action: the feeder chosen in the scene, the amount, the hopper. */
  async sceneFeed(fields = {}) {
    if (this.stopped) {
      throw new Error(word(this.stopped, this.config.language));
    }
    const target = parseDeviceId(fields.feeder);
    if (!target || target.kind !== 'device') {
      throw new Error(word(T.notFeeder, this.config.language));
    }
    const device = this.deviceOf(target.id);
    return this.feed(device, Number(fields.amount), Number(fields.hopper ?? 1) === 2 ? 2 : 1);
  }

  // --- "Test the connection" button -----------------------------------------

  async testConnection() {
    if (!this.client.hasCredentials) {
      return T.noCredentials;
    }
    if (this.account && this.now() - this.lastTestAt < TIMINGS.testCooldown) {
      const summary = this.summary();
      return {
        en: `${T.test.cooldown.en} ${summary.en}`,
        fr: `${T.test.cooldown.fr} ${summary.fr}`,
      };
    }
    this.lastTestAt = this.now();
    // One sign-in per click: the button is how a stopped account is retried.
    this.stopped = undefined;
    this.pausedUntil = 0;
    this.client.allowLogin();
    this.client.kicks = 0;
    this.inventoryDue = true;
    await this.running;
    await this.tick();
    const [connected, message] = JSON.parse(this.lastStatus ?? '[false,null]');
    if (!connected || !this.account) {
      return message ?? T.noCredentials;
    }
    return this.summary();
  }

  /** The families, devices and pets, the unsupported devices and the session expiry. */
  summary() {
    const lines = [
      T.test.summary(this.counts(), this.config.region),
      ...(this.account?.devices ?? []).map((d) => ({
        en: `${deviceName(d)} (${d.type}).`,
        fr: `${deviceName(d)} (${d.type}).`,
      })),
      ...this.petsShown().map((p) => ({
        en: `${petName(p, 'en')}.`,
        fr: `${petName(p, 'fr')}.`,
      })),
      T.test.skipped(this.account?.skipped.length ?? 0),
      T.session(this.client.session?.expiresAt),
    ];
    const join = (language) =>
      lines
        .map((line) => line[language])
        .filter(Boolean)
        .join(' ');
    return { en: join('en'), fr: join('fr') };
  }
}
