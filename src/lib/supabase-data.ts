import { supabase, supabaseConfigured } from "@/lib/supabase";
import { createId, generatePackingChecklist } from "@/lib/demo-data";
import { loadLiveAuditEvents, loadLivePayments, mergeAuditEvents, mergePayments } from "@/lib/storage";
import type {
  AppState,
  AuditEvent,
  CreateOrderInput,
  Customer,
  CustomerInput,
  Expense,
  ExpenseCategory,
  ExpenseInput,
  Order,
  OrderProduct,
  OrderStatus,
  Payment,
  PaymentInput,
  Priority,
  Role,
  UserProfile,
} from "@/lib/types";

/** Live DB status values */
type DbStatus =
  | "NEW"
  | "PACKING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "PARTIAL_DELIVERED"
  | "RETURNED";

const STATUS_TO_DB: Record<OrderStatus, DbStatus> = {
  new: "NEW",
  packing: "PACKING",
  ready: "READY",
  out_for_delivery: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
  partial_delivery: "PARTIAL_DELIVERED",
  full_return: "RETURNED",
};

const STATUS_FROM_DB: Record<string, OrderStatus> = {
  NEW: "new",
  PACKING: "packing",
  READY: "ready",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  PARTIAL_DELIVERED: "partial_delivery",
  RETURNED: "full_return",
};

/** Known staff rows in public.users */
export const SUPABASE_USERS: UserProfile[] = [
  { id: "b6b98dbb-37c9-4c7d-a267-3b0a9461996f", name: "Anuj", role: "admin" },
  { id: "065d7fc9-f882-4e47-90c8-7e859e5f1f31", name: "Somnath", role: "packing" },
  { id: "a06be2a4-842b-41fc-82ca-7c664e64637c", name: "Mayur", role: "delivery" },
];

const CHECKLIST_KEY = "nt-checklist-completions-v1";

type ChecklistStore = Record<string, Record<string, boolean>>;

function readChecklistStore(): ChecklistStore {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(CHECKLIST_KEY) || "{}") as ChecklistStore;
  } catch {
    return {};
  }
}

function writeChecklistStore(store: ChecklistStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHECKLIST_KEY, JSON.stringify(store));
}

export function persistChecklistCompletion(orderId: string, itemId: string, completed: boolean) {
  const store = readChecklistStore();
  store[orderId] = { ...(store[orderId] || {}), [itemId]: completed };
  writeChecklistStore(store);
}

function applyChecklistCompletions(orderId: string, products: OrderProduct[]) {
  const checklist = generatePackingChecklist(products);
  const saved = readChecklistStore()[orderId] || {};
  return checklist.map((item) => ({
    ...item,
    completed: Boolean(saved[item.id] ?? (item.productId ? saved[`product:${item.productId}`] : false)),
  }));
}

function encodeProductName(name: string, description?: string) {
  const clean = name.trim();
  const desc = description?.trim();
  return desc ? `${clean} :: ${desc}` : clean;
}

function decodeProductName(raw: string): { productName: string; description?: string } {
  const parts = raw.split(" :: ");
  if (parts.length < 2) return { productName: raw };
  return { productName: parts[0], description: parts.slice(1).join(" :: ") };
}

function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: String(row.id),
    name: String(row.customer_name ?? ""),
    mobile: row.phone ? String(row.phone) : undefined,
    gst: row.gst_number ? String(row.gst_number) : undefined,
    contactPerson: row.contact_person ? String(row.contact_person) : undefined,
    address: row.address ? String(row.address) : undefined,
    notes: undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapItem(row: Record<string, unknown>): OrderProduct {
  const decoded = decodeProductName(String(row.product_name ?? ""));
  return {
    id: String(row.id),
    productName: decoded.productName,
    description: decoded.description,
    quantity: Number(row.ordered_qty ?? 0),
    unit: String(row.unit ?? "kg"),
    purchasePrice: row.rate === null || row.rate === undefined ? undefined : Number(row.rate),
    productMasterId: row.product_id ? String(row.product_id) : undefined,
  };
}

const PACKING_NOTE_MARKER = "\n\n---\nPacking note:\n";

/** Split admin remarks from an appended packing note section. */
export function splitOrderRemarks(remarks?: string | null): {
  adminNotes?: string;
  packingNotes?: string;
} {
  const raw = remarks?.toString() ?? "";
  if (!raw.trim()) return {};
  const marker = "---\nPacking note:\n";
  const index = raw.indexOf(marker);
  if (index === -1) {
    return { adminNotes: raw.trim() || undefined };
  }
  const adminNotes = raw.slice(0, index).trim() || undefined;
  const packingNotes = raw.slice(index + marker.length).trim() || undefined;
  return { adminNotes, packingNotes };
}

export function mergeOrderRemarks(adminNotes?: string, packingNotes?: string) {
  const admin = adminNotes?.trim() || "";
  const packing = packingNotes?.trim() || "";
  if (!packing) return admin || null;
  if (!admin) return `---\nPacking note:\n${packing}`;
  return `${admin}${PACKING_NOTE_MARKER}${packing}`;
}

function mapOrder(
  row: Record<string, unknown>,
  customer: Record<string, unknown> | null,
  items: Record<string, unknown>[],
  usersById: Map<string, string>,
): Order {
  const products = items.map(mapItem);
  const status = STATUS_FROM_DB[String(row.status)] ?? "new";
  const createdById = row.created_by ? String(row.created_by) : "";
  const fromColumn = row.packing_notes ? String(row.packing_notes) : undefined;
  const split = splitOrderRemarks(row.remarks ? String(row.remarks) : undefined);
  return {
    id: String(row.id),
    orderNumber: String(row.order_number ?? ""),
    invoiceNumber: String(row.invoice_number ?? ""),
    invoiceDate: String(row.invoice_date ?? ""),
    deliveryDate: String(row.delivery_date ?? ""),
    customerName: String(customer?.customer_name ?? ""),
    contactPerson: String(customer?.contact_person ?? customer?.customer_name ?? ""),
    mobile: String(customer?.phone ?? ""),
    address: String(customer?.address ?? ""),
    gst: customer?.gst_number ? String(customer.gst_number) : undefined,
    priority: (String(row.priority ?? "normal") as Priority) || "normal",
    notes: split.adminNotes,
    packingNotes: fromColumn || split.packingNotes,
    status,
    products,
    packingChecklist: applyChecklistCompletions(String(row.id), products),
    acceptedBy: undefined,
    packingStartTime: row.packing_started_at ? String(row.packing_started_at) : undefined,
    packingCompletedTime: row.packing_completed_at ? String(row.packing_completed_at) : undefined,
    packingDurationMinutes: undefined,
    deliveryStartTime: row.delivery_started_at ? String(row.delivery_started_at) : undefined,
    deliveryCompletedTime: row.delivery_completed_at ? String(row.delivery_completed_at) : undefined,
    deliveryOutcomeNotes: row.delivery_instructions ? String(row.delivery_instructions) : undefined,
    returnReason: row.return_reason ? String(row.return_reason) : undefined,
    documents: [],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.created_at ?? new Date().toISOString()),
    createdBy: usersById.get(createdById) ?? "Admin",
  };
}

function mapPaymentMode(raw: unknown): Payment["mode"] {
  const value = String(raw ?? "cash").trim().toLowerCase().replace(/\s+/g, "_");
  if (value === "upi") return "upi";
  if (value === "cheque") return "cheque";
  if (value === "bank_transfer" || value === "banktransfer") return "bank_transfer";
  return "cash";
}

function mapPayment(row: Record<string, unknown>, customerName: string, usersById: Map<string, string>): Payment {
  const receivedBy = row.received_by ? String(row.received_by) : "";
  return {
    id: String(row.id),
    customerName,
    invoiceNumber: String(row.invoice_number ?? ""),
    invoiceDate: String(row.invoice_date ?? ""),
    amount: Number(row.amount ?? 0),
    mode: mapPaymentMode(row.payment_mode),
    orderId: undefined,
    notes: row.notes ? String(row.notes) : undefined,
    documents: [],
    collectedBy: usersById.get(receivedBy) ?? "Staff",
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

const LIVE_PAYMENT_MODE: Record<Payment["mode"], string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
};

function financialYearLabel(day = new Date()) {
  const year = day.getFullYear();
  const month = day.getMonth(); // 0-based; FY starts April
  const start = month >= 3 ? year : year - 1;
  const end = start + 1;
  return `${String(start).slice(-2)}-${String(end).slice(-2)}`;
}

export function nextLiveOrderNumber(existing: Order[]) {
  const fy = financialYearLabel();
  let max = 0;
  for (const order of existing) {
    const match = order.orderNumber.match(new RegExp(`NT/${fy}/(\\d+)`, "i"));
    if (match) max = Math.max(max, Number(match[1]));
    const plain = order.orderNumber.match(/^NT-(\d+)$/i);
    if (plain) max = Math.max(max, Number(plain[1]));
  }
  return `NT/${fy}/${String(max + 1).padStart(3, "0")}`;
}

export async function loadLiveState(): Promise<AppState> {
  if (!supabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }

  const usersById = new Map(SUPABASE_USERS.map((user) => [user.id, user.name]));

  const [
    customersRes,
    ordersRes,
    itemsRes,
    paymentsRes,
    docsRes,
    deliveryDocsRes,
    auditRes,
    packingRes,
    deliveryRes,
  ] = await Promise.all([
      supabase.from("customers").select("*").order("created_at", { ascending: false }),
      supabase.from("orders").select("*, customers(*)").order("created_at", { ascending: false }),
      supabase.from("order_items").select("*"),
      supabase.from("payments").select("*").order("created_at", { ascending: false }),
      supabase.from("payment_documents").select("*").order("uploaded_at", { ascending: false }).limit(500),
      supabase.from("delivery_documents").select("*").order("uploaded_at", { ascending: false }).limit(500),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("packing_events").select("*").order("accepted_at", { ascending: false }).limit(200),
      supabase.from("delivery_events").select("*").order("delivered_at", { ascending: false }).limit(200),
    ]);

  if (customersRes.error) throw customersRes.error;
  if (ordersRes.error) throw ordersRes.error;
  if (itemsRes.error) throw itemsRes.error;
  // Payments may be empty / RLS readable
  const paymentsRows = paymentsRes.error ? [] : paymentsRes.data ?? [];
  const paymentDocRows = docsRes.error ? [] : docsRes.data ?? [];
  const deliveryDocRows = deliveryDocsRes.error ? [] : deliveryDocsRes.data ?? [];
  const auditRows = auditRes.error ? [] : auditRes.data ?? [];
  const packingRows = packingRes.error ? [] : packingRes.data ?? [];
  const deliveryRows = deliveryRes.error ? [] : deliveryRes.data ?? [];

  const customers = (customersRes.data ?? []).map((row) => mapCustomer(row as Record<string, unknown>));
  const itemsByOrder = new Map<string, Record<string, unknown>[]>();
  for (const item of itemsRes.data ?? []) {
    const row = item as Record<string, unknown>;
    const orderId = String(row.order_id);
    const list = itemsByOrder.get(orderId) ?? [];
    list.push(row);
    itemsByOrder.set(orderId, list);
  }

  const customerNameById = new Map(customers.map((customer) => [customer.id, customer.name]));
  const deliveryDocsByOrder = new Map<string, Order["documents"]>();
  for (const row of deliveryDocRows) {
    const record = row as Record<string, unknown>;
    const orderId = record.order_id ? String(record.order_id) : "";
    const imageUrl = record.image_url ? String(record.image_url) : "";
    if (!orderId || !imageUrl) continue;
    const list = deliveryDocsByOrder.get(orderId) ?? [];
    list.push({
      id: String(record.id),
      name: String(record.file_name ?? "delivery-receipt.jpg"),
      kind: "signed_bill",
      dataUrl: imageUrl,
      uploadedAt: String(record.uploaded_at ?? new Date().toISOString()),
      uploadedBy: record.uploaded_by
        ? usersById.get(String(record.uploaded_by)) ?? "Delivery"
        : "Delivery",
      orderId,
    });
    deliveryDocsByOrder.set(orderId, list);
  }

  const orders = (ordersRes.data ?? []).map((row) => {
    const record = row as Record<string, unknown> & { customers?: Record<string, unknown> | null };
    const mapped = mapOrder(
      record,
      record.customers ?? null,
      itemsByOrder.get(String(record.id)) ?? [],
      usersById,
    );
    return {
      ...mapped,
      documents: deliveryDocsByOrder.get(mapped.id) ?? [],
    };
  });
  const orderNumberById = new Map(orders.map((order) => [order.id, order.orderNumber]));

  const docsByPayment = new Map<string, Payment["documents"]>();
  for (const row of paymentDocRows) {
    const record = row as Record<string, unknown>;
    const paymentId = record.payment_id ? String(record.payment_id) : "";
    if (!paymentId) continue;
    const imageUrl = String(record.image_url ?? "");
    if (!imageUrl) continue;
    const list = docsByPayment.get(paymentId) ?? [];
    list.push({
      id: String(record.id),
      name: String(record.file_name ?? "payment-proof"),
      kind: "payment_proof",
      dataUrl: imageUrl,
      uploadedAt: String(record.uploaded_at ?? new Date().toISOString()),
      uploadedBy: record.uploaded_by
        ? usersById.get(String(record.uploaded_by)) ?? "Staff"
        : "Staff",
      paymentId,
    });
    docsByPayment.set(paymentId, list);
  }

  const payments = paymentsRows.map((row) => {
    const record = row as Record<string, unknown>;
    const customerId = String(record.customer_id ?? "");
    const mapped = mapPayment(record, customerNameById.get(customerId) ?? "Customer", usersById);
    return {
      ...mapped,
      documents: docsByPayment.get(mapped.id) ?? [],
    };
  });

  const remoteAudit: AuditEvent[] = [];

  for (const row of auditRows) {
    const record = row as Record<string, unknown>;
    const userId = record.user_id ? String(record.user_id) : "";
    const action = String(record.action ?? "event");
    remoteAudit.push({
      id: String(record.id),
      orderId: record.order_id ? String(record.order_id) : undefined,
      actorId: userId || "system",
      actorName: usersById.get(userId) ?? "Staff",
      action,
      detail: String(record.description ?? action),
      emoji: action.includes("edit") ? "✏️" : action.includes("creat") ? "🟢" : "📋",
      createdAt: String(record.created_at ?? new Date().toISOString()),
    });
  }

  for (const row of packingRows) {
    const record = row as Record<string, unknown>;
    const orderId = record.order_id ? String(record.order_id) : undefined;
    const userId = record.packing_user ? String(record.packing_user) : "";
    const orderLabel = orderId ? orderNumberById.get(orderId) ?? orderId : "order";
    if (record.accepted_at) {
      remoteAudit.push({
        id: `pack-accept-${record.id}`,
        orderId,
        actorId: userId || "system",
        actorName: usersById.get(userId) ?? "Packing",
        action: "packing_accepted",
        detail: `${usersById.get(userId) ?? "Packing"} accepted ${orderLabel} for packing`,
        emoji: "📦",
        createdAt: String(record.accepted_at),
      });
    }
    if (record.ready_at) {
      remoteAudit.push({
        id: `pack-ready-${record.id}`,
        orderId,
        actorId: userId || "system",
        actorName: usersById.get(userId) ?? "Packing",
        action: "ready_for_delivery",
        detail: `${usersById.get(userId) ?? "Packing"} marked ${orderLabel} Ready for Delivery`,
        emoji: "✅",
        createdAt: String(record.ready_at),
      });
    }
  }

  for (const row of deliveryRows) {
    const record = row as Record<string, unknown>;
    const orderId = record.order_id ? String(record.order_id) : undefined;
    const userId = record.delivery_user ? String(record.delivery_user) : "";
    const actorName = usersById.get(userId) ?? "Delivery";
    const orderLabel = orderId ? orderNumberById.get(orderId) ?? orderId : "order";
    if (record.started_at) {
      remoteAudit.push({
        id: `del-start-${record.id}`,
        orderId,
        actorId: userId || "system",
        actorName,
        action: "delivery_started",
        detail: `${actorName} started delivery for ${orderLabel}`,
        emoji: "🚚",
        createdAt: String(record.started_at),
      });
    }
    if (record.delivered_at) {
      const status = String(record.status ?? "FULL").toUpperCase();
      const outcome =
        status.includes("PARTIAL")
          ? "partial delivery"
          : status.includes("RETURN")
            ? "full return"
            : "delivered";
      remoteAudit.push({
        id: `del-done-${record.id}`,
        orderId,
        actorId: userId || "system",
        actorName,
        action: "delivery_completed",
        detail: `${actorName} marked ${orderLabel} as ${outcome}`,
        emoji: "🚚",
        createdAt: String(record.delivered_at),
      });
    }
  }

  return {
    customers,
    orders,
    payments: mergePayments(loadLivePayments(), payments),
    expenses: [],
    auditEvents: mergeAuditEvents(loadLiveAuditEvents(), remoteAudit),
    nextOrderSequence: orders.length + 1,
  };
}

export async function recordLiveAuditLog(input: {
  orderId?: string;
  userId: string;
  action: string;
  description: string;
}) {
  if (!supabase) return;
  const result = await supabase.from("audit_logs").insert({
    order_id: input.orderId ?? null,
    user_id: input.userId,
    action: input.action,
    description: input.description,
  });
  if (result.error) {
    // RLS may block inserts; local timeline still records the event.
  }
}

async function findOrCreateCustomer(input: {
  name: string;
  contactPerson?: string;
  mobile?: string;
  address?: string;
  gst?: string;
}) {
  if (!supabase) throw new Error("Supabase missing");
  const name = input.name.trim();
  const existing = await supabase
    .from("customers")
    .select("*")
    .ilike("customer_name", name)
    .limit(1)
    .maybeSingle();

  if (existing.data) {
    const patch: Record<string, string> = {};
    if (input.contactPerson?.trim()) patch.contact_person = input.contactPerson.trim();
    if (input.mobile?.trim()) patch.phone = input.mobile.trim();
    if (input.address?.trim()) patch.address = input.address.trim();
    if (input.gst?.trim()) patch.gst_number = input.gst.trim();

    if (Object.keys(patch).length) {
      const updated = await supabase
        .from("customers")
        .update(patch)
        .eq("id", existing.data.id)
        .select("*")
        .single();
      if (updated.data) return mapCustomer(updated.data as Record<string, unknown>);
    }

    return mapCustomer(existing.data as Record<string, unknown>);
  }

  const inserted = await supabase
    .from("customers")
    .insert({
      customer_name: name,
      contact_person: input.contactPerson?.trim() || null,
      phone: input.mobile?.trim() || null,
      address: input.address?.trim() || null,
      gst_number: input.gst?.trim() || null,
    })
    .select("*")
    .single();

  if (inserted.error || !inserted.data) {
    throw inserted.error ?? new Error("Failed to create customer");
  }
  return mapCustomer(inserted.data as Record<string, unknown>);
}

export async function createLiveCustomer(input: CustomerInput) {
  if (!supabase) throw new Error("Supabase missing");
  const inserted = await supabase
    .from("customers")
    .insert({
      customer_name: input.name.trim(),
      contact_person: input.name.trim(),
      phone: input.mobile?.trim() || null,
      address: null,
      gst_number: input.gst?.trim() || null,
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) throw inserted.error ?? new Error("Customer create failed");
  return mapCustomer(inserted.data as Record<string, unknown>);
}

export async function createLiveOrder(
  input: CreateOrderInput,
  actor: UserProfile,
  existingOrders: Order[],
): Promise<Order> {
  if (!supabase) throw new Error("Supabase missing");

  const customer = await findOrCreateCustomer({
    name: input.customerName,
    contactPerson: input.contactPerson,
    mobile: input.mobile,
    address: input.address,
    gst: input.gst,
  });

  const orderNumber = nextLiveOrderNumber(existingOrders);
  const inserted = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      invoice_number: input.invoiceNumber || null,
      invoice_date: input.invoiceDate || null,
      customer_id: customer.id,
      delivery_date: input.deliveryDate,
      status: "NEW",
      priority: input.priority || "normal",
      remarks: input.notes || null,
      created_by: actor.id,
    })
    .select("*")
    .single();

  if (inserted.error || !inserted.data) {
    throw inserted.error ?? new Error("Order create failed");
  }

  const orderId = String(inserted.data.id);
  const itemRows = input.products
    .filter((product) => product.productName.trim())
    .map((product) => ({
      order_id: orderId,
      product_name: encodeProductName(product.productName, product.description),
      ordered_qty: product.quantity,
      unit: product.unit || "kg",
      rate: product.purchasePrice ?? null,
      amount:
        product.purchasePrice !== undefined ? product.purchasePrice * product.quantity : null,
      delivered_qty: 0,
      returned_qty: 0,
    }));

  if (itemRows.length) {
    const itemsInsert = await supabase.from("order_items").insert(itemRows).select("*");
    if (itemsInsert.error) throw itemsInsert.error;
  }

  const items = await supabase.from("order_items").select("*").eq("order_id", orderId);
  return mapOrder(
    inserted.data as Record<string, unknown>,
    {
      customer_name: customer.name,
      contact_person: input.contactPerson,
      phone: input.mobile,
      address: input.address,
      gst_number: input.gst,
    },
    (items.data ?? []) as Record<string, unknown>[],
    new Map(SUPABASE_USERS.map((user) => [user.id, user.name])),
  );
}

export async function updateLiveOrderBeforePacking(orderId: string, input: CreateOrderInput) {
  if (!supabase) throw new Error("Supabase missing");

  const customer = await findOrCreateCustomer({
    name: input.customerName,
    contactPerson: input.contactPerson,
    mobile: input.mobile,
    address: input.address,
    gst: input.gst,
  });

  const updated = await supabase
    .from("orders")
    .update({
      invoice_number: input.invoiceNumber || null,
      invoice_date: input.invoiceDate || null,
      customer_id: customer.id,
      delivery_date: input.deliveryDate,
      priority: input.priority || "normal",
      remarks: input.notes || null,
    })
    .eq("id", orderId)
    .eq("status", "NEW")
    .select("*")
    .single();

  if (updated.error) throw updated.error;

  await supabase.from("order_items").delete().eq("order_id", orderId);
  const itemRows = input.products
    .filter((product) => product.productName.trim())
    .map((product) => ({
      order_id: orderId,
      product_name: encodeProductName(product.productName, product.description),
      ordered_qty: product.quantity,
      unit: product.unit || "kg",
      rate: product.purchasePrice ?? null,
      amount:
        product.purchasePrice !== undefined ? product.purchasePrice * product.quantity : null,
      delivered_qty: 0,
      returned_qty: 0,
    }));
  if (itemRows.length) {
    const itemsInsert = await supabase.from("order_items").insert(itemRows);
    if (itemsInsert.error) throw itemsInsert.error;
  }
}

export async function updateLiveOrderStatus(
  orderId: string,
  status: OrderStatus,
  patch: Record<string, unknown> = {},
) {
  if (!supabase) throw new Error("Supabase missing");
  const payload: Record<string, unknown> = {
    status: STATUS_TO_DB[status],
    ...patch,
  };
  const result = await supabase.from("orders").update(payload).eq("id", orderId).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

/**
 * Packing-only optional note after accept.
 * Uses existing remarks field with a packing marker (no migration required).
 * Does not grant packing rights to edit other order fields.
 */
export async function updateLivePackingNotes(orderId: string, packingNotes: string, adminNotes?: string) {
  if (!supabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }

  const remarks = mergeOrderRemarks(adminNotes, packingNotes);
  const result = await supabase
    .from("orders")
    .update({ remarks })
    .eq("id", orderId)
    .eq("status", "PACKING")
    .select("*")
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    throw new Error("Packing notes can only be saved while the order is in Packing status.");
  }
  return result.data;
}

/**
 * Admin-only order delete.
 * Prefers SECURITY DEFINER RPC `delete_nt_order` (role-checked server-side).
 * Does not delete customers or payment collection rows.
 */
export async function deleteLiveOrder(orderId: string) {
  if (!supabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }

  const rpc = await supabase.rpc("delete_nt_order", { p_order_id: orderId });
  if (!rpc.error) return;

  const message =
    rpc.error && typeof rpc.error === "object" && "message" in rpc.error
      ? String((rpc.error as { message?: string }).message || "Order delete failed")
      : "Order delete failed";

  // If the migration has not been applied yet, surface a clear admin action.
  if (/could not find the function|schema cache|does not exist/i.test(message)) {
    throw new Error(
      "Order delete is not enabled in Supabase yet. Run supabase/order-permissions.sql in the SQL Editor, then try again.",
    );
  }

  throw new Error(message);
}

export async function updateLiveOrderItemsQuantities(
  lines: Array<{ productId: string; deliveredQuantity: number; returnedQuantity: number }>,
) {
  if (!supabase) throw new Error("Supabase missing");
  for (const line of lines) {
    const result = await supabase
      .from("order_items")
      .update({
        delivered_qty: line.deliveredQuantity,
        returned_qty: line.returnedQuantity,
      })
      .eq("id", line.productId);
    if (result.error) throw result.error;
  }
}

export async function uploadLiveDeliveryDocuments(
  orderId: string,
  docs: Array<{ name: string; dataUrl: string; mimeType?: string }>,
  uploadedBy: string,
) {
  if (!supabase || !docs.length) return;

  const rows = docs.map((doc) => ({
    order_id: orderId,
    image_url: doc.dataUrl,
    file_name: doc.name,
    mime_type: doc.mimeType || "image/jpeg",
    uploaded_by: uploadedBy,
    document_type: "delivery_bill",
  }));

  const inserted = await supabase.from("delivery_documents").insert(rows).select("*");
  if (inserted.error) throw inserted.error;
}

export async function createLivePayment(input: PaymentInput, actor: UserProfile) {
  if (!supabase) throw new Error("Supabase missing");

  if (input.mode === "cheque" && !input.chequeNumber?.trim()) {
    throw new Error("Cheque number is required for cheque payments");
  }

  const paymentDate = input.paymentDate || input.invoiceDate || new Date().toISOString().slice(0, 10);

  // Live DB blocks direct inserts on public.payments (RLS). Use the existing SECURITY DEFINER RPC.
  const rpc = await supabase.rpc("record_nt_payment", {
    p_customer_name: input.customerName.trim(),
    p_amount: input.amount,
    p_payment_mode: LIVE_PAYMENT_MODE[input.mode],
    p_invoice_number: input.invoiceNumber.trim() || null,
    p_invoice_date: input.invoiceDate || null,
    p_payment_date: paymentDate,
    p_notes: input.notes?.trim() || null,
    p_cheque_number: input.mode === "cheque" ? input.chequeNumber?.trim() || null : null,
  });

  if (rpc.error || !rpc.data) {
    const message =
      rpc.error && typeof rpc.error === "object" && "message" in rpc.error
        ? String((rpc.error as { message?: string }).message || "Payment create failed")
        : "Payment create failed";
    throw new Error(message);
  }

  const paymentId = String(rpc.data);
  const now = new Date().toISOString();
  const documents = (input.files ?? []).map((file, index) => ({
    id: `${paymentId}-doc-${index}`,
    name: file.name,
    kind: file.kind,
    dataUrl: file.dataUrl,
    uploadedAt: now,
    uploadedBy: actor.name,
    paymentId,
    orderId: input.orderId,
  }));

  // Best-effort attach into payment_documents when Auth + RPC policy allow it.
  for (const file of input.files ?? []) {
    const mime =
      file.dataUrl.startsWith("data:") && file.dataUrl.includes(";")
        ? file.dataUrl.slice(5, file.dataUrl.indexOf(";"))
        : "application/octet-stream";
    const attached = await supabase.rpc("attach_nt_payment_document", {
      p_payment_id: paymentId,
      p_file_name: file.name,
      p_file_path: file.dataUrl,
      p_mime_type: mime,
    });
    if (attached.error) {
      // Local payment list still keeps the preview via documents[].
      console.warn("Payment proof attach skipped:", attached.error.message);
    }
  }

  // Best-effort readback; RLS may hide the row from the publishable key.
  const fetched = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
  if (fetched.data) {
    const record = fetched.data as Record<string, unknown>;
    const mapped = mapPayment(
      record,
      input.customerName.trim(),
      new Map(SUPABASE_USERS.map((user) => [user.id, user.name])),
    );
    return { ...mapped, documents };
  }

  return {
    id: paymentId,
    customerName: input.customerName.trim(),
    invoiceNumber: input.invoiceNumber.trim(),
    invoiceDate: input.invoiceDate,
    amount: input.amount,
    mode: input.mode,
    orderId: input.orderId,
    notes: input.notes,
    documents,
    collectedBy: actor.name,
    createdAt: now,
  } satisfies Payment;
}

export function userForRole(role: Role): UserProfile {
  return SUPABASE_USERS.find((user) => user.role === role) ?? SUPABASE_USERS[0];
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Fuel",
  "Transport",
  "Food",
  "Packing Material",
  "Loading/Unloading",
  "Other",
];

function isExpenseCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as string[]).includes(value);
}

function mapExpense(row: Record<string, unknown>, usersById: Map<string, string>): Expense {
  const submittedBy = String(row.submitted_by ?? "");
  const categoryRaw = String(row.category ?? "Other");
  return {
    id: String(row.id),
    amount: Number(row.amount ?? 0),
    expenseDate: String(row.expense_date ?? "").slice(0, 10),
    category: isExpenseCategory(categoryRaw) ? categoryRaw : "Other",
    description: row.description ? String(row.description) : undefined,
    submittedBy,
    submittedByName: usersById.get(submittedBy) ?? "Staff",
    receiptPath: row.receipt_path ? String(row.receipt_path) : undefined,
    receiptFileName: row.receipt_file_name ? String(row.receipt_file_name) : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/** Load expenses visible to the current Auth session (RLS enforced). */
export async function loadLiveExpensesFromDb(): Promise<Expense[]> {
  if (!supabaseConfigured || !supabase) return [];

  const usersById = new Map(SUPABASE_USERS.map((user) => [user.id, user.name]));
  const result = await supabase
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (result.error) {
    // Table may not exist until the manual migration is applied.
    console.warn("Expenses load skipped:", result.error.message);
    return [];
  }

  const expenses = (result.data ?? []).map((row) => mapExpense(row as Record<string, unknown>, usersById));

  // Resolve private receipt previews via short-lived signed URLs (never public).
  await Promise.all(
    expenses.map(async (expense) => {
      if (!expense.receiptPath || !supabase) return;
      const signed = await supabase.storage
        .from("expense-receipts")
        .createSignedUrl(expense.receiptPath, 60 * 60);
      if (!signed.error && signed.data?.signedUrl) {
        expense.receiptPreviewUrl = signed.data.signedUrl;
      }
    }),
  );

  return expenses;
}

export async function createLiveExpense(input: ExpenseInput, actor: UserProfile): Promise<Expense> {
  if (!supabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }

  const insert = await supabase
    .from("expenses")
    .insert({
      amount: input.amount,
      expense_date: input.expenseDate,
      category: input.category,
      description: input.description?.trim() || null,
      submitted_by: actor.id,
    })
    .select("*")
    .maybeSingle();

  if (insert.error || !insert.data) {
    const message =
      insert.error && typeof insert.error === "object" && "message" in insert.error
        ? String((insert.error as { message?: string }).message || "Expense create failed")
        : "Expense create failed";
    throw new Error(message);
  }

  const row = insert.data as Record<string, unknown>;
  const expenseId = String(row.id);
  let receiptPath: string | undefined;
  let receiptFileName: string | undefined;
  let receiptPreviewUrl: string | undefined = input.receipt?.dataUrl;

  if (input.receipt?.dataUrl) {
    const safeName = (input.receipt.name || "receipt.jpg").replace(/[^\w.\-]+/g, "_");
    const path = `${actor.id}/${expenseId}/${safeName}`;
    try {
      const blob = await dataUrlToBlob(input.receipt.dataUrl);
      const uploaded = await supabase.storage.from("expense-receipts").upload(path, blob, {
        contentType: blob.type || "image/jpeg",
        upsert: false,
      });
      if (!uploaded.error) {
        receiptPath = path;
        receiptFileName = safeName;
        const updated = await supabase
          .from("expenses")
          .update({ receipt_path: path, receipt_file_name: safeName })
          .eq("id", expenseId)
          .eq("submitted_by", actor.id);
        if (updated.error) {
          console.warn("Expense receipt path update skipped:", updated.error.message);
        }
        const signed = await supabase.storage.from("expense-receipts").createSignedUrl(path, 60 * 60);
        if (!signed.error && signed.data?.signedUrl) {
          receiptPreviewUrl = signed.data.signedUrl;
        }
      } else {
        console.warn("Expense receipt upload skipped:", uploaded.error.message);
      }
    } catch (error) {
      console.warn("Expense receipt upload failed:", error);
    }
  }

  return {
    ...mapExpense(row, new Map(SUPABASE_USERS.map((user) => [user.id, user.name]))),
    receiptPath,
    receiptFileName,
    receiptPreviewUrl,
  };
}

export function subscribeLiveChanges(onChange: () => void) {
  if (!supabaseConfigured || !supabase) return () => undefined;

  const client = supabase;
  const channel = client
    .channel("nt-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "audit_logs" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "packing_events" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "delivery_events" }, onChange)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export { createId };
