"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, ErrorBox, Loading, PageHeader, SuccessBox, btnDanger, btnPrimary, btnSecondary } from "@/components/ui";

export function GmailPanel() {
  const params = useSearchParams();
  const connectedParam = params.get("connected") === "1";
  const errorParam = params.get("error");

  const { data, error, loading, reload } = useApi(() => api.gmailStatus());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function disconnect() {
    if (!window.confirm("Disconnect Gmail? Scheduled emails will fail to send until you reconnect.")) return;
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      await api.gmailDisconnect();
      setMessage("Gmail disconnected.");
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function testSend() {
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const res = await api.gmailTestSend();
      setMessage(res.dryRun ? `DRY RUN: test email to ${res.to} was logged, not sent.` : `Test email sent to ${res.to}.`);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Gmail">
        <button type="button" className={btnSecondary} onClick={reload} disabled={loading}>
          Refresh
        </button>
      </PageHeader>

      {connectedParam && <SuccessBox>Gmail connected successfully.</SuccessBox>}
      {errorParam && <ErrorBox error={`Gmail connection failed: ${errorParam}`} />}
      <ErrorBox error={error} onRetry={reload} />
      <ErrorBox error={actionError} />
      {message && <SuccessBox>{message}</SuccessBox>}
      {loading && !data && <Loading />}

      {data && (
        <Card title="Connection">
          <dl className="mb-4 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-44 text-neutral-500">OAuth client configured</dt>
              <dd>{data.configured ? "Yes" : <span className="text-red-700">No (set Google client id/secret in api/.env)</span>}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 text-neutral-500">Connected</dt>
              <dd>{data.connected ? <span className="font-medium text-green-700">Yes</span> : "No"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 text-neutral-500">Account</dt>
              <dd>{data.email ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 text-neutral-500">DRY_RUN</dt>
              <dd>{data.dryRun ? <span className="font-medium text-amber-700">ON</span> : "OFF"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-44 text-neutral-500">Test recipient set</dt>
              <dd>{data.testRecipientSet ? "Yes" : "No"}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            {data.configured && (
              <a href={api.gmailConnectUrl} className={btnPrimary}>
                {data.connected ? "Reconnect Gmail" : "Connect Gmail"}
              </a>
            )}
            {data.connected && (
              <button type="button" className={btnDanger} onClick={disconnect} disabled={busy}>
                Disconnect
              </button>
            )}
            {data.connected && data.testRecipientSet && (
              <button type="button" className={btnSecondary} onClick={testSend} disabled={busy}>
                {busy ? "Working…" : "Send test email to TEST_RECIPIENT"}
              </button>
            )}
          </div>
          {data.connected && !data.testRecipientSet && (
            <p className="mt-3 text-xs text-neutral-500">Set TEST_RECIPIENT in api/.env to enable the test-send button.</p>
          )}
        </Card>
      )}
    </div>
  );
}
