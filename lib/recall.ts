// Client-only settings (localStorage) + pure recall helpers. No network.
export type RecallStatus = "upcoming" | "reminder" | "due today" | "overdue";

const DAY_MS = 86_400_000;
const REMINDER_KEY = "oratrace:reminderDays";

export function getReminderDays(): number {
  const raw = localStorage.getItem(REMINDER_KEY);
  const n = Number(raw);
  return raw !== null && raw !== "" && Number.isFinite(n) && n >= 0 ? n : 2;
}
export function setReminderDays(n: number): void {
  localStorage.setItem(REMINDER_KEY, String(n));
}

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Calendar days from `today` to `due` (negative = past). Round absorbs DST 23/25h days.
export function daysUntil(due: Date, today: Date): number {
  return Math.round((midnight(due) - midnight(today)) / DAY_MS);
}

export function recallStatus(due: Date, today: Date, windowDays: number): RecallStatus {
  const d = daysUntil(due, today);
  if (d < 0) return "overdue";
  if (d === 0) return "due today";
  return d <= windowDays ? "reminder" : "upcoming";
}

export function waLink(a: { phone: string; name: string; clinic: string; clinicPhone: string; due: Date }): string {
  let digits = a.phone.replace(/\D/g, "");
  if (digits.length === 10) digits = "91" + digits;
  const date = a.due.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const call = a.clinicPhone ? `, or call ${a.clinicPhone} to confirm or reschedule your appointment` : "";
  const text = `Hi ${a.name}, this is a reminder from ${a.clinic}. Your oral health follow-up check-up is due on ${date}. Please visit the clinic${call}.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
