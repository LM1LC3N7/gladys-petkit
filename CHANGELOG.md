# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.1.1] - 2026-10-16

### Added

- PetKit account (e-mail or phone number and password, server of the account's
  country): the session is kept across restarts and renewed before it expires,
  its end date shows in the connection status. A refused password, an account
  unknown on the chosen server, or a session closed by the PetKit app signed in
  with the same account are reported without signing in again and again (at
  most one sign-in every 15 minutes).
- One device per feeder (Fresh Element, Mini, Infinity, Solo, Gemini, YumShare
  Solo and Dual-hopper): food level of each hopper, food left, food dispensed
  today, last meal, desiccant, battery, online state, error.
- One device per litter box (Pura X, Pura Max, Purobot Max Pro, Ultra, Crystal
  Duo): state, litter level, litter low, waste bin, deodorizer, uses today,
  last pet, online state, error.
- One device per Eversweet fountain: water level, filter, pump, battery; drinks
  today, filter days and waste water tank on the Eversweet Ultra. Bluetooth
  fountains show what a relay device last synced.
- One device per pet when the account has a litter box: weight measured by the
  litter box, duration of the last visit, visits today.
- Buttons "Feed one portion", "Clean now" and "Deodorize now", and the scene
  action "Feed with a PetKit feeder" (any valid amount, either hopper).
- Scene triggers "Litter box used" (pet, weight, duration), "Meal dispensed"
  (amount, source) and "PetKit alert" (food low, waste bin full, litter low,
  deodorizer low, water low, filter to change, device error).
- Devices shared with the account in a PetKit family.
- "Test the connection" button with a summary of the account.
- Feature names, litter box states and alert messages in French or English.

[Unreleased]: https://github.com/LM1LC3N7/gladys-petkit/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-petkit/releases/tag/v0.1.1
