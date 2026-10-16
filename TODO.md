# TODO — PetKit v1

Handoff document: what is done, what was decided, what comes next. Keep it
up to date at the end of every milestone.

## Working method

- One milestone at a time, one commit per milestone, tests green before moving on.
- After each milestone: `npm run format:check`, `npm run lint`, `npm test`,
  `npm run audit`, then update README, `docs/en.md`, `docs/fr.md`,
  `CHANGELOG.md` and this file.
- The `gladys-assistant-integration` topic is added at the first real release
  only (before, the store would list an empty integration).
- No forum topic of its own, ever, and no forum post from a module session:
  the batch claimed in /t/10385 (post #214) gets one recap message there, with
  a link to each repo.

## Status

- [x] **Milestone 1 — core** (2026-10-16): PetKit account (e-mail or phone,
      password, server of the region from `v1/regionservers`, time zone of the
      devices), session kept in `/data` and renewed an hour before it expires,
      sign-ins rationed (15 minutes apart; a session closed soon after its
      sign-in = the PetKit app uses the same account: one more try, then a
      stop; refused password or unknown account: stop), device list every 30
      minutes (+ shared devices of the families), one detail and one record
      call per device per poll (120 s, 60–900), backoff, busy pause; devices
      for the feeders (7 types), litter boxes (5 types), fountains (5 types,
      Bluetooth ones as last synced), pets (with a litter box); push buttons
      feed / clean / deodorize, `feed` scene action; scene triggers
      `litter_box_used`, `meal_dispensed`, `alert_raised`; badges; "Test the
      connection"; en/fr names; docs en/fr. Tested against made-up answers
      shaped after py-petkit-api's recorded ones only.
- [ ] **Milestone 2 — real account**: run against a real account and compare
      with the app (see "To check on a real account"); turn the answers
      (anonymized) into fixtures; add the fallbacks real answers need.
- [ ] **Milestone 3 — more**:
  - real-time push: PetKit's MQTT (`user/iotDeviceInfo_v2`: Aliyun-style
    broker, HMAC credentials, `NewMessage` payloads), used by the Home
    Assistant integration only as a trigger to read again (`iot_mqtt.py`).
    Needs an MQTT 3.1.1 client over TLS (the `mqtt` package or our own) and
    the signing of the Aliyun credentials: not in milestone 1;
  - Bluetooth fountains through the relay (`ble/ownSupportBleDevices`,
    `ble/connect`, `ble/poll`, `ble/controlDevice`): fresh readings and the
    fountain commands (pause, mode, reset filter);
  - fountain drink records (`ctw3/getWorkRecord` with the user id,
    `w7h/getDeviceRecord`) and a "pet drank" trigger;
  - per-pet meals of the camera feeders (`eat` records with `petId`) and a
    "pet ate" trigger;
  - litter box: occupied (`petInTime`), pause/continue/stop, dump, level,
    maintenance mode, N50/N60 deodorizer resets, T6 bag counts
    (`packageInfo`), urine pH and soft stool (T7);
  - feeders: cancel a manual feed, food replenished (D4H/D4S/D4SH), reset the
    desiccant, suspend/restore the plan, skip today's meal, the plan itself;
  - fountain settings (mode, lamp ring, do not disturb), W7H flush/drain;
  - the air purifiers (K2 Air Magicube, K3 Air Smart Spray) and the Cozy bed;
  - the PetKit messages (`user/unreadStatus`) as scene events.
- [ ] **Milestone 4 — first release**: cover image, Docker image build check,
      `npx github:GladysAssistant/integration-store .`, Release workflow,
      topic, GHCR package public.

## To check on a real account

- The sign-in: does the `client` Python-dict string still pass, and the
  `region` of the first country of the server (`ad` for Europe, like Home
  Assistant)? The `expiresIn` of the session (a week?) and the format of
  `createdAt`. Whether a family member account sees the owner's devices in
  `group/family/list` or only through `discovery/device_roster_v2`, and the
  fields of a roster entry (`name`?).
- Code 5 timing: how fast is our session closed when the app signs in with
  the same account, and does a family member account really keep its own
  session?
- Feeders: `food` values per model (0 empty, 1 low?, 2 normal?), `percent`,
  `batteryPower` on mains-only models, units of `realAmountTotal` (grams or
  portions per model), the `completedAt` format of the feed records, `src` of
  a meal asked through `saveDailyFeed` (3?), whether `dailyFeeds` of the D4
  carries `state` once executed, the Fresh Element (`feeder`) amounts (grams
  by 20 like the Home Assistant number entity, or 1–10 like py-petkit-api's
  validation?).
- Litter boxes: `sandLack`, `boxFull`, `liquidLack` presence per model,
  `inTimes` (Purobot) vs counted records (Pura), `getPetOutGraph` time window
  and fields, the answer of `controlDevice` when the box is busy (code?),
  whether the T6 deodorizes through `start_action` 2 (Home Assistant only
  offers it on T3/T4 with K3/T5/T7).
- Fountains: what `deviceData` holds for a Bluetooth fountain without a relay
  (stale or empty), `electricity` on the cordless models, W7H `cwtState` and
  `wtState` values.
- Rate limits: none documented; watch for code 1 (busy) and HTTP 429.

## Decisions

- **Not a duplicate** (checked 2026-10-16): the Gladys core master
  (165e0d94, after 5.2.1) has no PetKit service (`git grep -i
"petkit|petkt|eversweet|purobot|pura max"` empty; `server/services/*`:
  airplay … zwavejs-ui) and PetKit devices are not Matter. The store index
  (local copy, 393 entries, generated 2026-10-15T22:11Z; the main session
  checked 474 entries on 2026-10-16) has no PetKit integration; the tracker
  entry n° 252 "PetKit" (P2) is free; claimed by Louis in /t/10385 #214.
  Complements LM1LC3N7/gladys-surepetcare (Sure Petcare), guim31/
  gladys-litter-robot (Whisker), guim31/gladys-tractive (GPS): other brands.
- **Own client, no dependency** (Louis's rule: reuse maintained work, rewrite
  dead or debt-heavy code). The candidates, 2026-10-16:
  - `@apocaliss92/nodepetkit` (npm 0.1.0, 2026-07-03, MIT, TypeScript port of
    py-petkit-api): a single release, no repository nor issue tracker linked
    in its package, 274 KB of compiled code; its maintenance cannot be
    judged. Not used; to watch.
  - `node-red-contrib-petkit` (0.3.0, 2026-10) and `mcp-server-petkit` (0.3.1,
    dirkjanfaber, MIT): feeders only (Fresh Element Solo), platform plugins
    with their client inside (axios). Not libraries.
  - `homebridge-petkit-*` (2021–2026): Homebridge plugins, feeders only, some
    dead; `homebridge-petkit-bridge` needs its own bridge service.
  - py-petkit-api (Python, 1.31.0 of 2026-10-11, MIT, the library of the Home
    Assistant integration, very active): the reference, used as protocol
    documentation with its recorded answers.
    The integration needs a sign-in and about ten calls: ~600 lines on
    `node:https` + `node:zlib`, written from py-petkit-api,
    homeassistant_petkit and petkitaio (read, nothing copied; credited in the
    README). Runtime dependencies: the SDK only.
- **The app's identity**: the requests carry the headers and the `client`
  field of py-petkit-api (Android app 13.2.1, okhttp user agent), and gzip is
  accepted and decoded: the servers are the app's, a client that does not
  look like it is a risk Home Assistant users do not take.
- **Server = region select** (Europe, International, Asia, Russia, China), not
  a 244-country list: like Home Assistant since py-petkit-api 1.30, the
  sign-in sends the first country (alphabetical) of the server's countries in
  `v1/regionservers` (public, read at each sign-in). The server of an anchor
  country (FR, US, JP, RU) is looked up there so a moved server is followed;
  the known URLs are the fallback. China is reached directly
  (`api.petkit.cn/6/`), as py-petkit-api does.
- **Time zone**: PetKit wants the zone and its offset in every request and
  dates the days of its records with it. Default = the zone of Gladys (TZ of
  the container); an option for devices elsewhere.
- **Sessions**: kept in `/data` with a hash of the user name and the server,
  reused across restarts, renewed an hour before `expiresIn` (py-petkit-api
  signs in again once expired; `user/refreshsession` is not used by it nor
  here). PetKit closes a session when the same account signs in elsewhere
  (code 5, also the answer without a session, probed 2026-10-16): a session
  closed less than 30 minutes after its sign-in counts as "kicked"; the next
  sign-in waits 15 minutes, a second kick stops until the user acts. A
  refused password (122) or an account unknown on the server (125) stops at
  once. The last sign-in time is kept in `/data`, so a restart loop cannot
  hammer `user/login`.
- **Polling, not push, in milestone 1**: 120 s by default (Home Assistant
  60 s with a smart fast poll), 60 s minimum; the device list every 30
  minutes and on a Discovery scan. PetKit's MQTT push (Home Assistant uses it
  only to trigger a read) needs an MQTT client and the Aliyun signature:
  milestone 3.
- **Features follow the reading**: a feature exists when the device reports
  its field (types differ a lot between models); a role seen once stays for
  the life of the process, so a reading without a field does not change the
  device structure.
- **Levels = `level-sensor`/`liquid-state`** (0 low, 1 normal, 2 high; shown
  "Faible / Normal / Élevé", type label "État du niveau"): food of each
  hopper (low below 1, below 2 on the D3, Home Assistant's thresholds), litter
  low, deodorizer liquid, water (fountain `lackWarning`, Ultra `cwtState` 2
  or 3), and the waste bin / waste water tank ("high" when full). Percentages
  are `liquid-level-percent`; the fountain filter is `maintenance`/
  `life-remaining` (the core's generic consumable); days left are `duration`
  in days; counts of the day are `counter-sensor`.
- **Commands = `button`/`push`** (Gladys renders a push button sending 1):
  "Feed one portion" (the smallest valid amount; one per hopper on the
  two-hopper feeders), "Clean now" (`start_action` 0), "Deodorize now"
  (`start_action` 2, on the models Home Assistant offers it: T3, T4 with its
  K3, T5, T7). Any amount goes through the `feed` scene action, checked
  against the model's valid amounts (py-petkit-api MANUAL_FEED_VALID_VALUES;
  the Fresh Element by 20 g like Home Assistant's number entity).
- **Events**: meals = feed records executed without error (`errCode` 0,
  `result` 0), keyed by day and id; visits = litter records of type 10 (Pura)
  or `getPetOutGraph` entries (Purobot), keyed by `eventId`; alerts = a
  condition that starts. The first reading and records older than 15 minutes
  are history. A meal reported as "app" within 10 minutes of a Gladys feed
  command fires no event (one per command): no scene loop.
- **Pets** only when the account has a litter box (their only readings in
  milestone 1): weight (kg, the last visit with a weight), duration of the
  last visit, visits today; an unknown cat is "Unknown pet" in the litter box
  and the event, with no pet device.
- **Bluetooth fountains** are read through `deviceData` (what a relay device
  or the app last synced), without the relay calls; documented.
- **Unsupported types** (purifiers, Cozy…) are skipped and logged once; the
  test button counts them.
