export const UI_TIMEZONE = "America/Los_Angeles";

const TWO_DIGIT = (value: number): string => String(value).padStart(2, "0");

const ZONE_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

const getZoneFormatter = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = ZONE_FORMATTER_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    ZONE_FORMATTER_CACHE.set(timeZone, formatter);
  }
  return formatter;
};

interface ZoneParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const getZoneParts = (utcMs: number, timeZone: string): ZoneParts => {
  const parts = getZoneFormatter(timeZone).formatToParts(new Date(utcMs));
  const lookup = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const hour = Number.parseInt(lookup.hour ?? "0", 10);
  return {
    year: Number.parseInt(lookup.year ?? "1970", 10),
    month: Number.parseInt(lookup.month ?? "1", 10),
    day: Number.parseInt(lookup.day ?? "1", 10),
    hour: hour === 24 ? 0 : hour,
    minute: Number.parseInt(lookup.minute ?? "0", 10),
    second: Number.parseInt(lookup.second ?? "0", 10),
  };
};

const getZoneOffsetMs = (utcMs: number, timeZone: string): number => {
  const parts = getZoneParts(utcMs, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - utcMs;
};

export const parseHHmm = (value: string): { readonly hour: number; readonly minute: number } | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    hour: Number.parseInt(match[1] ?? "0", 10),
    minute: Number.parseInt(match[2] ?? "0", 10),
  };
};

export const formatHHmm = (hour: number, minute: number): string =>
  `${TWO_DIGIT(hour)}:${TWO_DIGIT(minute)}`;

export const zoneTimeToUtcHHmm = (value: string, timeZone: string = UI_TIMEZONE): string | null => {
  const parsed = parseHHmm(value);
  if (!parsed) {
    return null;
  }

  const now = new Date();
  const zoneNow = getZoneParts(now.getTime(), timeZone);
  const guessedUtcMs = Date.UTC(zoneNow.year, zoneNow.month - 1, zoneNow.day, parsed.hour, parsed.minute, 0);
  const offsetMs = getZoneOffsetMs(guessedUtcMs, timeZone);
  const actualUtcMs = guessedUtcMs - offsetMs;
  const utc = new Date(actualUtcMs);
  return formatHHmm(utc.getUTCHours(), utc.getUTCMinutes());
};

export const utcHHmmToZoneTime = (value: string, timeZone: string = UI_TIMEZONE): string | null => {
  const parsed = parseHHmm(value);
  if (!parsed) {
    return null;
  }

  const now = new Date();
  const utcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), parsed.hour, parsed.minute, 0);
  const zoneParts = getZoneParts(utcMs, timeZone);
  return formatHHmm(zoneParts.hour, zoneParts.minute);
};

export const formatUtcHHmmForDisplay = (value: string, timeZone: string = UI_TIMEZONE): string => {
  const parsed = parseHHmm(value);
  if (!parsed) {
    return value;
  }

  const now = new Date();
  const utcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), parsed.hour, parsed.minute, 0);
  const zoneParts = getZoneParts(utcMs, timeZone);
  const period = zoneParts.hour >= 12 ? "PM" : "AM";
  const hour12 = zoneParts.hour % 12 === 0 ? 12 : zoneParts.hour % 12;
  return `${hour12}:${TWO_DIGIT(zoneParts.minute)} ${period}`;
};

export const timezoneAbbreviation = (timeZone: string = UI_TIMEZONE): string => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    timeZoneName: "short",
  });
  const parts = formatter.formatToParts(new Date());
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
};
