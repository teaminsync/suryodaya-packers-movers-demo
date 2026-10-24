/**
 * India Standard Time (IST) utilities
 * IST is UTC+5:30 with no daylight saving time
 */

export const IST_OFFSET_MINUTES = 330;

export interface IstParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 1=Mon..7=Sun
  dateKey: string; // YYYY-MM-DD
}

/**
 * Convert a UTC Date to India time components
 */
export function toIstParts(date: Date): IstParts {
  const utc = date.getTime();
  const istMs = utc + IST_OFFSET_MINUTES * 60 * 1000;
  const istDate = new Date(istMs);

  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth() + 1;
  const day = istDate.getUTCDate();
  const hour = istDate.getUTCHours();
  const minute = istDate.getUTCMinutes();

  // ISO weekday: 1=Mon, 7=Sun
  let weekday = istDate.getUTCDay();
  if (weekday === 0) weekday = 7;

  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return { year, month, day, hour, minute, weekday, dateKey };
}

/**
 * Convert an IST date and time to UTC Date
 */
export function istToUtc(dateKey: string, hour: number, minute: number): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const utcMs = utcDate.getTime() - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
}

/**
 * Add days to a date key (YYYY-MM-DD)
 */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return toIstParts(date).dateKey;
}

/**
 * Format a UTC slot start time in India time for display
 * Example: "Tue, 20 Oct at 10:00 AM"
 */
export function formatSlotLabel(start: Date): string {
  const parts = toIstParts(start);
  
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  const weekdayName = weekdays[parts.weekday - 1];
  const monthName = months[parts.month - 1];
  
  let hour12 = parts.hour % 12;
  if (hour12 === 0) hour12 = 12;
  const ampm = parts.hour < 12 ? "AM" : "PM";
  
  return `${weekdayName}, ${parts.day} ${monthName} at ${hour12}:${String(parts.minute).padStart(2, "0")} ${ampm}`;
}
