import { supabase, supabaseConfigured } from "@/lib/supabase";

/**
 * Ask the Worker to send a OneSignal web push for a newly created order.
 * Safe to call multiple times for the same orderId — server dedupes.
 */
export async function requestNewOrderNotification(input: {
  orderId: string;
  orderNumber: string;
}) {
  if (!supabaseConfigured || !supabase) return { ok: false as const, skipped: true };

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false as const, skipped: true };

    const response = await fetch("/api/notify-new-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        orderId: input.orderId,
        orderNumber: input.orderNumber,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn("New-order notify failed:", response.status, text.slice(0, 200));
      return { ok: false as const, status: response.status };
    }

    return (await response.json()) as { ok: boolean; alreadySent?: boolean };
  } catch (error) {
    console.warn("New-order notify error:", error);
    return { ok: false as const, skipped: true };
  }
}
