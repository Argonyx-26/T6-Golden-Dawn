"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { db } from "@/lib/db";
import HabitFields, {
  emptyHabitForm,
  type HabitFormValue,
} from "@/components/HabitFields";

const PHONE_RE = /^[6-9]\d{9}$/;

export default function NewPatientPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "other">("male");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");

  const [habits, setHabits] = useState<HabitFormValue>(emptyHabitForm);

  function goToHabits() {
    if (!PHONE_RE.test(phone)) {
      setPhoneError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (!name.trim() || !age) return;
    setPhoneError("");
    setStep(2);
  }

  async function savePatient() {
    const patientId = (await db.patients.add({
      name: name.trim(),
      age: Number(age),
      sex,
      phone,
    })) as number;
    await db.habits.add({ patientId, ...habits });
    router.push(`/patient?id=${patientId}`);
  }

  if (step === 1) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-8 md:px-8">
        <header className="flex flex-col gap-1">
          <Link href="/patients" className="btn btn-ghost -ml-3 self-start text-muted">
            Cancel
          </Link>
          <p className="label">Step 1 of 2</p>
          <h1 className="text-3xl font-semibold">New patient</h1>
        </header>

        <label className="flex flex-col gap-1.5">
          <span className="label">Name</span>
          <input
            type="text"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="label">Age</span>
          <input
            type="number"
            min={0}
            max={120}
            inputMode="numeric"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="field"
          />
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="label mb-1.5">Sex</legend>
          <div className="flex flex-wrap gap-2">
            {(["male", "female", "other"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSex(s)}
                aria-pressed={sex === s}
                className="choice capitalize"
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="label">Phone</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            maxLength={10}
            inputMode="numeric"
            autoComplete="off"
            placeholder="10-digit mobile number"
            className="field"
          />
          {phoneError && (
            <span role="alert" className="text-danger">
              {phoneError}
            </span>
          )}
        </label>

        <button
          type="button"
          onClick={goToHabits}
          disabled={!name.trim() || !age || !phone}
          className="btn btn-primary btn-lg mt-3"
        >
          Next: habits
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-8 md:px-8">
      <header className="flex flex-col gap-1">
        <p className="label">Step 2 of 2</p>
        <h1 className="text-3xl font-semibold">Habits and risk factors</h1>
        <p className="text-muted">For {name.trim()}. These feed the suggested action.</p>
      </header>
      <HabitFields value={habits} onChange={setHabits} />
      <div className="sticky bottom-0 -mx-4 grid grid-cols-2 gap-2 border-t border-border bg-background/95 px-4 py-3">
        <button type="button" onClick={() => setStep(1)} className="btn btn-secondary btn-lg">
          Back
        </button>
        <button type="button" onClick={savePatient} className="btn btn-primary btn-lg">
          Save patient
        </button>
      </div>
    </div>
  );
}
