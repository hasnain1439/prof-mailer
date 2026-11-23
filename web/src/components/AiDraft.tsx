"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import { karachiInputFromNow, karachiInputToUtcIso } from "@/lib/time";
import type { Professor } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { IconRefresh, IconSparkles } from "./icons";
import { useToast } from "./Toast";
import { Button, ErrorBox, Field, Input, Notice, Select, Textarea } from "./ui";

/**
 * "Write with AI": Claude drafts a first email for this contact; the user edits it and schedules it.
 * Nothing is sent from here: the email goes into the Queue like any other (DRY_RUN rules apply).
 */
export function AiDraftForm({ contact, onScheduled, onCancel }: { contact: Professor; onScheduled: () => void; onCancel: () => void }) {
  const toast = useToast();
  const templates = useApi(() => api.listTemplates(false), []);
  const cv = useApi(() => api.getCv(), []);
  const [templateId, setTemplateId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<{
    subject: string;
    body: string;
    whyFits: string;
  } | null>(null);
  const [saveWhyFits, setSaveWhyFits] = useState(!contact.whyFits);
  const [when, setWhen] = useState(karachiInputFromNow(30));
  const [attachCv, setAttachCv] = useState(contact.kind === "COMPANY");
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCv = !!cv.data?.cv;

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      setDraft(
        await api.aiDraft({
          contactId: contact.id,
          templateId: templateId || null,
          instructions: instructions || null,
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  async function schedule(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    let scheduledAt: string;
    try {
      scheduledAt = karachiInputToUtcIso(when);
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    setScheduling(true);
    try {
      await api.createEmail({
        professorId: contact.id,
        subject: draft.subject,
        body: draft.body,
        attachCv: attachCv && hasCv,
        scheduledAt,
      });
      if (saveWhyFits && draft.whyFits.trim()) await api.updateProfessor(contact.id, { whyFits: draft.whyFits });
      toast("Email scheduled. It is in the Queue.");
      onScheduled();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setScheduling(false);
    }
  }

  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Base it on a template (optional)" hint="The AI keeps your facts from it and rewrites it for this contact." htmlFor="ai-template">
          <Select id="ai-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">No template</option>
            {templates.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Instructions (optional)" htmlFor="ai-instructions">
          <Textarea
            id="ai-instructions"
            rows={2}
            maxLength={2000}
            placeholder="e.g. Mention my final-year project on Urdu NLP. Keep it short."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </Field>
      </div>
      <Button variant={draft ? "secondary" : "primary"} onClick={generate} disabled={generating}>
        {draft ? <IconRefresh /> : <IconSparkles />}
        {generating ? "Writing…" : draft ? "Write again" : "Write email"}
      </Button>
      {!draft && !generating && (
        <p className="text-xs text-muted">
          Uses this contact&apos;s profile (research focus or skills, notes, links). The more you fill in, the better the email.
        </p>
      )}

      {draft && (
        <form onSubmit={schedule} className="space-y-3 border-t border-border pt-4">
          <Field label="Subject" htmlFor="ai-subject">
            <Input id="ai-subject" required value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </Field>
          <Field label="Body" htmlFor="ai-body">
            <Textarea id="ai-body" required rows={12} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </Field>
          <Field label={contact.kind === "COMPANY" ? "Why you fit" : "Why I fit"} htmlFor="ai-why">
            <Textarea id="ai-why" rows={2} value={draft.whyFits} onChange={(e) => setDraft({ ...draft, whyFits: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-[13px] text-text">
            <input type="checkbox" checked={saveWhyFits} onChange={(e) => setSaveWhyFits(e.target.checked)} />
            Save this line to the contact&apos;s profile
            {contact.whyFits ? " (replaces the current one)" : ""}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Send at (PKT)" htmlFor="ai-when">
              <Input id="ai-when" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-[13px] text-text">
                <input type="checkbox" checked={attachCv && hasCv} disabled={!hasCv} onChange={(e) => setAttachCv(e.target.checked)} />
                Attach my CV
                {!hasCv && cv.data ? " (upload one in Settings first)" : ""}
              </label>
            </div>
          </div>
          <Notice tone="info" className="">
            Read it before scheduling: AI can get details wrong. It is sent from your Gmail at the time above, within your daily limit.
          </Notice>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={scheduling}>
              {scheduling ? "Scheduling…" : "Schedule email"}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
