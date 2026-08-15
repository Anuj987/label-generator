export type Role = "admin" | "packing" | "delivery";

export type OrderStatus =
  | "new"
  | "packing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "partial_delivery"
  | "full_return";

export type Priority = "normal" | "urgent" | "very_urgent";

export type PaymentMode = "cash" | "upi" | "bank_transfer" | "cheque";

export type DocumentKind =
  | "signed_bill"
  | "return_photo"
  | "payment_proof"
  | "cheque_photo"
  | "upi_screenshot"
  | "receipt"
  | "customer_complaint"
  | "delivery_notes"
  | "other";

export type UserProfile = {
  id: string;
  name: string;
  role: Role;
};

/** Optional directory for quick pick — orders still store typed name fields. */
export type Customer = {
  id: string;
  name: string;
  mobile?: string;
  gst?: string;
  notes?: string;
  createdAt: string;
};

export type OrderProduct = {
  id: string;
  productName: string;
  quantity: number;
  unit: string;
  /** Free-text product specification for packing/delivery. */
  description?: string;
  /** Admin-only purchase cost. Hidden from packing and delivery. */
  purchasePrice?: number;
  productMasterId?: string;
};

export type PackingChecklistItem = {
  id: string;
  label: string;
  completed: boolean;
  kind: "general" | "product";
  productId?: string;
};

export type PartialDeliveryLine = {
  productId: string;
  productName: string;
  orderedQuantity: number;
  deliveredQuantity: number;
  returnedQuantity: number;
  reason: string;
};

export type UploadedFile = {
  id: string;
  name: string;
  kind: DocumentKind;
  dataUrl: string;
  uploadedAt: string;
  uploadedBy: string;
  orderId?: string;
  paymentId?: string;
};

/** Customer details are typed per order — not saved in a customer master. */
export type Order = {
  id: string;
  orderNumber: string;
  invoiceNumber: string;
  invoiceDate: string;
  deliveryDate: string;
  customerName: string;
  contactPerson: string;
  mobile: string;
  address: string;
  gst?: string;
  priority: Priority;
  notes?: string;
  status: OrderStatus;
  products: OrderProduct[];
  packingChecklist: PackingChecklistItem[];
  acceptedBy?: string;
  packingStartTime?: string;
  packingCompletedTime?: string;
  packingDurationMinutes?: number;
  deliveryStartTime?: string;
  deliveryCompletedTime?: string;
  deliveryOutcomeNotes?: string;
  partialLines?: PartialDeliveryLine[];
  returnReason?: string;
  documents: UploadedFile[];
  billingSource?: string;
  externalInvoiceId?: string;
  externalCustomerId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type Payment = {
  id: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  mode: PaymentMode;
  orderId?: string;
  notes?: string;
  documents: UploadedFile[];
  collectedBy: string;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  orderId?: string;
  paymentId?: string;
  actorId: string;
  actorName: string;
  action: string;
  detail: string;
  emoji: string;
  createdAt: string;
};

export type AppState = {
  customers: Customer[];
  orders: Order[];
  payments: Payment[];
  auditEvents: AuditEvent[];
  nextOrderSequence: number;
};

export type CustomerInput = {
  name: string;
  mobile?: string;
  gst?: string;
  notes?: string;
};

export type OrderProductInput = {
  productName: string;
  quantity: number;
  unit: string;
  description?: string;
  purchasePrice?: number;
};

export type CreateOrderInput = {
  invoiceNumber: string;
  invoiceDate: string;
  deliveryDate: string;
  customerName: string;
  contactPerson: string;
  mobile: string;
  address: string;
  gst?: string;
  priority: Priority;
  notes?: string;
  products: OrderProductInput[];
  billingSource?: string;
  externalInvoiceId?: string;
  externalCustomerId?: string;
};

export type PaymentInput = {
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  mode: PaymentMode;
  orderId?: string;
  notes?: string;
  files?: { name: string; kind: DocumentKind; dataUrl: string }[];
};
