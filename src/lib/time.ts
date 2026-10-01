export const DEFAULT_TIMEZONE = "Asia/Amman";
export const DEFAULT_CURRENCY = "JOD";

/**
 * Timezone helpers. All "clinic day" boundaries are computed in the clinic timezone
 * (default Asia/Amman, configurable in settings).
 */

export type DayRange = { start: Date; end: Date };

/** Parts of a date rendered in a specific timezone. */
function partsInTz(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = fmt.formatToParts(d);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** The UTC instant for local (tz) year/month/day at local midnight. */
export function localMidnightUTC(year: number, month: number, day: number, tz: string): Date {
  // Find offset by probing: guess UTC, adjust iteratively (max 2 iterations is enough).
  let guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const parts = partsInTz(new Date(guess), tz);
    const target = Date.UTC(year, month - 1, day, 0, 0, 0);
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const diff = target - actual;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** [start, end) of a clinic day for the given calendar date (in clinic tz). */
export function getDayRange(day: Date, tz: string): DayRange {
  const parts = partsInTz(day, tz);
  const start = localMidnightUTC(parts.year, parts.month, parts.day, tz);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Range for "today" in clinic timezone. */
export function todayRange(tz: string, now = new Date()): DayRange {
  return getDayRange(now, tz);
}

export function yesterdayRange(tz: string, now = new Date()): DayRange {
  const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return getDayRange(d, tz);
}

/** Week starting on Saturday (Jordan working week start). */
export function thisWeekRange(tz: string, now = new Date()): DayRange {
  return weekRange(new Date(now), tz);
}

function weekRange(day: Date, tz: string): DayRange {
  const parts = partsInTz(day, tz);
  // Determine weekday (0=Sunday) in tz using a probe date
  const probe = localMidnightUTC(parts.year, parts.month, parts.day, tz);
  const weekdayUTC = new Date(probe).getUTCDay();
  // Shift probe by +3h to land inside the tz day for getDay purposes is unreliable;
  // weekday computed from the local-midnight instant is correct because
  // localMidnightUTC maps exactly to local 00:00.
  const daysSinceSaturday = (weekdayUTC + 1) % 7; // Saturday=0
  const start = new Date(probe.getTime() - daysSinceSaturday * 24 * 60 * 60 * 1000);
  const sParts = partsInTz(start, tz);
  const s = localMidnightUTC(sParts.year, sParts.month, sParts.day, tz);
  return { start: s, end: new Date(s.getTime() + 7 * 24 * 60 * 60 * 1000) };
}

export function thisMonthRange(tz: string, now = new Date()): DayRange {
  const parts = partsInTz(now, tz);
  const start = localMidnightUTC(parts.year, parts.month, 1, tz);
  const endMonth = parts.month === 12 ? 1 : parts.month + 1;
  const endYear = parts.month === 12 ? parts.year + 1 : parts.year;
  const end = localMidnightUTC(endYear, endMonth, 1, tz);
  return { start, end };
}

/** Arbitrary date range from two calendar dates (inclusive of the end day). */
export function customRange(from: Date, to: Date, tz: string): DayRange {
  const a = getDayRange(from, tz);
  const b = getDayRange(to, tz);
  return { start: a.start, end: b.end };
}

/** "YYYY-MM-DD" in clinic timezone. */
export function toDateKey(d: Date, tz: string): string {
  const p = partsInTz(d, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Normalize a Date to clinic-local midnight (used for day closing uniqueness). */
export function normalizeToDay(d: Date, tz: string): Date {
  const p = partsInTz(d, tz);
  return localMidnightUTC(p.year, p.month, p.day, tz);
}

/** Converts an HTML date input (YYYY-MM-DD) to clinic-local midnight. */
export function dateInputToLocalMidnight(value: string | null | undefined, tz: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return localMidnightUTC(year, month, day, tz);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatMoney(value: { toNumber(): number } | number | string | null | undefined, currency: string, lang: "ar" | "en" = "ar"): string {
  let n: number;
  if (typeof value === "number") n = value;
  else if (value !== null && value !== undefined && typeof value === "object" && "toNumber" in value) n = value.toNumber();
  else n = Number(value ?? 0);
  return new Intl.NumberFormat(lang === "en" ? "en-US" : "ar-JO", { style: "currency", currency, maximumFractionDigits: 3 }).format(n);
}

export function formatDate(d: Date | null | undefined, tz: string): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ar-JO", { timeZone: tz, dateStyle: "medium" }).format(d);
}

export function formatDateTime(d: Date | null | undefined, tz: string): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ar-JO", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(d);
}
