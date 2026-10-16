# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors. Read **[TODO.md](./TODO.md) first**: status, decisions
already taken and the next milestones.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15), its only
runtime dependency (HTTPS goes through `node:https`). It signs in to the
PetKit cloud with a PetKit account (preferably a second account of the
family), reads the families, devices (feeders, litter boxes, Eversweet
fountains) and pets, turns them into Gladys devices and states, dispenses
food and starts the litter box actions, and fires scene events when a litter
box is used, a meal is dispensed or an alert starts. Unofficial, not
affiliated with PetKit.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js            SDK bootstrap only
src/handlers.js     every SDK handler -> the app (shared with the tests)
src/app.js          PetkitApp: poll loop, failures and pauses, devices,
                    states, scene events, commands, badges, test button
src/client.js       the account: server of the region, session, sign-in
                    rationing (15 min gap, kicked sessions), the calls
src/petkit.js       the only network access (node:https, gzip, settles once),
                    PetKit error codes, form and Python-style encodings
src/inventory.js    PetKit answers -> devices, meals, visits, pets (pure)
src/devices.js      -> Gladys devices, current and dated states (pure)
src/events.js       two readings of a device -> scene events (pure)
src/publisher.js    states within 300/min, dated states and scene events queued
src/clock.js        time zones: offsets, PetKit days, PetKit dates (pure)
src/store.js        /data/petkit-state.json: session, last sign-in
src/config.js       config_schema normalized, account key (hash)
src/constants.js    servers, paths, app identity, families, feeding, timings
src/i18n.js         runtime texts, feature names, states, alerts (en/fr)
test/fixtures/      PetKit answers shaped after py-petkit-api's recorded ones
test/helpers/       a fake PetKit cloud behind the transport; Gladys is the SDK's fake
```

## Rules

- **External ids are forever**: device = `device:<PetKit id>` or
  `pet:<PetKit id>`, feature = `<device>:<role>` (roles in
  `src/devices.js` FEATURES). Never change how they are built.
- Manifest keys (`username`, `password`, `region` and its values, `timezone`,
  `poll_interval`, `language`, `test_connection`, the three scene triggers,
  the `feed` scene action, their fields, variables and outputs, the alert
  values) are frozen: users store them in devices and scenes.
- Value conventions: the PetKit side is the API's (food 0 = empty, `pim` 0
  offline, `start_action` 0 clean / 2 deodorize, epoch seconds); the Gladys
  side the enums of the core `server/utils/constants.js` (level state 0 low,
  1 normal, 2 high; binary 1 = on; button push 1). The SDK exports the
  categories, types and units, not the values: they are in `src/constants.js`.
- Gladys has no mass unit: food amounts are `unknown`/`unknown` with "(g)" or
  "(portions)" in the name, pet weights "(kg)". Never send a unit Gladys does
  not accept for the category (test/devices.test.js holds the whitelist).
- Meals, visits and weights are dated states (`publisher.pushEvent`,
  publishStates), sent once per key; scene events go through
  `publisher.pushSceneEvent` and are never deduplicated. Never fire an event
  from a command received from Gladys (the meals Gladys asked for are
  skipped).
- **Sign-ins are rationed**: one session per PetKit account, a sign-in closes
  the session of the app. Never two automatic sign-ins within
  `TIMINGS.loginGap`; a refused password, an unknown account or a second
  kicked session stop until a configuration change or the test button.
  Never log or put in a status message the password, its hash or the session.
- Polling politely: one detail call per device, one record call per feeder and
  litter box, the device list every 30 minutes, 60 s minimum. Never add a call
  outside `PetkitClient`.
- Container limits: 256 MB RAM, 0.5 CPU, read-only rootfs, only `/data`
  writable, bridge network. Gladys rate limits: 300 states/min, 300 scene
  events/min.
- Tests never touch the network: the transport is injected
  (`test/petkit.test.js` uses a loopback server for the real one).
- Code, comments, README in English; `docs/en.md` and `docs/fr.md` kept in sync.
- Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md`; versions belong to the Release workflow.
