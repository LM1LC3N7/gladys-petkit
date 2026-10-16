# gladys-petkit

[Gladys Assistant](https://gladysassistant.com) external integration for
**PetKit**: Fresh Element and YumShare feeders, Pura and Purobot litter boxes
and Eversweet water fountains, through the PetKit cloud (the one of the app).
Food level and food dispensed, last meal, litter level, waste bin, deodorizer
and visits of the litter boxes with the weight of each cat, water level,
filter and pump of the fountains, batteries, online states and errors;
feeding, cleaning and deodorizing buttons, a "Feed" scene action, and scene
triggers when a litter box is used, a meal is dispensed or an alert starts.
Unofficial, not affiliated with PetKit.

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

> **Work in progress (0.1, not published to the store yet).** Tested with
> simulated answers, not yet with a real PetKit account. Feedback and bug
> reports are welcome in the
> [GitHub issues](https://github.com/LM1LC3N7/gladys-petkit/issues).

## How it works

```
Gladys ⇄ SDK ⇄ src/handlers.js ⇄ src/app.js (PetkitApp) ⇄ src/client.js ⇄ src/petkit.js ⇄ api.eu-pet.com (…)
                                 ├─ src/inventory.js  PetKit answers -> devices, meals, visits (pure)
                                 ├─ src/devices.js    -> Gladys devices and states (pure)
                                 ├─ src/events.js     two readings -> scene events (pure)
                                 ├─ src/publisher.js  300 states/min, dated states and scene events queued
                                 ├─ src/clock.js      time zones, PetKit days and dates (pure)
                                 └─ src/store.js      session and last sign-in (/data)
```

- **Account**: user name (e-mail or phone) and password (`secret` field) of a
  PetKit account, and its server (Europe, International, Asia, Russia,
  China). The server comes from the public `v1/regionservers` list
  (`passport.petkt.com`); `POST user/login` (form: the MD5 of the password,
  the app's `client` description, the first country of the server) returns a
  session (`id`, `expiresIn`), sent as `X-Session`/`F-Session`. It is kept in
  `/data` across restarts and renewed an hour before it expires.
- **One session per account** at PetKit: a session closed (code 5) soon after
  its sign-in means the PetKit app uses the same account. The integration then
  waits (never two automatic sign-ins within 15 minutes), tries once more, and
  stops at the second time with a status asking for a second account in the
  family. A refused password (122) or an unknown account on that server (125)
  stops until the configuration changes or the test button is clicked.
- **Reading**: `group/family/list` (plus `discovery/device_roster_v2` for the
  devices shared in a family) every 30 minutes; every poll (120 s by default,
  60 to 900), each device: `{type}/device_detail` (Wi-Fi devices) or
  `{type}/deviceData` (Bluetooth fountains), and the records of the day:
  `dailyFeeds`/`getDeviceRecord`/`dailyFeedAndEat` (feeders),
  `getDeviceRecord` (Pura X, Pura Max), `getPetOutGraph` (Purobot). Errors
  back off 1, 2, 5, 10 then 15 minutes; "busy" (code 1) waits 5 minutes.
- **Devices**: `ext:<selector>:device:<PetKit id>` for the feeders, litter
  boxes and fountains; `ext:<selector>:pet:<PetKit id>` for the pets when the
  account has a litter box. The features follow what each device reports.
- **Commands**: push buttons (`button`/`push`): `saveDailyFeed`
  (`save_dailyfeed` on the Fresh Element and Mini) with the smallest valid
  amount, `controlDevice` `{"start_action": 0}` (clean) or `2` (deodorize);
  the `feed` scene action takes any valid amount and hopper.
- **States**: current values through `publishChangedStates`; meals, litter box
  visits and pet weights dated with their time through `publishStates`, once
  each. Scene events (`litter_box_used`, `meal_dispensed`, `alert_raised`) are
  queued and all sent; the first reading and records older than 15 minutes
  are not fired, nor the meals Gladys asked for.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npm run audit
npx github:GladysAssistant/integration-store .  # store admission checks
```

`test/fixtures/petkit.js` holds PetKit answers shaped after the recorded
answers and models of py-petkit-api (sources in the file);
`test/helpers/fakePetkit.js` serves them behind the transport, sign-in,
sessions and commands included. The transport itself is tested against a
loopback HTTP server (gzip, limits, timeout).

## Credits

No maintained JavaScript library of the PetKit API fits a Gladys integration
(see [TODO.md](TODO.md), Decisions): the client is our own, written from the
behaviour documented by these projects, read as documentation (no code
copied):

- [py-petkit-api](https://github.com/Jezza34000/py-petkit-api) (MIT,
  Jezza34000), the library of the Home Assistant integration: regional
  servers, sign-in, headers, endpoints, models, commands, recorded answers;
- [homeassistant_petkit](https://github.com/Jezza34000/homeassistant_petkit)
  (MIT) and its wiki: the meaning of the fields (food levels, litter box work
  states and events, fountain warnings), the supported models, the second
  account in the family;
- [home-assistant-petkit](https://github.com/RobertD502/home-assistant-petkit)
  and [petkitaio](https://github.com/RobertD502/petkitaio) (MIT, RobertD502):
  the manual feeding of the older feeders.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release. The
`gladys-assistant-integration` topic is added at the first real release only.

## License

Apache-2.0. PetKit, Fresh Element, YumShare, Pura, Purobot and Eversweet are
trademarks of their owner; this project is not affiliated with PetKit.
