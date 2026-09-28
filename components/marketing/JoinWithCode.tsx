"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Lets a caregiver (or a returning patient) jump straight into an existing plan
// by entering the recovery code they were given, rather than creating a new plan.
export function JoinWithCode() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed) router.push(`/caregiver?code=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="e.g. AB2C4D7H"
        className="input font-mono uppercase tracking-widest sm:flex-1"
        aria-label="Recovery code"
      />
      <button type="submit" disabled={!code.trim()} className="btn-secondary">
        Join plan →
      </button>
    </form>
  );
}
