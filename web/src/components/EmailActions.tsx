"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Email } from "@/lib/types";
import { karachiInputFromNow, karachiInputToUtcIso, utcIsoToKarachiInput } from "@/lib/time";
import { btnDanger, btnPrimary, btnSecondary, btnSmall, input } from "./ui";

/** Cancel + Reschedule controls for a queued (SCHEDULED/FAILED) email. */
export function EmailActions({ email, onChanged }: { email: Email; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCancel = email.status === "SCHEDULED" || email.status === "FAILED";
  const canReschedule = email.status === "SCHEDULED" || email.status === "FAILED" || email.status === "CANCELLED";

  async function cancel() {
    if (!window.confirm(`Cancel "${email.subject}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelEmail(email.id);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    const current = utcIsoToKarachiInput(email.scheduledAt);
    // For failed/past emails, default to a few minutes from now.
    const isPast = Date.parse(email.scheduledAt) < Date.now();
    setValue(isPast ? karachiInputFromNow(5) : current);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const scheduledAt = karachiInputToUtcIso(value);
      await api.updateEmail(email.id, { scheduledAt });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {editing ? (
        <div className="flex flex-wrap items-center gap-1">
          <input
            type="datetime-local"
            className={`${input} !w-auto !py-1 text-xs`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="New time (Karachi)"
          />
          <span className="text-xs text-neutral-500">PKT</span>
          <button type="button" className={`${btnPrimary} ${btnSmall}`} disabled={busy || !value} onClick={save}>
            Save
          </button>
          <button type="button" className={`${btnSecondary} ${btnSmall}`} disabled={busy} onClick={() => setEditing(false)}>
            Close
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {canReschedule && (
            <button type="button" className={`${btnSecondary} ${btnSmall}`} disabled={busy} onClick={startEdit}>
              {email.status === "FAILED" ? "Retry / reschedule" : "Reschedule"}
            </button>
          )}
          {canCancel && (
            <button type="button" className={`${btnDanger} ${btnSmall}`} disabled={busy} onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
