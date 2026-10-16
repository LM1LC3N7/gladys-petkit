// -----------------------------------------------------------------------------
// Time zones (pure): PetKit dates the days of its records and the times of the
// feeding plans in the time zone of the devices, and wants that zone and its
// offset in every request.
// -----------------------------------------------------------------------------

const HOUR = 3_600_000;

/** The zone of the process: Gladys gives its own to the container (TZ). */
export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** An IANA zone name Node knows ("Europe/Paris"). */
export function validZone(zone) {
  if (typeof zone !== 'string' || zone === '' || /['"\\]/.test(zone)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The wall clock of `zone` at `at`: { year, month, day, hour, minute, second }. */
function wallClock(at, zone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** The offset of `zone` from UTC at `at`, in hours (2 for Paris in summer). */
export function offsetHours(zone, at = Date.now()) {
  const w = wallClock(at, zone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60_000) / 60;
}

/** The offset as Python prints a float, the way the PetKit app sends it ("2.0", "5.5"). */
export const offsetText = (zone, at) => {
  const hours = offsetHours(zone, at);
  return Number.isInteger(hours) ? hours.toFixed(1) : String(hours);
};

/** The day of `at` in `zone`, as PetKit writes it: "20261016". */
export function dayOf(at, zone) {
  const { year, month, day } = wallClock(at, zone);
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

/**
 * An instant written by PetKit -> ms since the epoch, undefined when absent or
 * unreadable: epoch seconds (or ms) as a number or digits, or an ISO date whose
 * offset may lack its colon ("2026-10-16T05:00:03.000+0000").
 */
export function parseInstant(value) {
  if (value === undefined || value === null || value === '' || value === -1 || value === '-1') {
    return undefined;
  }
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      return undefined;
    }
    return number < 1e12 ? number * 1000 : number;
  }
  const text = String(value).replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const at = Date.parse(text);
  return Number.isNaN(at) ? undefined : at;
}

/** The instant of a wall-clock time of `zone`: day "20261016" + seconds since midnight. */
export function zonedInstant(day, seconds, zone) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(String(day));
  if (!match || !Number.isFinite(seconds)) {
    return undefined;
  }
  const wall = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) + seconds * 1000;
  // Twice: the offset of the guess may differ from the offset of the result (DST).
  let at = wall - offsetHours(zone, wall) * HOUR;
  at = wall - offsetHours(zone, at) * HOUR;
  return at;
}
