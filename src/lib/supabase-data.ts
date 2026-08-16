import { supabase, supabaseConfigured } from "@/lib/supabase";
import { createId, generatePackingChecklist } from "@/lib/demo-data";
import type {
  AppState,
  CreateOrderInput,
  Customer,
  CustomerInput,
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

function mapOrder(
  row: Record<string, unknown>,
  customer: Record<string, unknown> | null,
  items: Record<string, unknown>[],
  usersById: Map<string, string>,
): Order {
  const products = items.map(mapItem);
  const status = STATUS_FROM_DB[String(row.status)] ?? "new";
  const createdById = row.created_by ? String(row.created_by) : "";
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
    notes: row.remarks ? String(row.remarks) : undefined,
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

function mapPayment(row: Record<string, unknown>, customerName: string, usersById: Map<string, string>): Payment {
  const receivedBy = row.received_by ? String(row.received_by) : "";
  return {
    id: String(row.id),
    customerName,
    invoiceNumber: String(row.invoice_number ?? ""),
    invoiceDate: String(row.invoice_date ?? ""),
    amount: Number(row.amount ?? 0),
    mode: String(row.payment_mode ?? "cash").toLowerCase() as Payment["mode"],
    orderId: undefined,
    notes: row.notes ? String(row.notes) : undefined,
    documents: [],
    collectedBy: usersById.get(receivedBy) ?? "Staff",
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

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

  const [customersRes, ordersRes, itemsRes, paymentsRes] = await Promise.all([
    supabase.from("customers").select("*").order("created_at", { ascending: false }),
    supabase.from("orders").select("*, customers(*)").order("created_at", { ascending: false }),
    supabase.from("order_items").select("*"),
    supabase.from("payments").select("*").order("created_at", { ascending: false }),
  ]);

  if (customersRes.error) throw customersRes.error;
  if (ordersRes.error) throw ordersRes.error;
  if (itemsRes.error) throw itemsRes.error;
  // Payments may be empty / RLS readable
  const paymentsRows = paymentsRes.error ? [] : paymentsRes.data ?? [];

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
  const orders = (ordersRes.data ?? []).map((row) => {
    const record = row as Record<string, unknown> & { customers?: Record<string, unknown> | null };
    return mapOrder(
      record,
      record.customers ?? null,
      itemsByOrder.get(String(record.id)) ?? [],
      usersById,
    );
  });

  const payments = paymentsRows.map((row) => {
    const record = row as Record<string, unknown>;
    const customerId = String(record.customer_id ?? "");
    return mapPayment(record, customerNameById.get(customerId) ?? "Customer", usersById);
  });

  return {
    customers,
    orders,
    payments,
    auditEvents: [],
    nextOrderSequence: orders.length + 1,
  };
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

export async function createLivePayment(input: PaymentInput, actor: UserProfile) {
  if (!supabase) throw new Error("Supabase missing");

  const customer = await findOrCreateCustomer({
    name: input.customerName,
    contactPerson: input.customerName,
    mobile: "",
    address: "",
  });

  const inserted = await supabase
    .from("payments")
    .insert({
      customer_id: customer.id,
      amount: input.amount,
      payment_mode: input.mode,
      invoice_number: input.invoiceNumber,
      invoice_date: input.invoiceDate || null,
      notes: input.notes || null,
      received_by: actor.id,
    })
    .select("*")
    .single();

  if (inserted.error || !inserted.data) {
    throw inserted.error ?? new Error("Payment create failed");
  }

  return mapPayment(
    inserted.data as Record<string, unknown>,
    customer.name,
    new Map(SUPABASE_USERS.map((user) => [user.id, user.name])),
  );
}

export function userForRole(role: Role): UserProfile {
  return SUPABASE_USERS.find((user) => user.role === role) ?? SUPABASE_USERS[0];
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
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export { createId };
