"use client";

import type { Habit, HabitStatus, SmokelessType } from "@/lib/db";
import { SITES } from "@/lib/sites";

export type HabitFormValue = Omit<Habit, "id" | "patientId">;

export const emptyHabitForm: HabitFormValue = {
  smokingStatus: "never",
  smokingYears: 0,
  smokelessType: "none",
  smokelessStatus: "never",
  smokelessYears: 0,
  arecaStatus: "never",
  arecaYears: 0,
  alcoholStatus: "never",
  alcoholYears: 0,
  quidSite: "",
  familyHistoryOralCancer: false,
  personalHistoryOpmdOrOc: false,
  poorlyFittingDenture: false,
};

const RISK_FACTORS = [
  ["familyHistoryOralCancer", "Family history of oral cancer"],
  ["personalHistoryOpmdOrOc", "Previous oral lesion (OPMD or oral cancer)"],
  ["poorlyFittingDenture", "Poorly fitting denture"],
] as const;

const STATUSES: HabitStatus[] = ["current", "quit", "never"];
const SMOKELESS_TYPES: SmokelessType[] = ["none", "gutka", "khaini", "other"];

function StatusYears({
  label,
  status,
  years,
  onStatus,
  onYears,
}: {
  label: string;
  status: HabitStatus;
  years: number;
  onStatus: (s: HabitStatus) => void;
  onYears: (y: number) => void;
}) {
  return (
    <fieldset className="card flex min-w-0 flex-col gap-3 p-4 md:p-5">
      <legend className="float-left mb-1 w-full font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onStatus(s)}
            aria-pressed={status === s}
            className="choice capitalize"
          >
            {s}
          </button>
        ))}
      </div>
      {status !== "never" && (
        <label className="flex items-center gap-3 text-muted">
          Years of use
          <input
            type="number"
            min={0}
            max={100}
            value={years}
            onChange={(e) => onYears(Number(e.target.value))}
            inputMode="numeric"
            className="field w-24 tabular-nums"
          />
        </label>
      )}
    </fieldset>
  );
}

export default function HabitFields({
  value,
  onChange,
}: {
  value: HabitFormValue;
  onChange: (v: HabitFormValue) => void;
}) {
  const usesQuid =
    value.smokelessStatus === "current" ||
    value.arecaStatus === "current" ||
    value.smokingStatus === "current";

  return (
    <div className="flex flex-col gap-4">
      <StatusYears
        label="Smoking"
        status={value.smokingStatus}
        years={value.smokingYears}
        onStatus={(smokingStatus) => onChange({ ...value, smokingStatus })}
        onYears={(smokingYears) => onChange({ ...value, smokingYears })}
      />

      <fieldset className="card flex min-w-0 flex-col gap-3 p-4 md:p-5">
        <legend className="float-left mb-1 w-full font-semibold">
          Smokeless tobacco
        </legend>
        <p className="label">Type</p>
        <div className="flex flex-wrap gap-2">
          {SMOKELESS_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ ...value, smokelessType: t })}
              aria-pressed={value.smokelessType === t}
              className="choice capitalize"
            >
              {t}
            </button>
          ))}
        </div>
        {value.smokelessType !== "none" && (
          <>
            <p className="label">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ ...value, smokelessStatus: s })}
                  aria-pressed={value.smokelessStatus === s}
                  className="choice capitalize"
                >
                  {s}
                </button>
              ))}
            </div>
            {value.smokelessStatus !== "never" && (
              <label className="flex items-center gap-3 text-muted">
                Years of use
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={value.smokelessYears}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      smokelessYears: Number(e.target.value),
                    })
                  }
                  inputMode="numeric"
            className="field w-24 tabular-nums"
                />
              </label>
            )}
          </>
        )}
      </fieldset>

      <StatusYears
        label="Areca nut"
        status={value.arecaStatus}
        years={value.arecaYears}
        onStatus={(arecaStatus) => onChange({ ...value, arecaStatus })}
        onYears={(arecaYears) => onChange({ ...value, arecaYears })}
      />

      <StatusYears
        label="Alcohol"
        status={value.alcoholStatus}
        years={value.alcoholYears}
        onStatus={(alcoholStatus) => onChange({ ...value, alcoholStatus })}
        onYears={(alcoholYears) => onChange({ ...value, alcoholYears })}
      />

      <fieldset className="card flex min-w-0 flex-col gap-3 p-4 md:p-5">
        <legend className="float-left mb-1 w-full font-semibold">Other risk factors</legend>
        {RISK_FACTORS.map(([key, label]) => (
          <label key={key} className="flex min-h-tap cursor-pointer items-center gap-3 has-[:disabled]:cursor-default">
            <input
              type="checkbox"
              checked={!!value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
              className="h-5 w-5 shrink-0 accent-accent"
            />
            {label}
          </label>
        ))}
      </fieldset>

      {usesQuid && (
        <fieldset className="card flex min-w-0 flex-col gap-3 p-4 md:p-5">
          <legend className="float-left mb-1 w-full font-semibold">
            Quid placement site
          </legend>
          <div className="flex flex-wrap gap-2">
            {SITES.map((site) => (
              <button
                key={site}
                type="button"
                onClick={() => onChange({ ...value, quidSite: site })}
                aria-pressed={value.quidSite === site}
                className="choice capitalize"
              >
                {site}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
