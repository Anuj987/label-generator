import type { AuditEvent, Payment } from "@/lib/types";

export type OpsSyncSnapshot = {
  payments: Payment[];
  events: AuditEvent[];
  sync: boolean;
};

export async function fetchOpsSync(): Promise<OpsSyncSnapshot> {
  try {
    const response = await fetch("/api/ops-sync", { cache: "no-store" });
    if (!response.ok) return { payments: [], events: [], sync: false };
    const data = (await response.json()) as OpsSyncSnapshot;
    return {
      payments: Array.isArray(data.payments) ? data.payments : [],
      events: Array.isArray(data.events) ? data.events : [],
      sync: Boolean(data.sync),
    };
  } catch {
    return { payments: [], events: [], sync: false };
  }
}

export async function publishOpsSync(input: {
  payment?: Payment;
  payments?: Payment[];
  event?: AuditEvent;
  events?: AuditEvent[];
}) {
  try {
    // Keep sync payloads small for mobile networks / Worker body limits.
    const slimPayment = (payment: Payment): Payment => ({
      ...payment,
      documents: (payment.documents ?? [])
        .slice(0, 3)
        .map((doc) =>
          doc.dataUrl && doc.dataUrl.length > 350_000
            ? { ...doc, dataUrl: "" }
            : doc,
        )
        .filter((doc) => doc.dataUrl),
    });

    const payload = {
      payment: input.payment ? slimPayment(input.payment) : undefined,
      payments: input.payments?.map(slimPayment),
      event: input.event,
      events: input.events,
    };

    const response = await fetch("/api/ops-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    return (await response.json()) as { ok: boolean; payments: Payment[]; events: AuditEvent[] };
  } catch {
    return null;
  }
}
