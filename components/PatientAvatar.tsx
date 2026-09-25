"use client";

import { useMemo } from "react";

interface PatientAvatarProps {
  profilePhoto?: Blob;
  label: string;
  size?: "sm" | "md";
}

export default function PatientAvatar({ profilePhoto, label, size = "md" }: PatientAvatarProps) {
  const photoUrl = useMemo(() => (profilePhoto ? URL.createObjectURL(profilePhoto) : null), [profilePhoto]);
  const sizeClass = size === "sm" ? "h-10 w-10" : "h-12 w-12";

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local blob URL
      <img src={photoUrl} alt={`${label} profile`} className={`${sizeClass} shrink-0 rounded-full object-cover`} />
    );
  }

  return (
    <span
      aria-label={`${label} profile`}
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-2/3 w-2/3 fill-current">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
      </svg>
    </span>
  );
}
