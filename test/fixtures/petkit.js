// -----------------------------------------------------------------------------
// PetKit answers for the tests, shaped after the recorded answers and models of
// py-petkit-api 1.31.0 (MIT, Jezza34000): tests/test_feeders.py (a live D4SH
// device_detail, a live D4 dailyFeeds), tests/test_water_fountain.py (a live W5
// deviceData), tests/test_pet_feeder_stats.py (D4SH records),
// tests/test_region_servers.py, and the models of containers.py,
// litter_container.py and water_fountain_container.py for the rest.
// Identifiers, names and amounts are made up. The region list is a trimmed
// copy of the public https://passport.petkt.com/v1/regionservers of
// 2026-10-16. A session-less call answers HTTP 200 with
// {"error":{"code":5,"msg":"Login session expired. Please log in again."}}
// (probe of 2026-10-16).
// -----------------------------------------------------------------------------

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** 2026-10-16 12:00 in Paris. */
export const NOW = Date.parse('2026-10-16T10:00:00Z');
export const TODAY = '20261016';
export const ZONE = 'Europe/Paris';

export const USERNAME = 'gladys-petkit@example.com';
export const PASSWORD = 'pa55word"\'&';
export const EU = 'https://api.eu-pet.com/latest/';

export const D4SH = '300035322';
export const D4 = '300100001';
export const MINI = '300500001';
export const T4 = '400200001';
export const T6 = '400300001';
export const W5 = '100000001';
export const W7H = '500400001';
export const K3 = '600500001';
export const FELIX = '101401310';
export const NALA = '101401320';
export const FAMILY = '7001';
export const SHARED = '7002';

/** Epoch seconds of an ISO date. */
export const sec = (iso) => Date.parse(iso) / 1000;

export const regionServers = () => ({
  list: [
    { id: 'AD', name: 'Andorra', gateway: EU, accountType: 'email' },
    { id: 'DE', name: 'Germany', gateway: EU, accountType: 'email' },
    { id: 'FR', name: 'France', gateway: EU, accountType: 'email' },
    {
      id: 'AG',
      name: 'Antigua and Barbuda',
      gateway: 'https://api.petkt.com/latest/',
      accountType: 'email',
    },
    {
      id: 'US',
      name: 'United States',
      gateway: 'https://api.petkt.com/latest/',
      accountType: 'email',
    },
    {
      id: 'AE',
      name: 'United Arab Emirates',
      gateway: 'https://api.petktasia.com/latest/',
      accountType: 'email',
    },
    { id: 'JP', name: 'Japan', gateway: 'https://api.petktasia.com/latest/', accountType: 'email' },
    {
      id: 'RU',
      name: 'Russian Federation',
      gateway: 'https://api-ru.petkit.cn/latest/',
      accountType: 'email',
    },
  ],
});

/** group/family/list: the account's family, and a family sharing a feeder with it. */
export const families = () => [
  {
    groupId: Number(FAMILY),
    name: 'Home',
    owner: 100000011,
    expired: false,
    deviceList: [
      device(D4SH, 'd4sh', 'YumShare', 25, 2),
      device(D4, 'd4', 'Solo', 11, 0),
      device(T4, 't4', 'Pura Max', 7, 1),
      device(T6, 't6', 'Purobot Ultra', 27, 1),
      device(W5, 'w5', 'Fountain', 14, 5),
      device(W7H, 'w7h', 'Eversweet Ultra', 28, 1),
      device(K3, 'k3', 'Air Smart Spray', 16, 0),
    ],
    petList: [
      { petId: Number(FELIX), petName: 'Felix', avatar: '', createdAt: 1700000000 },
      { petId: Number(NALA), petName: 'Nala', avatar: '', createdAt: 1700000100 },
    ],
    userList: [{ userId: 100000011, userName: 'Owner', isOwner: 1 }],
  },
  { groupId: Number(SHARED), name: 'Shared', owner: 100000099, deviceList: [], petList: [] },
];

function device(id, deviceType, deviceName, type, typeCode) {
  return {
    createdAt: 1719234118,
    deviceId: Number(id),
    deviceName,
    deviceType,
    groupId: 0,
    type,
    typeCode,
    uniqueId: `${deviceType}-${id}`,
  };
}

/** discovery/device_roster_v2 of the shared family (py-petkit-api _parse_shared_device). */
export const roster = () => ({
  devices: [
    {
      id: Number(MINI),
      type: 'feedermini',
      name: 'Mini',
      deviceTypeAndId: `feedermini-${MINI}`,
      deviceTypeId: 6,
      typeCode: 0,
      createdAt: 1719234118,
    },
  ],
});

/** {type}/device_detail and {type}/deviceData, by device id. */
export const details = () => ({
  // tests/test_feeders.py fake_feeder_data (a YumShare Dual-hopper), trimmed.
  [D4SH]: {
    id: Number(D4SH),
    name: 'YumShare',
    sn: '20252220DA0000',
    firmware: '733',
    hardware: 1,
    locale: 'Europe/Paris',
    timezone: 1.0,
    settings: { bucketName1: '01 hopper', bucketName2: '02 hopper', foodWarn: 0 },
    state: {
      batteryPower: 4,
      batteryStatus: 0,
      bowl: -1,
      desiccantLeftDays: 29,
      eating: 0,
      feedState: {
        addAmountTotal1: 0,
        addAmountTotal2: 0,
        eatAvg: 216,
        eatCount: 6,
        planAmountTotal1: 4,
        planAmountTotal2: 6,
        planRealAmountTotal1: 1,
        planRealAmountTotal2: 3,
        realAmountTotal1: 1,
        realAmountTotal2: 3,
        times: 4,
      },
      feeding: 0,
      food1: 2,
      food2: 0,
      ota: 0,
      overall: 1,
      pim: 1,
      wifi: { bssid: 'a0b1c2d3e4a5', rsq: -50, ssid: 'wifi-network' },
    },
  },
  [D4]: {
    id: Number(D4),
    name: 'Solo',
    sn: '20240101D40001',
    firmware: '1.2.3',
    hardware: 1,
    state: {
      food: 1,
      percent: 64,
      desiccantLeftDays: 12,
      pim: 1,
      errorCode: '',
      errorMsg: '',
      feedState: { planAmountTotal: 40, planRealAmountTotal: 20, realAmountTotal: 30, times: 2 },
    },
  },
  [MINI]: {
    id: Number(MINI),
    name: 'Mini',
    sn: '20230101M00001',
    firmware: '600',
    hardware: 1,
    state: {
      food: 0,
      batteryPower: 2,
      batteryStatus: 1,
      pim: 2,
      feedState: { realAmountTotal: 25 },
    },
  },
  // A Pura Max with its K3 deodorizer (Litter, StateLitter).
  [T4]: {
    id: Number(T4),
    name: 'Pura Max',
    sn: '20230505T40001',
    firmware: '1.590',
    hardware: 1,
    firmwareDetails: [{ module: 'app', version: 1590 }],
    k3Device: { id: 600500002, name: 'K3' },
    state: {
      pim: 1,
      sandPercent: 62,
      sandLack: false,
      boxFull: false,
      deodorantLeftDays: 20,
      liquidLack: false,
      sandWeight: 4100,
      errorMsg: '',
    },
  },
  [T6]: {
    id: Number(T6),
    name: 'Purobot Ultra',
    sn: '20250303T60001',
    firmware: '2.1',
    hardware: 1,
    firmwareDetails: [{ module: 'app', version: 2100 }],
    inTimes: 3,
    state: {
      pim: 1,
      sandPercent: 48,
      boxFull: true,
      sprayLeftDays: 9,
      purificationLeftDays: 30,
      workState: { workMode: 0, workProcess: 10, workReason: 0 },
    },
  },
  // tests/test_water_fountain.py W5_DEVICE_DATA (a live W5), as is.
  [W5]: {
    id: Number(W5),
    mac: '000000000000',
    secret: '000000000000',
    userId: '100000000',
    hardware: 2,
    firmware: 47,
    sn: 'SN1',
    name: 'Fountain',
    typeCode: 5,
    settings: {
      smartWorkingTime: 3,
      smartSleepTime: 3,
      lampRingSwitch: 1,
      lampRingBrightness: 2,
      noDisturbingSwitch: 0,
    },
    voltage: -1,
    powerStatus: 1,
    mode: 1,
    isNightNoDisturbing: 0,
    breakdownWarning: 0,
    lackWarning: 0,
    filterWarning: 0,
    waterPumpRunTime: 349437,
    filterPercent: 86,
    runStatus: 1,
    todayPumpRunTime: 258,
  },
  // An Eversweet Ultra AI (WaterFountain, FountainState; drinkCount from
  // tests/test_missing_model_fields.py).
  [W7H]: {
    id: Number(W7H),
    sn: 'SN7',
    name: 'Eversweet Ultra',
    hardware: 1,
    firmware: '412',
    drinkCount: 12,
    drinkTimeAvg: 9,
    nextFlushTime: '2026/10/17 08:00',
    state: {
      pim: 1,
      pumpState: 1,
      cwtState: 0,
      wtState: 0,
      filterLeftDays: 25,
      heatInstall: 0,
    },
  },
});

/** The records of the day: meals (feed) and litter box visits, by device id. */
export const records = () => ({
  // getDeviceRecord of a D4SH (feed + eat, tests/test_pet_feeder_stats.py shape).
  [D4SH]: {
    feed: [
      {
        day: Number(TODAY),
        deviceId: Number(D4SH),
        items: [
          {
            id: 's25200',
            time: 25200,
            amount1: 1,
            amount2: 0,
            name: 'R1',
            src: 1,
            status: 0,
            state: {
              errCode: 0,
              result: 0,
              realAmount1: 1,
              realAmount2: 0,
              completedAt: '2026-10-16T05:00:04.000+0000',
            },
          },
          {
            id: 's32400',
            time: 32400,
            amount1: 0,
            amount2: 1,
            name: 'R2',
            src: 1,
            status: 0,
            state: {
              errCode: 0,
              result: 0,
              realAmount1: 0,
              realAmount2: 1,
              completedAt: '2026-10-16T07:00:03.000+0000',
            },
          },
          { id: 's64800', time: 64800, amount1: 1, amount2: 1, name: 'R3', src: 1, status: 0 },
        ],
      },
    ],
    eat: [
      {
        deviceId: Number(D4SH),
        items: [
          {
            eatStartTime: sec('2026-10-16T05:01:00Z'),
            eatEndTime: sec('2026-10-16T05:03:00Z'),
            petId: FELIX,
          },
        ],
      },
    ],
  },
  // d4/dailyFeeds (tests/test_feeders.py, a live D4), the morning meal executed.
  [D4]: {
    feed: [
      {
        items: [
          {
            id: 's28800',
            time: 28800,
            amount: 20,
            name: 'Breakfast',
            src: 1,
            status: 2,
            isExecuted: 1,
            state: {
              errCode: 0,
              result: 0,
              realAmount: 20,
              completedAt: sec('2026-10-16T06:00:01Z'),
            },
          },
          {
            id: 's39600',
            time: 39600,
            amount: 20,
            name: 'Lunch',
            src: 1,
            status: 2,
            isExecuted: 1,
          },
        ],
        day: Number(TODAY),
        planAmount: 40,
        addAmount: 0,
        realAmount: 20,
        deviceId: 0,
        amount: 40,
      },
    ],
  },
  // feedermini/dailyfeeds: a meal skipped (errCode 10, result 8).
  [MINI]: {
    feed: [
      {
        day: Number(TODAY),
        items: [
          {
            id: 1,
            time: 25200,
            amount: 25,
            src: 1,
            status: 0,
            state: { errCode: 10, result: 8, realAmount: 0 },
          },
        ],
      },
    ],
  },
  // t4/getDeviceRecord (LitterRecord): a cleaning, then a visit of Felix.
  [T4]: [
    {
      eventId: 'e-t4-1',
      eventType: 5,
      timestamp: sec('2026-10-16T06:10:00Z'),
      content: { startTime: sec('2026-10-16T06:09:00Z') },
      subContent: [{ eventType: 5, content: { result: 0, startReason: 0 } }],
    },
    {
      eventId: 'e-t4-2',
      eventType: 10,
      petId: Number(FELIX),
      petName: 'Felix',
      timestamp: sec('2026-10-16T08:30:00Z'),
      content: {
        petWeight: 4520,
        timeIn: sec('2026-10-16T08:28:40Z'),
        timeOut: sec('2026-10-16T08:30:00Z'),
      },
    },
  ],
  // t6/getPetOutGraph (PetOutGraph): Nala, then a cat the camera did not recognize.
  [T6]: [
    {
      eventId: 'e-t6-1',
      petId: Number(NALA),
      petName: 'Nala',
      time: sec('2026-10-16T07:45:00Z'),
      toiletTime: 85,
      content: {
        petWeight: 3870,
        timeIn: sec('2026-10-16T07:43:35Z'),
        timeOut: sec('2026-10-16T07:45:00Z'),
      },
    },
    {
      eventId: 'e-t6-2',
      petId: 0,
      time: sec('2026-10-16T09:12:00Z'),
      toiletTime: 40,
      content: { timeIn: sec('2026-10-16T09:11:20Z'), timeOut: sec('2026-10-16T09:12:00Z') },
    },
  ],
});
