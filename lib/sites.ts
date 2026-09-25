// Shared oral site list — used by habit quid placement and lesion capture.
export const SITES = [
  "buccal left",
  "buccal right",
  "tongue lateral",
  "floor of mouth",
  "gingiva",
  "palate",
] as const;

export type Site = (typeof SITES)[number];
