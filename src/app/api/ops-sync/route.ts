import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AuditEvent, Payment } from "@/lib/types";

type OpsSyncData = {
  payments: Payment[];
  events: AuditEvent[];
};

type KvStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

type OpsEnv = {
  NT_OPS_SYNC?: KvStore;
};

const PAYMENTS_KEY = "payments-v1";
const EVENTS_KEY = "events-v1";

async function getKv() {
  const context = await getCloudflareContext({ async: true });
  const env = context.env as typeof context.env & OpsEnv;
  return env.NT_OPS_SYNC ?? null;
}

async function readList<T>(kv: KvStore, key: string): Promise<T[]> {
  const raw = await kv.get(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[], limit = 400): T[] {
  const map = new Map<string, T>();
  for (const item of [...incoming, ...existing]) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    map.set(item.id, { ...prev, ...item });
  }
  return [...map.values()].slice(0, limit);
}

export async function GET() {
  const kv = await getKv();
  if (!kv) {
    return Response.json({ payments: [], events: [], sync: false });
  }
  const [payments, events] = await Promise.all([
    readList<Payment>(kv, PAYMENTS_KEY),
    readList<AuditEvent>(kv, EVENTS_KEY),
  ]);
  return Response.json({
    payments,
    events,
    sync: true,
  } satisfies OpsSyncData & { sync: boolean });
}

export async function POST(request: Request) {
  const kv = await getKv();
  if (!kv) {
    return Response.json({ ok: false, error: "Sync storage unavailable" }, { status: 503 });
  }

  const body = (await request.json()) as {
    payment?: Payment;
    payments?: Payment[];
    event?: AuditEvent;
    events?: AuditEvent[];
  };

  const incomingPayments = [
    ...(body.payment ? [body.payment] : []),
    ...(Array.isArray(body.payments) ? body.payments : []),
  ];
  const incomingEvents = [
    ...(body.event ? [body.event] : []),
    ...(Array.isArray(body.events) ? body.events : []),
  ];

  const [existingPayments, existingEvents] = await Promise.all([
    readList<Payment>(kv, PAYMENTS_KEY),
    readList<AuditEvent>(kv, EVENTS_KEY),
  ]);

  const payments = mergeById(existingPayments, incomingPayments, 400).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const events = mergeById(existingEvents, incomingEvents, 500).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  await Promise.all([
    kv.put(PAYMENTS_KEY, JSON.stringify(payments)),
    kv.put(EVENTS_KEY, JSON.stringify(events)),
  ]);

  return Response.json({ ok: true, payments, events });
}
