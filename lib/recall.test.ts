import { describe, expect, it } from "vitest";
import { recallStatus, waLink } from "./recall";

const due = new Date(2026, 8, 24, 15, 0); // time of day must not matter
const at = (n: number) => new Date(2026, 8, 24 - n, 9, 0); // "today" n days before due

describe("recallStatus", () => {
  it("walks upcoming -> reminder -> due today -> overdue (window 2)", () => {
    expect(recallStatus(due, at(14), 2)).toBe("upcoming");
    expect(recallStatus(due, at(3), 2)).toBe("upcoming");
    expect(recallStatus(due, at(2), 2)).toBe("reminder");
    expect(recallStatus(due, at(1), 2)).toBe("reminder");
    expect(recallStatus(due, at(0), 2)).toBe("due today");
    expect(recallStatus(due, at(-1), 2)).toBe("overdue");
  });
});

describe("waLink", () => {
  it("prefixes 91 to 10-digit numbers, strips punctuation, encodes message", () => {
    const url = waLink({ phone: "98765 43210", name: "Asha", clinic: "Bilal Dental Clinic", clinicPhone: "7893452210", due });
    expect(url.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    const msg = decodeURIComponent(url.split("text=")[1]);
    expect(msg).toContain("Hi Asha, this is a reminder from Bilal Dental Clinic.");
    expect(msg).toContain("due on 24 Sept 2026");
    expect(msg).toContain("call 7893452210 to confirm");
  });
  it("drops the call clause when the dentist has no phone", () => {
    const msg = decodeURIComponent(waLink({ phone: "9876543210", name: "A", clinic: "C", clinicPhone: "", due }).split("text=")[1]);
    expect(msg).toMatch(/Please visit the clinic\.$/);
  });
  it("leaves numbers that already have a country code", () => {
    const a = { name: "A", clinic: "C", clinicPhone: "1", due };
    expect(waLink({ ...a, phone: "+91 98765-43210" })).toContain("wa.me/919876543210?");
  });
});
