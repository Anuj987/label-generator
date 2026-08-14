import type {
  AppState,
  OrderProduct,
  PackingChecklistItem,
  Role,
  UserProfile,
} from "@/lib/types";

export const DEMO_USERS: UserProfile[] = [
  { id: "user-admin", name: "Anuj", role: "admin" },
  { id: "user-packing", name: "Somnath", role: "packing" },
  { id: "user-delivery", name: "Mayur", role: "delivery" },
];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  packing: "Packing",
  delivery: "Delivery",
};

export const STATUS_LABELS = {
  new: "New",
  packing: "Packing",
  ready: "Ready for Delivery",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  partial_delivery: "Partial Delivery",
  full_return: "Full Return",
} as const;

export const PRIORITY_LABELS = {
  normal: "Normal",
  urgent: "Urgent",
  very_urgent: "Very Urgent",
} as const;

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function formatOrderNumber(sequence: number) {
  return `NT-${String(sequence).padStart(5, "0")}`;
}

export function generatePackingChecklist(products: OrderProduct[]): PackingChecklistItem[] {
  const general: PackingChecklistItem[] = [
    { id: createId("check"), label: "Correct products packed", completed: false, kind: "general" },
    { id: createId("check"), label: "Correct quantity checked", completed: false, kind: "general" },
    { id: createId("check"), label: "Packaging completed", completed: false, kind: "general" },
    { id: createId("check"), label: "Sticker printed & applied", completed: false, kind: "general" },
    { id: createId("check"), label: "Invoice attached", completed: false, kind: "general" },
  ];

  const productChecks = products.map((product) => ({
    id: createId("check"),
    label: `${product.productName} packed`,
    completed: false,
    kind: "product" as const,
    productId: product.id,
  }));

  return [...general, ...productChecks];
}

export function totalQuantity(products: OrderProduct[]) {
  return products.reduce((sum, product) => sum + product.quantity, 0);
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export function createInitialState(): AppState {
  const customers = [
    {
      id: "cust-1",
      name: "Patel Brothers",
      contactPerson: "Rajesh Patel",
      mobile: "9876501234",
      address: "14 MG Road, Indore",
      gst: "23AABCU9603R1ZM",
      notes: "Prefers morning delivery",
      billingSource: "Swipe",
      externalCustomerId: "SWP-441",
      createdAt: hoursAgo(72),
    },
    {
      id: "cust-2",
      name: "City Care Pharma",
      contactPerson: "Amit Joshi",
      mobile: "9826011122",
      address: "8 Ring Road, Bhopal",
      billingSource: "Tally",
      externalCustomerId: "TLY-209",
      createdAt: hoursAgo(48),
    },
    {
      id: "cust-3",
      name: "GreenLeaf Distributors",
      contactPerson: "Sneha Patel",
      mobile: "9993344556",
      address: "Warehouse 3, Sanwer Road, Indore",
      gst: "23AAGCG1234F1Z5",
      createdAt: hoursAgo(30),
    },
  ];

  const productsA = [
    { id: "prod-a1", productName: "Cashew SW320", quantity: 10, unit: "kg" },
    { id: "prod-a2", productName: "Almond", quantity: 5, unit: "kg" },
  ];
  const productsB = [
    { id: "prod-b1", productName: "Raisins", quantity: 8, unit: "kg" },
  ];
  const productsC = [
    { id: "prod-c1", productName: "Pistachio", quantity: 4, unit: "kg" },
    { id: "prod-c2", productName: "Walnut", quantity: 6, unit: "kg" },
  ];

  const orders = [
    {
      id: "ord-1",
      orderNumber: "NT-00120",
      invoiceNumber: "INV-88921",
      invoiceDate: todayISODate(),
      deliveryDate: todayISODate(),
      customerId: "cust-1",
      priority: "urgent" as const,
      notes: "Handle with care",
      status: "packing" as const,
      products: productsA,
      packingChecklist: generatePackingChecklist(productsA).map((item, index) => ({
        ...item,
        completed: index < 3,
      })),
      acceptedBy: "Somnath",
      packingStartTime: hoursAgo(2),
      documents: [],
      billingSource: "Swipe",
      externalInvoiceId: "INV-88921",
      externalCustomerId: "SWP-441",
      createdAt: hoursAgo(4),
      updatedAt: hoursAgo(2),
      createdBy: "Anuj",
    },
    {
      id: "ord-2",
      orderNumber: "NT-00118",
      invoiceNumber: "INV-88910",
      invoiceDate: todayISODate(),
      deliveryDate: todayISODate(),
      customerId: "cust-2",
      priority: "normal" as const,
      status: "ready" as const,
      products: productsB,
      packingChecklist: generatePackingChecklist(productsB).map((item) => ({
        ...item,
        completed: true,
      })),
      acceptedBy: "Somnath",
      packingStartTime: hoursAgo(8),
      packingCompletedTime: hoursAgo(6),
      packingDurationMinutes: 120,
      documents: [],
      createdAt: hoursAgo(10),
      updatedAt: hoursAgo(6),
      createdBy: "Anuj",
    },
    {
      id: "ord-3",
      orderNumber: "NT-00125",
      invoiceNumber: "INV-88940",
      invoiceDate: todayISODate(),
      deliveryDate: todayISODate(),
      customerId: "cust-3",
      priority: "very_urgent" as const,
      notes: "Split cartons if needed",
      status: "new" as const,
      products: productsC,
      packingChecklist: generatePackingChecklist(productsC),
      documents: [],
      createdAt: hoursAgo(1),
      updatedAt: hoursAgo(1),
      createdBy: "Anuj",
    },
  ];

  const payments = [
    {
      id: "pay-1",
      customerId: "cust-1",
      invoiceNumber: "INV-88800",
      invoiceDate: todayISODate(),
      amount: 45000,
      mode: "upi" as const,
      notes: "Collected against previous invoice",
      documents: [],
      collectedBy: "Mayur",
      createdAt: hoursAgo(3),
    },
  ];

  const auditEvents = [
    {
      id: "evt-1",
      orderId: "ord-3",
      actorId: "user-admin",
      actorName: "Anuj",
      action: "order_created",
      detail: "Order NT-00125 created by Anuj",
      emoji: "🟢",
      createdAt: hoursAgo(1),
    },
    {
      id: "evt-2",
      orderId: "ord-1",
      actorId: "user-packing",
      actorName: "Somnath",
      action: "packing_started",
      detail: "Somnath accepted NT-00120 for packing",
      emoji: "📦",
      createdAt: hoursAgo(2),
    },
    {
      id: "evt-3",
      orderId: "ord-2",
      actorId: "user-packing",
      actorName: "Somnath",
      action: "packing_completed",
      detail: "Somnath marked NT-00118 Ready for Delivery",
      emoji: "📦",
      createdAt: hoursAgo(6),
    },
    {
      id: "evt-4",
      paymentId: "pay-1",
      actorId: "user-delivery",
      actorName: "Mayur",
      action: "payment_collected",
      detail: "Payment of ₹45,000 collected from Patel Brothers",
      emoji: "💰",
      createdAt: hoursAgo(3),
    },
  ];

  return {
    customers,
    orders,
    payments,
    auditEvents,
    nextOrderSequence: 126,
  };
}
