"use client";

import { useSyncExternalStore } from "react";
import { CLOCK_EVENT, getDayOffset } from "@/lib/clock";

function subscribe(cb: () => void) {
  window.addEventListener(CLOCK_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CLOCK_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useDayOffset(): number {
  return useSyncExternalStore(subscribe, getDayOffset, () => 0);
}

export default function DemoBanner() {
  const offset = useDayOffset();
  if (offset === 0) return null;
  // Neutral dark bar on purpose: yellow is reserved for "model not confident".
  return (
    <div className="sticky top-0 z-50 bg-foreground px-4 py-1.5 text-center text-sm font-medium text-background">
      Demo clock {offset > 0 ? "+" : "−"}
      {Math.abs(offset)} {Math.abs(offset) === 1 ? "day" : "days"}
    </div>
  );
}
