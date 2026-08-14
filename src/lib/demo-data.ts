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

export function createInitialState(): AppState {
  return {
    orders: [],
    payments: [],
    auditEvents: [],
    nextOrderSequence: 1,
  };
}
