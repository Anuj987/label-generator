import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

export async function POST(request: Request) {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;
  if (!appId || !apiKey) {
    return Response.json({ error: "Push notifications are not configured" }, { status: 503 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });
  const auth = await supabase.auth.getUser();
  if (!auth.data.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await supabase
    .from("users")
    .select("id,role,active")
    .eq("auth_user_id", auth.data.user.id)
    .eq("active", true)
    .maybeSingle();
  if (profile.error || profile.data?.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as { orderId?: unknown } | null;
  if (typeof payload?.orderId !== "string") {
    return Response.json({ error: "Invalid order" }, { status: 400 });
  }

  const order = await supabase
    .from("orders")
    .select("id,order_number,priority,customer_id,status,created_by,created_at")
    .eq("id", payload.orderId)
    .eq("status", "NEW")
    .eq("created_by", profile.data.id)
    .maybeSingle();
  if (order.error || !order.data) {
    return Response.json({ error: "New order not found" }, { status: 404 });
  }
  const createdAt = Date.parse(order.data.created_at);
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > 5 * 60 * 1000) {
    return Response.json({ error: "Order notification window expired" }, { status: 409 });
  }

  const [customer, recipients] = await Promise.all([
    supabase
      .from("customers")
      .select("customer_name")
      .eq("id", order.data.customer_id)
      .single(),
    supabase
      .from("users")
      .select("auth_user_id")
      .eq("active", true)
      .in("role", ["admin", "packing", "delivery"])
      .not("auth_user_id", "is", null),
  ]);
  if (customer.error || recipients.error || !customer.data) {
    return Response.json({ error: "Notification data unavailable" }, { status: 500 });
  }

  const externalIds = (recipients.data ?? [])
    .map((recipient) => recipient.auth_user_id)
    .filter((id): id is string => typeof id === "string");
  if (!externalIds.length) return Response.json({ sent: false, reason: "no_recipients" });

  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: appId,
      idempotency_key: order.data.id,
      include_aliases: { external_id: externalIds },
      target_channel: "push",
      headings: { en: "New Order Received" },
      contents: {
        en: `${order.data.order_number} — ${customer.data.customer_name}\nPriority: ${order.data.priority}`,
      },
      url: new URL("/", request.url).toString(),
    }),
  });

  if (!response.ok) {
    console.error("OneSignal rejected a new-order notification", {
      status: response.status,
      statusText: response.statusText,
    });
    return Response.json({ error: "Push provider rejected the notification" }, { status: 502 });
  }
  return Response.json({ sent: true });
}
