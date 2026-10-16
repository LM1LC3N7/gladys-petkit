// -----------------------------------------------------------------------------
// Texts shown in Gladys (connection status, button, device and feature names,
// litter box states, alerts), in English and French.
// -----------------------------------------------------------------------------

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The text of `texts` in `language`, English otherwise. */
export const word = (texts, language) => texts[language] ?? texts.en;

/** Model names, for the devices PetKit gives no name. */
export const MODEL_NAMES = {
  feeder: 'Fresh Element',
  feedermini: 'Fresh Element Mini',
  d3: 'Fresh Element Infinity',
  d4: 'Fresh Element Solo',
  d4s: 'Fresh Element Gemini',
  d4h: 'YumShare Solo',
  d4sh: 'YumShare Dual-hopper',
  t3: 'Pura X',
  t4: 'Pura Max',
  t5: 'Purobot Max Pro',
  t6: 'Purobot Ultra',
  t7: 'Purobot Crystal Duo',
  w4: 'Eversweet',
  w5: 'Eversweet',
  ctw2: 'Eversweet',
  ctw3: 'Eversweet Max',
  w7h: 'Eversweet Ultra',
};

export const PET_NAME = { en: 'Pet', fr: 'Animal' };

const UNIT_SUFFIX = { g: '(g)', portions: { en: '(portions)', fr: '(portions)' } };
const unitSuffix = (unit, language) =>
  typeof UNIT_SUFFIX[unit] === 'string' ? UNIT_SUFFIX[unit] : word(UNIT_SUFFIX[unit], language);

/** Feature names, in the language chosen in the configuration. */
export const FEATURE_NAMES = {
  online: { en: 'Online', fr: 'En ligne' },
  error: { en: 'Error', fr: 'Erreur' },
  battery: { en: 'Battery', fr: 'Batterie' },
  // Feeders
  feed: { en: 'Feed one portion', fr: 'Distribuer une portion' },
  'feed-1': { en: 'Feed one portion, hopper 1', fr: 'Distribuer une portion, réservoir 1' },
  'feed-2': { en: 'Feed one portion, hopper 2', fr: 'Distribuer une portion, réservoir 2' },
  food: { en: 'Food level', fr: 'Niveau de croquettes' },
  'food-1': { en: 'Food level, hopper 1', fr: 'Niveau de croquettes, réservoir 1' },
  'food-2': { en: 'Food level, hopper 2', fr: 'Niveau de croquettes, réservoir 2' },
  'food-left': { en: 'Food left', fr: 'Croquettes restantes' },
  'dispensed-today': { en: 'Dispensed today', fr: "Distribué aujourd'hui" },
  'dispensed-today-1': {
    en: 'Dispensed today, hopper 1',
    fr: "Distribué aujourd'hui, réservoir 1",
  },
  'dispensed-today-2': {
    en: 'Dispensed today, hopper 2',
    fr: "Distribué aujourd'hui, réservoir 2",
  },
  'last-meal': { en: 'Last meal', fr: 'Dernier repas' },
  desiccant: { en: 'Desiccant (days left)', fr: 'Déshydratant (jours restants)' },
  // Litter boxes
  clean: { en: 'Clean now', fr: 'Nettoyer maintenant' },
  deodorize: { en: 'Deodorize now', fr: 'Désodoriser maintenant' },
  'litter-level': { en: 'Litter level', fr: 'Niveau de litière' },
  'litter-low': { en: 'Litter', fr: 'Litière' },
  'waste-bin': { en: 'Waste bin', fr: 'Bac à déchets' },
  'deodorizer-days': { en: 'Deodorizer (days left)', fr: 'Désodorisant (jours restants)' },
  'spray-days': { en: 'Odor eliminator (days left)', fr: 'Éliminateur d’odeurs (jours restants)' },
  'deodorizer-low': { en: 'Deodorizer liquid', fr: 'Liquide désodorisant' },
  'uses-today': { en: 'Uses today', fr: "Passages aujourd'hui" },
  'last-used-by': { en: 'Last used by', fr: 'Dernier passage de' },
  'work-state': { en: 'State', fr: 'État' },
  // Fountains
  water: { en: 'Water level', fr: "Niveau d'eau" },
  filter: { en: 'Filter', fr: 'Filtre' },
  'filter-days': { en: 'Filter (days left)', fr: 'Filtre (jours restants)' },
  pump: { en: 'Pump running', fr: 'Pompe en marche' },
  'drinks-today': { en: 'Drinks today', fr: "Abreuvements aujourd'hui" },
  'waste-tank': { en: 'Waste water tank', fr: "Réservoir d'eau usée" },
  // Pets
  weight: { en: 'Weight (kg)', fr: 'Poids (kg)' },
  'visit-duration': { en: 'Last litter box visit', fr: 'Dernier passage à la litière' },
  'visits-today': { en: 'Litter box visits today', fr: "Passages à la litière aujourd'hui" },
};

/** A feature name; the amounts carry their unit (Gladys has no mass unit). */
export function featureName(role, language, unit) {
  const name = word(FEATURE_NAMES[role], language);
  return unit && /^(dispensed-today|last-meal)/.test(role)
    ? `${name} ${unitSuffix(unit, language)}`
    : name;
}

/** Litter box states (text feature). */
export const WORK_STATE_NAMES = {
  idle: { en: 'Idle', fr: 'En attente' },
  cleaning: { en: 'Cleaning', fr: 'Nettoyage' },
  dumping: { en: 'Emptying the litter', fr: 'Vidage de la litière' },
  odor_removal: { en: 'Deodorizing', fr: 'Désodorisation' },
  resetting: { en: 'Resetting', fr: 'Réinitialisation' },
  leveling: { en: 'Leveling the litter', fr: 'Nivellement de la litière' },
  calibrating: { en: 'Calibrating', fr: 'Calibrage' },
  reset_deodorant: { en: 'Resetting the deodorizer', fr: 'Réinitialisation du désodorisant' },
  light: { en: 'Light on', fr: 'Lumière allumée' },
  maintenance: { en: 'Maintenance', fr: 'Maintenance' },
  paused: { en: 'Paused', fr: 'En pause' },
  busy: { en: 'Working', fr: 'En fonctionnement' },
};

/** Alert labels (scene trigger select and the message variable). */
export const ALERT_NAMES = {
  low_food: { en: 'Food running low', fr: 'Croquettes bientôt épuisées' },
  bin_full: { en: 'Waste bin full', fr: 'Bac à déchets plein' },
  litter_low: { en: 'Litter running low', fr: 'Litière insuffisante' },
  deodorizer_low: { en: 'Deodorizer liquid low', fr: 'Liquide désodorisant bas' },
  low_water: { en: 'Water running low', fr: "Manque d'eau" },
  filter_change: { en: 'Filter to change', fr: 'Filtre à changer' },
  device_error: { en: 'Device error', fr: "Erreur de l'appareil" },
};

export const NO_ERROR = { en: 'No error', fr: 'Aucune erreur' };
export const BREAKDOWN = { en: 'Breakdown warning', fr: 'Alerte de panne' };
export const UNKNOWN_PET = { en: 'Unknown pet', fr: 'Animal inconnu' };

/** "25 min" / "3 h", for the pauses. */
export function age(ms) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 120) {
    return { en: `${minutes} min`, fr: `${minutes} min` };
  }
  const hours = Math.round(minutes / 60);
  return { en: `${hours} h`, fr: `${hours} h` };
}

/** "2026-11-15" (UTC), for the session expiry. */
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

const SERVER_NAMES = {
  europe: { en: 'Europe', fr: 'Europe' },
  international: { en: 'International', fr: 'International' },
  asia: { en: 'Asia', fr: 'Asie' },
  russia: { en: 'Russia', fr: 'Russie' },
  china: { en: 'China', fr: 'Chine' },
};

export const T = {
  session: (expiresAt) =>
    expiresAt === undefined
      ? { en: '', fr: '' }
      : {
          en: `Session valid until ${day(expiresAt)}.`,
          fr: `Session valable jusqu'au ${day(expiresAt)}.`,
        },
  noCredentials: {
    en: 'Enter the e-mail (or phone number) and password of a PetKit account, preferably a second account added to your family in the PetKit app.',
    fr: "Saisissez l'e-mail (ou le numéro de téléphone) et le mot de passe d'un compte PetKit, de préférence un second compte ajouté à votre famille dans l'application PetKit.",
  },
  connecting: {
    en: 'Signing in to PetKit…',
    fr: 'Connexion à PetKit…',
  },
  connected: ({ devices, pets }, expiresAt) => {
    const tail = T.session(expiresAt);
    const en = `Connected to PetKit: ${plural(devices, 'device', 'devices')}, ${plural(pets, 'pet', 'pets')}. Open Discovery to add them.`;
    const fr = `Connecté à PetKit : ${plural(devices, 'appareil', 'appareils')}, ${plural(pets, 'animal', 'animaux')}. Ouvrez Découverte pour les ajouter.`;
    return {
      en: tail.en ? `${en} ${tail.en}` : en,
      fr: tail.fr ? `${fr} ${tail.fr}` : fr,
    };
  },
  refused: {
    en: 'PetKit refused the e-mail or password: check them in the configuration (the integration waits for a change).',
    fr: "PetKit a refusé l'e-mail ou le mot de passe : vérifiez-les dans la configuration (l'intégration attend une modification).",
  },
  unknownAccount: (region) => ({
    en: `PetKit knows no such account on its ${word(SERVER_NAMES[region], 'en')} server: check the e-mail and the PetKit server in the configuration.`,
    fr: `PetKit ne connaît pas ce compte sur son serveur ${word(SERVER_NAMES[region], 'fr')} : vérifiez l'e-mail et le serveur PetKit dans la configuration.`,
  }),
  kicked: (wait) => ({
    en: `PetKit closed the session right after the sign-in: this account is probably signed in to the PetKit app too (one session per account). Use a second account added to your family. Next try in ${wait.en}.`,
    fr: `PetKit a fermé la session juste après la connexion : ce compte est sans doute aussi connecté dans l'application PetKit (une session par compte). Utilisez un second compte ajouté à votre famille. Nouvel essai dans ${wait.fr}.`,
  }),
  kickedStop: {
    en: 'PetKit keeps closing the session: this account is signed in elsewhere (PetKit app). Use a second account added to your family, then save the configuration or click "Test the connection".',
    fr: 'PetKit ferme sans cesse la session : ce compte est connecté ailleurs (application PetKit). Utilisez un second compte ajouté à votre famille, puis enregistrez la configuration ou cliquez sur « Tester la connexion ».',
  },
  loginWait: (wait) => ({
    en: `The PetKit session ended; signing in again in ${wait.en} (at most one sign-in every 15 minutes).`,
    fr: `La session PetKit s'est terminée ; nouvelle connexion dans ${wait.fr} (au plus une connexion toutes les 15 minutes).`,
  }),
  unreachable: (reason, wait) => ({
    en: `PetKit cannot be reached (${reason}). Next try in ${wait.en}.`,
    fr: `PetKit est injoignable (${reason}). Nouvel essai dans ${wait.fr}.`,
  }),
  busy: (wait) => ({
    en: `PetKit is busy: pausing for ${wait.en}.`,
    fr: `PetKit est surchargé : pause de ${wait.fr}.`,
  }),
  badTimezone: {
    en: 'The time zone of the configuration is unknown: Gladys’s own time zone is used.',
    fr: 'Le fuseau horaire de la configuration est inconnu : celui de Gladys est utilisé.',
  },
  offline: {
    en: 'PetKit reports this device offline.',
    fr: 'PetKit signale cet appareil hors ligne.',
  },
  bleRelay: {
    en: 'Bluetooth fountain: PetKit only knows what a relay device synced.',
    fr: 'Fontaine Bluetooth : PetKit ne connaît que ce qu’un appareil relais a synchronisé.',
  },
  unknownDevice: {
    en: 'Unknown device: wait for the first reading of the account.',
    fr: 'Appareil inconnu : attendez la première lecture du compte.',
  },
  badAmount: (amounts, unit) => {
    const step = amounts[1] - amounts[0];
    const list = (to, by) =>
      amounts.length <= 10
        ? amounts.join(', ')
        : `${amounts[0]} ${to} ${amounts.at(-1)}${step === 1 ? '' : ` ${by} ${step}`}`;
    return {
      en: `Amount not accepted by this feeder: ${list('to', 'by')} ${unit === 'g' ? 'grams' : 'portions'}.`,
      fr: `Quantité refusée par ce distributeur : ${list('à', 'par pas de')} ${unit === 'g' ? 'grammes' : 'portions'}.`,
    };
  },
  notFeeder: {
    en: 'This device is not a PetKit feeder.',
    fr: "Cet appareil n'est pas un distributeur PetKit.",
  },
  test: {
    cooldown: {
      en: 'Already read less than 30 seconds ago.',
      fr: 'Déjà lu il y a moins de 30 secondes.',
    },
    summary: ({ families, devices, pets }, server) => ({
      en: `Server ${word(SERVER_NAMES[server], 'en')}: ${plural(families, 'family', 'families')}, ${plural(devices, 'device', 'devices')}, ${plural(pets, 'pet', 'pets')}.`,
      fr: `Serveur ${word(SERVER_NAMES[server], 'fr')} : ${plural(families, 'famille', 'familles')}, ${plural(devices, 'appareil', 'appareils')}, ${plural(pets, 'animal', 'animaux')}.`,
    }),
    skipped: (count) =>
      count === 0
        ? { en: '', fr: '' }
        : {
            en: `${plural(count, 'device', 'devices')} not supported yet.`,
            fr: `${plural(count, 'appareil', 'appareils')} pas encore pris en charge.`,
          },
  },
};
