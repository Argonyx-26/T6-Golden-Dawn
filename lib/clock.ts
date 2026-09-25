// Client-only (reads/writes localStorage). Every "now"/"today" in the app
// must go through now() so the demo-day offset applies everywhere.
const OFFSET_KEY = "oratrace:dayOffset";

export const CLOCK_EVENT = "oratrace:clock";

export function getDayOffset(): number {
  if (typeof localStorage === "undefined") return 0; // static prerender
  const raw = localStorage.getItem(OFFSET_KEY);
  return raw ? Number(raw) || 0 : 0;
}

export function setDayOffset(n: number): void {
  localStorage.setItem(OFFSET_KEY, String(n));
  window.dispatchEvent(new Event(CLOCK_EVENT));
}

export function addDays(date: Date, n: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  return result;
}

export function now(): Date {
  return addDays(new Date(), getDayOffset());
}
