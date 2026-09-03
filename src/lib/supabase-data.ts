import { supabase, supabaseConfigured } from "@/lib/supabase";
import { createId, generatePackingChecklist } from "@/lib/demo-data";
import type {
  AppState,
  CreateOrderInput,
  Customer,
  CustomerInput,
  Expense,
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

const CUSTOMER_COLUMNS =
  "id,customer_name,contact_person,phone,address,gst_number,created_at";
const ORDER_COLUMNS =
  "id,order_number,invoice_number,invoice_date,customer_id,delivery_date,status,remarks,created_by,created_at,priority,delivery_instructions,packing_started_at,packing_completed_at,delivery_started_at,delivery_completed_at,return_reason";
const ORDER_ITEM_BASE_COLUMNS = "id,order_id,product_id,ordered_qty,product_name,unit";
const PAYMENT_COLUMNS =
  "id,customer_id,invoice_number,invoice_date,amount,payment_mode,notes,received_by,created_at";
const EXPENSE_COLUMNS =
  "id,amount,expense_date,category,description,submitted_by,receipt_path,receipt_file_name,created_at";
const USER_PROFILE_COLUMNS = "id,name,role,active,auth_user_id";
const USER_DIRECTORY_COLUMNS = "id,name";
const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";

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
    sellingPrice:
      row.selling_price === null || row.selling_price === undefined
        ? undefined
        : Number(row.selling_price),
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

const liveStateRequests = new Map<string, Promise<AppState>>();

async function fetchLiveState(role?: Role): Promise<AppState> {
  if (!supabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured");
  }

  const [usersRes, customersRes, ordersRes, itemsRes, paymentsRes, expensesRes] = await Promise.all([
    supabase.from("users").select(USER_DIRECTORY_COLUMNS).eq("active", true),
    supabase
      .from("customers")
      .select(CUSTOMER_COLUMNS)
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .order("created_at", { ascending: false }),
    supabase.from("order_items").select(ORDER_ITEM_BASE_COLUMNS),
    supabase
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .order("created_at", { ascending: false }),
    role === "admin" || role === "delivery"
      ? supabase
          .from("expenses")
          .select(EXPENSE_COLUMNS)
          .order("expense_date", { ascending: false })
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (usersRes.error) throw usersRes.error;
  if (customersRes.error) throw customersRes.error;
  if (ordersRes.error) throw ordersRes.error;
  if (itemsRes.error) throw itemsRes.error;
  // Payments may be empty / RLS readable
  const paymentsRows = paymentsRes.error ? [] : paymentsRes.data ?? [];
  if (expensesRes.error) throw expensesRes.error;
  const usersById = new Map(
    (usersRes.data ?? []).map((row) => [String(row.id), String(row.name ?? "Staff")]),
  );
  const pricesByItemId = new Map<string, { rate?: number; sellingPrice?: number }>();
  if (role === "admin") {
    const pricesRes = await supabase.rpc("get_admin_order_item_prices");
    let priceRows = pricesRes.data ?? [];

    // The Admin-only RPC arrives with the prepared RLS migration. Until then,
    // current production permits these explicit columns through its existing
    // order_items policy, so only a missing-RPC response uses this fallback.
    if (pricesRes.error?.code === "PGRST202") {
      const legacyPricesRes = await supabase
        .from("order_items")
        .select("id,rate,selling_price");
      if (legacyPricesRes.error) throw legacyPricesRes.error;
      priceRows = (legacyPricesRes.data ?? []).map((price) => ({
        order_item_id: price.id,
        rate: price.rate,
        selling_price: price.selling_price,
      }));
    } else if (pricesRes.error) {
      throw pricesRes.error;
    }

    for (const price of priceRows) {
      pricesByItemId.set(String(price.order_item_id), {
        rate: price.rate === null ? undefined : Number(price.rate),
        sellingPrice:
          price.selling_price === null ? undefined : Number(price.selling_price),
      });
    }
  }

  const customers = (customersRes.data ?? []).map((row) => mapCustomer(row as Record<string, unknown>));
  const itemsByOrder = new Map<string, Record<string, unknown>[]>();
  for (const item of itemsRes.data ?? []) {
    const row = item as Record<string, unknown>;
    const prices = pricesByItemId.get(String(row.id));
    if (prices) {
      row.rate = prices.rate;
      row.selling_price = prices.sellingPrice;
    }
    const orderId = String(row.order_id);
    const list = itemsByOrder.get(orderId) ?? [];
    list.push(row);
    itemsByOrder.set(orderId, list);
  }

  const customerById = new Map(
    (customersRes.data ?? []).map((row) => [String(row.id), row as Record<string, unknown>]),
  );
  const customerNameById = new Map(customers.map((customer) => [customer.id, customer.name]));
  const orders = (ordersRes.data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    return mapOrder(
      record,
      customerById.get(String(record.customer_id)) ?? null,
      itemsByOrder.get(String(record.id)) ?? [],
      usersById,
    );
  });

  const payments = paymentsRows.map((row) => {
    const record = row as Record<string, unknown>;
    const customerId = String(record.customer_id ?? "");
    return mapPayment(record, customerNameById.get(customerId) ?? "Customer", usersById);
  });
  const expenses = (expensesRes.data ?? []).map((row) =>
    mapExpense(row as Record<string, unknown>, usersById),
  );

  return {
    customers,
    orders,
    payments,
    expenses,
    auditEvents: [],
    nextOrderSequence: orders.length + 1,
  };
}

function mapExpense(row: Record<string, unknown>, usersById: Map<string, string>): Expense {
  const submittedBy = String(row.submitted_by ?? "");
  return {
    id: String(row.id),
    amount: Number(row.amount ?? 0),
    expenseDate: String(row.expense_date ?? ""),
    category: String(row.category ?? "Other") as Expense["category"],
    note: row.description ? String(row.description) : undefined,
    submittedBy,
    submittedByName: usersById.get(submittedBy) ?? "Staff",
    receiptPath: row.receipt_path ? String(row.receipt_path) : undefined,
    receiptFileName: row.receipt_file_name ? String(row.receipt_file_name) : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function isRole(value: unknown): value is Role {
  return value === "admin" || value === "packing" || value === "delivery";
}

export async function loadAuthenticatedProfile(authUserId: string): Promise<UserProfile | null> {
  if (!supabase) throw new Error("Supabase is not configured");
  const result = await supabase
    .from("users")
    .select(USER_PROFILE_COLUMNS)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (result.error) throw result.error;
  const row = result.data as Record<string, unknown> | null;
  if (!row || row.active !== true || !isRole(row.role)) return null;

  return {
    id: String(row.id),
    name: String(row.name ?? "Staff"),
    role: row.role,
    active: true,
    authUserId,
  };
}

/** Coalesces concurrent initial/realtime loads without caching settled data. */
export function loadLiveState(role?: Role): Promise<AppState> {
  const requestKey = role ?? "signed-out";
  const existing = liveStateRequests.get(requestKey);
  if (existing) return existing;

  const request = fetchLiveState(role).finally(() => {
    liveStateRequests.delete(requestKey);
  });
  liveStateRequests.set(requestKey, request);
  return request;
}

async function findOrCreateCustomer(input: {
  name: string;
  contactPerson: string;
  mobile: string;
  address: string;
  gst?: string;
}) {
  if (!supabase) throw new Error("Supabase missing");
  const name = input.name.trim();
  const existing = await supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .ilike("customer_name", name)
    .limit(1)
    .maybeSingle();

  if (existing.data) return mapCustomer(existing.data as Record<string, unknown>);

  const inserted = await supabase
    .from("customers")
    .insert({
      customer_name: name,
      contact_person: input.contactPerson.trim() || name,
      phone: input.mobile.trim() || null,
      address: input.address.trim() || "",
      gst_number: input.gst?.trim() || null,
    })
    .select(CUSTOMER_COLUMNS)
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
      address: "",
      gst_number: input.gst?.trim() || null,
    })
    .select(CUSTOMER_COLUMNS)
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
    .select(ORDER_COLUMNS)
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
      selling_price: product.sellingPrice ?? null,
      delivered_qty: 0,
      returned_qty: 0,
    }));

  if (itemRows.length) {
    const itemsInsert = await supabase.from("order_items").insert(itemRows);
    if (itemsInsert.error) throw itemsInsert.error;
  }

  const items = await supabase
    .from("order_items")
    .select(ORDER_ITEM_BASE_COLUMNS)
    .eq("order_id", orderId);
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
    new Map([[actor.id, actor.name]]),
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
    .select("id")
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
      selling_price: product.sellingPrice ?? null,
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
  const result = await supabase.from("orders").update(payload).eq("id", orderId).select("id").single();
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
      customer_name: customer.name,
      amount: input.amount,
      payment_mode: input.mode,
      invoice_number: input.invoiceNumber,
      invoice_date: input.invoiceDate || null,
      notes: input.notes || null,
      received_by: actor.id,
    })
    .select(PAYMENT_COLUMNS)
    .single();

  if (inserted.error || !inserted.data) {
    throw inserted.error ?? new Error("Payment create failed");
  }

  return mapPayment(
    inserted.data as Record<string, unknown>,
    customer.name,
    new Map([[actor.id, actor.name]]),
  );
}

function safeReceiptName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "receipt";
}

export async function createLiveExpense(input: ExpenseInput, actor: UserProfile) {
  if (!supabase) throw new Error("Supabase missing");
  if (actor.role !== "admin" && actor.role !== "delivery") {
    throw new Error("Expenses are restricted to Admin and Delivery");
  }

  let receiptPath: string | undefined;
  if (input.receipt) {
    receiptPath = `${actor.id}/${crypto.randomUUID()}-${safeReceiptName(input.receipt.name)}`;
    const uploaded = await supabase.storage
      .from(EXPENSE_RECEIPTS_BUCKET)
      .upload(receiptPath, input.receipt, {
        contentType: input.receipt.type || undefined,
        upsert: false,
      });
    if (uploaded.error) throw uploaded.error;
  }

  const inserted = await supabase
    .from("expenses")
    .insert({
      amount: input.amount,
      expense_date: input.expenseDate,
      category: input.category,
      description: input.note?.trim() || null,
      submitted_by: actor.id,
      receipt_path: receiptPath ?? null,
      receipt_file_name: input.receipt?.name ?? null,
    })
    .select(EXPENSE_COLUMNS)
    .single();

  if (inserted.error || !inserted.data) {
    if (receiptPath) {
      await supabase.storage.from(EXPENSE_RECEIPTS_BUCKET).remove([receiptPath]);
    }
    throw inserted.error ?? new Error("Expense create failed");
  }

  return mapExpense(
    inserted.data as Record<string, unknown>,
    new Map([[actor.id, actor.name]]),
  );
}

export async function getLiveExpenseReceiptUrl(path: string) {
  if (!supabase) throw new Error("Supabase missing");
  const signed = await supabase.storage
    .from(EXPENSE_RECEIPTS_BUCKET)
    .createSignedUrl(path, 60);
  if (signed.error || !signed.data) {
    throw signed.error ?? new Error("Receipt could not be opened");
  }
  return signed.data.signedUrl;
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
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export { createId };
