"use client";

import { useState, useTransition } from "react";
import { ErrorNote } from "@/components/ui";
import type { ActionState } from "@/lib/types";

/** A confirm-then-run button for cancelling a billing note or receipt. */
export function CancelButton({
  action,
  label,
  confirmMessage,
}: {
  action: () => Promise<ActionState>;
  label: string;
  confirmMessage: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-2">
      <div>
        <button
          type="button"
          className="btn btn-danger"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(confirmMessage)) return;
            startTransition(async () => setError((await action()).error));
          }}
        >
          {label}
        </button>
      </div>
      <ErrorNote message={error} />
    </div>
  );
}
