"use client";

import Link from "next/link";
import ClinicalDisclaimer from "@/components/ClinicalDisclaimer";
import PatientAvatar from "@/components/PatientAvatar";

export default function PatientsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Patients</h1>
        <p className="text-muted">Choose how you want to continue.</p>
      </header>

      <ClinicalDisclaimer />

      <div className="grid gap-4 sm:grid-cols-2">
        <PatientChoice
          href="/patient/new"
          label="New Patient"
          description="Start a new patient record and habits intake."
        />
        <PatientChoice
          href="/patients/list"
          label="Existing Patient"
          description="Find a patient and review their record."
        />
      </div>
    </div>
  );
}

function PatientChoice({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link href={href} className="card flex min-h-56 flex-col items-start justify-between gap-6 p-6 transition-colors hover:bg-surface-2">
      <PatientAvatar label="Patient" size="md" />
      <span className="flex flex-col gap-1">
        <span className="text-xl font-semibold">{label}</span>
        <span className="text-muted">{description}</span>
      </span>
    </Link>
  );
}
