// Client-only. Local-only storage, no sync, no network.
import Dexie, { type EntityTable } from "dexie";
import type { ClassifyResult, ModelMeta } from "./model";
import type { Action } from "./rules";
import type { Site } from "./sites";

export interface Patient {
  id?: number;
  name: string;
  age: number;
  sex: "male" | "female" | "other";
  phone: string;
}

export type HabitStatus = "current" | "quit" | "never";
export type SmokelessType = "none" | "gutka" | "khaini" | "other";

export interface Habit {
  id?: number;
  patientId: number;
  smokingStatus: HabitStatus;
  smokingYears: number;
  smokelessType: SmokelessType;
  smokelessStatus: HabitStatus;
  smokelessYears: number;
  arecaStatus: HabitStatus;
  arecaYears: number;
  alcoholStatus: HabitStatus;
  alcoholYears: number;
  quidSite: Site | "";
  // Risk-factor points (lib/rules.ts). Optional: rows saved before these existed read as false.
  familyHistoryOralCancer?: boolean;
  personalHistoryOpmdOrOc?: boolean;
  poorlyFittingDenture?: boolean;
}

export interface Lesion {
  id?: number;
  patientId: number;
  site: string;
}

export interface Capture {
  id?: number;
  lesionId: number;
  takenAt: Date;
  photo: Blob; // downscaled to max 1024px, JPEG
  modelOutput: ClassifyResult;
  probs: number[]; // softmax(logits / T), class order per CONTRACT.md
  abstain: boolean;
  metaVersion: ModelMeta["version"]; // "mock" = produced by the mock model
}

export interface Decision {
  id?: number;
  captureId: number;
  suggested: Action | null; // null = model abstained, no suggestion
  ruleId: string;
  rulesVersion: string;
  final: Action;
  reason: string; // dentist's optional reason for going against the suggestion, "" if none
  decidedAt: Date;
}

export interface Recall {
  id?: number;
  lesionId: number;
  dueDate: Date;
  status: string;
}

export const db = new Dexie("oratrace") as Dexie & {
  patients: EntityTable<Patient, "id">;
  habits: EntityTable<Habit, "id">;
  lesions: EntityTable<Lesion, "id">;
  captures: EntityTable<Capture, "id">;
  decisions: EntityTable<Decision, "id">;
  recalls: EntityTable<Recall, "id">;
};

db.version(1).stores({
  patients: "++id, name, phone",
  habits: "++id, &patientId",
  lesions: "++id, patientId, site",
  captures: "++id, lesionId, takenAt",
  decisions: "++id, captureId",
  recalls: "++id, lesionId, dueDate, status",
});
