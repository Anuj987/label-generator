import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SUPABASE_USERS } from "@/lib/supabase-data";

export const runtime = "nodejs";

type NotifyBody = {
  orderId?: string;
  orderNumber?: string;
};

type KvStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

type NotifyEnv = {
  NT_OPS_SYNC?: KvStore;
  ONESIGNAL_REST_API_KEY?: string;
  ONESIGNAL_APP_ID?: string;
  NEXT_PUBLIC_ONESIGNAL_APP_ID?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  NEXT_PUBLIC_APP_URL?: string;
};

const DEDUPE_KEY = "order-notify-v1";
const DEFAULT_APP_ID = "47bfa90f-67bb-4210-a7ad-41ffcddee9a6";

function envValue(env: NotifyEnv, key: keyof NotifyEnv): string | undefined {
  const fromBinding = env[key];
  if (typeof fromBinding === "string" && fromBinding.trim()) return fromBinding.trim();
  const fromProcess = process.env[key as string];
  return typeof fromProcess === "string" && fromProcess.trim() ? fromProcess.trim() : undefined;
}

async function getEnv(): Promise<NotifyEnv> {
  try {
    const context = await getCloudflareContext({ async: true });
    return (context.env ?? {}) as NotifyEnv;
  } catch {
    return {};
  }
}

async function readNotifiedIds(kv: KvStore | undefined): Promise<string[]> {
  if (!kv) return [];
  try {
    const raw = await kv.get(DEDUPE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function markNotified(kv: KvStore | undefined, orderId: string) {
  if (!kv) return;
  const existing = await readNotifiedIds(kv);
  if (existing.includes(orderId)) return;
  const next = [orderId, ...existing].slice(0, 1000);
  await kv.put(DEDUPE_KEY, JSON.stringify(next));
}

async function resolveActiveStaffExternalIds(env: NotifyEnv): Promise<string[]> {
  const url =
    envValue(env, "NEXT_PUBLIC_SUPABASE_URL") ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://bwpmuknevcoshtufaytk.supabase.co";
  const serviceKey = envValue(env, "SUPABASE_SERVICE_ROLE_KEY");

  if (serviceKey) {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin
      .from("users")
      .select("id,role,active")
      .in("role", ["admin", "packing", "delivery"]);

    if (!error && data?.length) {
      return data
        .filter((row) => row.active !== false)
        .map((row) => String(row.id))
        .filter(Boolean);
    }
  }

  // Fallback: known Operations Console staff External IDs (public.users.id).
  return SUPABASE_USERS.map((user) => user.id);
}

async function assertAdminCaller(request: Request, env: NotifyEnv) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return { ok: false as const, status: 401, error: "Missing auth token" };

  const url =
    envValue(env, "NEXT_PUBLIC_SUPABASE_URL") ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://bwpmuknevcoshtufaytk.supabase.co";
  const anonKey =
    envValue(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY") || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!anonKey) {
    return { ok: false as const, status: 500, error: "Supabase anon key missing on Worker" };
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, error: "Invalid session" };
  }

  const { data: profile, error: profileError } = await client
    .from("users")
    .select("id,role,active")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active === false) {
    return { ok: false as const, status: 403, error: "Staff profile not found" };
  }
  if (String(profile.role) !== "admin") {
    return { ok: false as const, status: 403, error: "Only admin can trigger new-order notifications" };
  }

  return { ok: true as const, staffId: String(profile.id) };
}

function siteOrigin(request: Request, env: NotifyEnv) {
  const configured = envValue(env, "NEXT_PUBLIC_APP_URL");
  if (configured) return configured.replace(/\/$/, "");
  const origin = request.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`.replace(/\/$/, "");
  return "https://national-traders-console.nationaltraders800.workers.dev";
}

export async function POST(request: Request) {
  const env = await getEnv();
  const restApiKey = envValue(env, "ONESIGNAL_REST_API_KEY");
  if (!restApiKey) {
    return Response.json(
      {
        ok: false,
        error:
          "ONESIGNAL_REST_API_KEY is not configured on the Worker. Set it with: wrangler secret put ONESIGNAL_REST_API_KEY",
      },
      { status: 503 },
    );
  }

  const auth = await assertAdminCaller(request, env);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: NotifyBody;
  try {
    body = (await request.json()) as NotifyBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const orderId = body.orderId?.trim();
  const orderNumber = body.orderNumber?.trim();
  if (!orderId || !orderNumber) {
    return Response.json({ ok: false, error: "orderId and orderNumber are required" }, { status: 400 });
  }

  const kv = env.NT_OPS_SYNC;
  const already = await readNotifiedIds(kv);
  if (already.includes(orderId)) {
    return Response.json({ ok: true, alreadySent: true });
  }

  const externalIds = await resolveActiveStaffExternalIds(env);
  if (!externalIds.length) {
    return Response.json({ ok: false, error: "No active staff recipients" }, { status: 500 });
  }

  const appId =
    envValue(env, "ONESIGNAL_APP_ID") ||
    envValue(env, "NEXT_PUBLIC_ONESIGNAL_APP_ID") ||
    DEFAULT_APP_ID;

  const origin = siteOrigin(request, env);
  const orderUrl = `${origin}/orders/${orderId}`;

  const payload = {
    app_id: appId,
    target_channel: "push",
    include_aliases: { external_id: externalIds },
    headings: { en: "New Order Received" },
    contents: { en: `Order #${orderNumber} has been placed.` },
    url: orderUrl,
    web_url: orderUrl,
    data: {
      orderId,
      orderNumber,
      type: "new_order",
    },
  };

  const onesignalResponse = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${restApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await onesignalResponse.text();
  let responseJson: Record<string, unknown> = {};
  try {
    responseJson = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    responseJson = { raw: responseText.slice(0, 500) };
  }

  if (!onesignalResponse.ok) {
    return Response.json(
      {
        ok: false,
        error: "OneSignal send failed",
        status: onesignalResponse.status,
        details: responseJson,
      },
      { status: 502 },
    );
  }

  await markNotified(kv, orderId);

  return Response.json({
    ok: true,
    alreadySent: false,
    recipients: externalIds.length,
    onesignalId: responseJson.id ?? null,
  });
}
