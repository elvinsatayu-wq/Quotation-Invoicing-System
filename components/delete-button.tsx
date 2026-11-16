"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/lib/types";

export function DeleteButton({
  action,
  name,
  variant = "button",
}: {
  action: () => Promise<ActionState>;
  name: string;
  /** "link" is a small text action for table rows. */
  variant?: "button" | "link";
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm(`ลบ "${name}" ใช่หรือไม่?`)) return;
    startTransition(async () => {
      setError((await action()).error);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className={variant === "link" ? "text-sm text-bad hover:underline disabled:opacity-50" : "btn btn-danger"}
        disabled={pending}
        onClick={handleClick}
        aria-label={`ลบ ${name}`}
      >
        {pending ? "กำลังลบ…" : "ลบ"}
      </button>
      {error && (
        <span role="alert" className="max-w-52 text-xs whitespace-normal text-bad">
          {error}
        </span>
      )}
    </span>
  );
}
