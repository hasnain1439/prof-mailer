"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Email } from "@/lib/types";
import { formatKarachi, karachiInputFromNow, karachiInputToUtcIso, utcIsoToKarachiInput } from "@/lib/time";
import { IconCalendar, IconX } from "./icons";
import { useToast } from "./Toast";
import { btnDanger, btnPrimary, btnSecondary, btnSmall, input } from "./ui";

/** Cancel + Reschedule controls for a queued (SCHEDULED/FAILED) email. */
export function EmailActions({ email, onChanged }: { email: Email; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
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
      toast("Email cancelled.");
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
    setCc(email.cc ?? "");
    setBcc(email.bcc ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const scheduledAt = karachiInputToUtcIso(value);
      await api.updateEmail(email.id, { scheduledAt, cc: cc.trim() || null, bcc: bcc.trim() || null });
      setEditing(false);
      toast(`Rescheduled for ${formatKarachi(scheduledAt)}.`);
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
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            className={`${input} !h-7 !w-40 !text-xs`}
            placeholder="CC (optional)"
            aria-label="CC"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
          />
          <input
            className={`${input} !h-7 !w-40 !text-xs`}
            placeholder="BCC (optional)"
            aria-label="BCC"
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
          />
          <input
            type="datetime-local"
            className={`${input} !h-7 !w-auto font-mono !text-xs`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="New time (Karachi)"
          />
          <span className="text-xs text-muted">PKT</span>
          <button type="button" className={`${btnPrimary} ${btnSmall}`} disabled={busy || !value} onClick={save}>
            Save
          </button>
          <button type="button" aria-label="Close" className={`${btnSecondary} ${btnSmall}`} disabled={busy} onClick={() => setEditing(false)}>
            <IconX size={14} />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {canReschedule && (
            <button type="button" className={`${btnSecondary} ${btnSmall}`} disabled={busy} onClick={startEdit}>
              <IconCalendar size={14} />
              {email.status === "FAILED" ? "Retry / reschedule" : "Reschedule / CC"}
            </button>
          )}
          {canCancel && (
            <button type="button" className={`${btnDanger} ${btnSmall}`} disabled={busy} onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-failed-fg">{error}</p>}
    </div>
  );
}
