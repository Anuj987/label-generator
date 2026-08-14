"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DEMO_USERS, createId, formatOrderNumber, generatePackingChecklist } from "@/lib/demo-data";
import {
  fileToDataUrl,
  getRoleCookie,
  loadState,
  minutesBetween,
  saveState,
  setRoleCookie,
} from "@/lib/storage";
import type {
  AppState,
  CreateOrderInput,
  CustomerInput,
  DocumentKind,
  Order,
  PartialDeliveryLine,
  PaymentInput,
  Role,
  UploadedFile,
  UserProfile,
} from "@/lib/types";

type AppContextValue = {
  ready: boolean;
  currentUser: UserProfile | null;
  state: AppState;
  login: (role: Role) => void;
  logout: () => void;
  createCustomer: (input: CustomerInput) => void;
  createOrder: (input: CreateOrderInput) => Order;
  updateOrderBeforePacking: (orderId: string, input: CreateOrderInput) => void;
  acceptOrder: (orderId: string) => void;
  toggleChecklistItem: (orderId: string, itemId: string) => void;
  markReadyForDelivery: (orderId: string) => void;
  startDelivery: (orderId: string) => void;
  completeDelivered: (orderId: string, files: File[], notes?: string) => Promise<void>;
  completePartialDelivery: (
    orderId: string,
    lines: PartialDeliveryLine[],
    files: File[],
    notes?: string,
  ) => Promise<void>;
  completeFullReturn: (orderId: string, reason: string, files: File[]) => Promise<void>;
  recordPayment: (input: PaymentInput) => Promise<void>;
  addOrderDocuments: (orderId: string, files: File[], kind: DocumentKind) => Promise<void>;
  searchAll: (query: string) => {
    customers: AppState["customers"];
    orders: AppState["orders"];
    payments: AppState["payments"];
  };
};

const AppContext = createContext<AppContextValue | null>(null);

function pushEvent(
  state: AppState,
  event: Omit<AppState["auditEvents"][number], "id" | "createdAt"> & { createdAt?: string },
): AppState {
  return {
    ...state,
    auditEvents: [
      {
        id: createId("evt"),
        createdAt: event.createdAt ?? new Date().toISOString(),
        ...event,
      },
      ...state.auditEvents,
    ],
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [state, setState] = useState<AppState>(() => loadState());

  useEffect(() => {
    const role = getRoleCookie();
    const user = DEMO_USERS.find((item) => item.role === role) ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional client hydration
    setCurrentUser(user);
    setState(loadState());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveState(state);
  }, [ready, state]);

  const value = useMemo<AppContextValue>(() => {
    function login(role: Role) {
      const user = DEMO_USERS.find((item) => item.role === role) ?? null;
      setRoleCookie(role);
      setCurrentUser(user);
    }

    function logout() {
      setRoleCookie(null);
      setCurrentUser(null);
    }

    function createCustomer(input: CustomerInput) {
      if (!currentUser || currentUser.role !== "admin") return;
      const name = input.name.trim();
      if (!name) return;

      const exists = state.customers.some(
        (customer) => customer.name.toLowerCase() === name.toLowerCase(),
      );
      if (exists) return;

      const customer = {
        id: createId("cust"),
        name,
        mobile: input.mobile?.trim() || undefined,
        gst: input.gst?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      setState((previous) => ({
        ...previous,
        customers: [customer, ...previous.customers],
      }));
    }

    function createOrder(input: CreateOrderInput) {
      if (!currentUser || currentUser.role !== "admin") {
        throw new Error("Only admin can create orders");
      }

      const products = input.products.map((product) => ({
        id: createId("prod"),
        ...product,
      }));
      const orderNumber = formatOrderNumber(state.nextOrderSequence);
      const now = new Date().toISOString();
      const order: Order = {
        id: createId("ord"),
        orderNumber,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        deliveryDate: input.deliveryDate,
        customerName: input.customerName.trim(),
        contactPerson: input.contactPerson.trim(),
        mobile: input.mobile.trim(),
        address: input.address.trim(),
        gst: input.gst?.trim() || undefined,
        priority: input.priority,
        notes: input.notes,
        status: "new",
        products,
        packingChecklist: generatePackingChecklist(products),
        documents: [],
        billingSource: input.billingSource,
        externalInvoiceId: input.externalInvoiceId || input.invoiceNumber,
        externalCustomerId: input.externalCustomerId,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser.name,
      };

      setState((previous) =>
        pushEvent(
          {
            ...previous,
            orders: [order, ...previous.orders],
            nextOrderSequence: previous.nextOrderSequence + 1,
          },
          {
            orderId: order.id,
            actorId: currentUser.id,
            actorName: currentUser.name,
            action: "order_created",
            detail: `Order ${order.orderNumber} created by ${currentUser.name} for ${order.customerName}`,
            emoji: "🟢",
          },
        ),
      );

      return order;
    }

    function updateOrderBeforePacking(orderId: string, input: CreateOrderInput) {
      if (!currentUser || currentUser.role !== "admin") return;

      setState((previous) => {
        const existing = previous.orders.find((order) => order.id === orderId);
        if (!existing || existing.status !== "new") return previous;

        const products = input.products.map((product) => ({
          id: createId("prod"),
          ...product,
        }));

        return {
          ...previous,
          orders: previous.orders.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  invoiceNumber: input.invoiceNumber,
                  invoiceDate: input.invoiceDate,
                  deliveryDate: input.deliveryDate,
                  customerName: input.customerName.trim(),
                  contactPerson: input.contactPerson.trim(),
                  mobile: input.mobile.trim(),
                  address: input.address.trim(),
                  gst: input.gst?.trim() || undefined,
                  priority: input.priority,
                  notes: input.notes,
                  products,
                  packingChecklist: generatePackingChecklist(products),
                  billingSource: input.billingSource,
                  externalInvoiceId: input.externalInvoiceId || input.invoiceNumber,
                  externalCustomerId: input.externalCustomerId,
                  updatedAt: new Date().toISOString(),
                }
              : order,
          ),
        };
      });
    }

    function acceptOrder(orderId: string) {
      if (!currentUser || currentUser.role !== "packing") return;
      const now = new Date().toISOString();

      setState((previous) => {
        const target = previous.orders.find((order) => order.id === orderId);
        if (!target || target.status !== "new") return previous;

        return pushEvent(
          {
            ...previous,
            orders: previous.orders.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    status: "packing",
                    acceptedBy: currentUser.name,
                    packingStartTime: now,
                    updatedAt: now,
                  }
                : order,
            ),
          },
          {
            orderId,
            actorId: currentUser.id,
            actorName: currentUser.name,
            action: "packing_started",
            detail: `${currentUser.name} accepted ${target.orderNumber} for packing`,
            emoji: "📦",
          },
        );
      });
    }

    function toggleChecklistItem(orderId: string, itemId: string) {
      if (!currentUser || currentUser.role !== "packing") return;

      setState((previous) => ({
        ...previous,
        orders: previous.orders.map((order) => {
          if (order.id !== orderId || order.status !== "packing") return order;
          return {
            ...order,
            packingChecklist: order.packingChecklist.map((item) =>
              item.id === itemId ? { ...item, completed: !item.completed } : item,
            ),
            updatedAt: new Date().toISOString(),
          };
        }),
      }));
    }

    function markReadyForDelivery(orderId: string) {
      if (!currentUser || currentUser.role !== "packing") return;
      const now = new Date().toISOString();

      setState((previous) => {
        const target = previous.orders.find((order) => order.id === orderId);
        if (!target || target.status !== "packing") return previous;
        if (!target.packingChecklist.every((item) => item.completed)) return previous;

        const duration = minutesBetween(target.packingStartTime, now);

        return pushEvent(
          {
            ...previous,
            orders: previous.orders.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    status: "ready",
                    packingCompletedTime: now,
                    packingDurationMinutes: duration,
                    updatedAt: now,
                  }
                : order,
            ),
          },
          {
            orderId,
            actorId: currentUser.id,
            actorName: currentUser.name,
            action: "packing_completed",
            detail: `${currentUser.name} marked ${target.orderNumber} Ready for Delivery`,
            emoji: "📦",
          },
        );
      });
    }

    function startDelivery(orderId: string) {
      if (!currentUser || currentUser.role !== "delivery") return;
      const now = new Date().toISOString();

      setState((previous) => {
        const target = previous.orders.find((order) => order.id === orderId);
        if (!target || target.status !== "ready") return previous;

        return pushEvent(
          {
            ...previous,
            orders: previous.orders.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    status: "out_for_delivery",
                    deliveryStartTime: now,
                    updatedAt: now,
                  }
                : order,
            ),
          },
          {
            orderId,
            actorId: currentUser.id,
            actorName: currentUser.name,
            action: "delivery_started",
            detail: `${currentUser.name} started delivery for ${target.orderNumber}`,
            emoji: "🚚",
          },
        );
      });
    }

    async function filesToDocuments(
      files: File[],
      kind: DocumentKind,
      meta: { orderId?: string; paymentId?: string },
    ): Promise<UploadedFile[]> {
      if (!currentUser) return [];
      const docs: UploadedFile[] = [];
      for (const file of files) {
        docs.push({
          id: createId("doc"),
          name: file.name,
          kind,
          dataUrl: await fileToDataUrl(file),
          uploadedAt: new Date().toISOString(),
          uploadedBy: currentUser.name,
          ...meta,
        });
      }
      return docs;
    }

    async function completeDelivered(orderId: string, files: File[], notes?: string) {
      if (!currentUser || currentUser.role !== "delivery") return;
      const now = new Date().toISOString();
      const docs = await filesToDocuments(files, "signed_bill", { orderId });

      setState((previous) => {
        const target = previous.orders.find((order) => order.id === orderId);
        if (!target || target.status !== "out_for_delivery") return previous;

        let next = pushEvent(
          {
            ...previous,
            orders: previous.orders.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    status: "delivered",
                    deliveryCompletedTime: now,
                    deliveryOutcomeNotes: notes,
                    documents: [...docs, ...order.documents],
                    updatedAt: now,
                  }
                : order,
            ),
          },
          {
            orderId,
            actorId: currentUser.id,
            actorName: currentUser.name,
            action: "delivered",
            detail: `${currentUser.name} delivered ${target.orderNumber}`,
            emoji: "🚚",
          },
        );

        if (docs.length) {
          next = pushEvent(next, {
            orderId,
            actorId: currentUser.id,
            actorName: currentUser.name,
            action: "bill_uploaded",
            detail: `Bill uploaded for ${target.orderNumber}`,
            emoji: "📄",
          });
        }

        return next;
      });
    }

    async function completePartialDelivery(
      orderId: string,
      lines: PartialDeliveryLine[],
      files: File[],
      notes?: string,
    ) {
      if (!currentUser || currentUser.role !== "delivery") return;
      const now = new Date().toISOString();
      const docs = await filesToDocuments(files, "return_photo", { orderId });

      setState((previous) => {
        const target = previous.orders.find((order) => order.id === orderId);
        if (!target || target.status !== "out_for_delivery") return previous;

        return pushEvent(
          {
            ...previous,
            orders: previous.orders.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    status: "partial_delivery",
                    deliveryCompletedTime: now,
                    deliveryOutcomeNotes: notes,
                    partialLines: lines,
                    documents: [...docs, ...order.documents],
                    updatedAt: now,
                  }
                : order,
            ),
          },
          {
            orderId,
            actorId: currentUser.id,
            actorName: currentUser.name,
            action: "partial_delivery",
            detail: `${currentUser.name} marked partial delivery for ${target.orderNumber}`,
            emoji: "🚚",
          },
        );
      });
    }

    async function completeFullReturn(orderId: string, reason: string, files: File[]) {
      if (!currentUser || currentUser.role !== "delivery") return;
      const now = new Date().toISOString();
      const docs = await filesToDocuments(files, "return_photo", { orderId });

      setState((previous) => {
        const target = previous.orders.find((order) => order.id === orderId);
        if (!target || target.status !== "out_for_delivery") return previous;

        return pushEvent(
          {
            ...previous,
            orders: previous.orders.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    status: "full_return",
                    deliveryCompletedTime: now,
                    returnReason: reason,
                    documents: [...docs, ...order.documents],
                    updatedAt: now,
                  }
                : order,
            ),
          },
          {
            orderId,
            actorId: currentUser.id,
            actorName: currentUser.name,
            action: "full_return",
            detail: `${currentUser.name} marked full return for ${target.orderNumber}`,
            emoji: "🚚",
          },
        );
      });
    }

    async function recordPayment(input: PaymentInput) {
      if (!currentUser) return;
      if (currentUser.role === "packing") return;

      const paymentId = createId("pay");
      const docs: UploadedFile[] = [];
      for (const file of input.files ?? []) {
        docs.push({
          id: createId("doc"),
          name: file.name,
          kind: file.kind,
          dataUrl: file.dataUrl,
          uploadedAt: new Date().toISOString(),
          uploadedBy: currentUser.name,
          paymentId,
          orderId: input.orderId,
        });
      }

      const payment = {
        id: paymentId,
        customerName: input.customerName.trim(),
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        amount: input.amount,
        mode: input.mode,
        orderId: input.orderId,
        notes: input.notes,
        documents: docs,
        collectedBy: currentUser.name,
        createdAt: new Date().toISOString(),
      };

      setState((previous) =>
        pushEvent(
          {
            ...previous,
            payments: [payment, ...previous.payments],
          },
          {
            paymentId,
            orderId: input.orderId,
            actorId: currentUser.id,
            actorName: currentUser.name,
            action: "payment_collected",
            detail: `Payment of ₹${input.amount.toLocaleString("en-IN")} collected from ${payment.customerName}`,
            emoji: "💰",
          },
        ),
      );
    }

    async function addOrderDocuments(orderId: string, files: File[], kind: DocumentKind) {
      if (!currentUser) return;
      const docs = await filesToDocuments(files, kind, { orderId });
      setState((previous) => ({
        ...previous,
        orders: previous.orders.map((order) =>
          order.id === orderId
            ? { ...order, documents: [...docs, ...order.documents], updatedAt: new Date().toISOString() }
            : order,
        ),
      }));
    }

    function searchAll(query: string) {
      const search = query.trim().toLowerCase();
      if (!search) return { customers: [], orders: [], payments: [] };

      const customers = state.customers.filter(
        (customer) =>
          customer.name.toLowerCase().includes(search) ||
          (customer.mobile ?? "").includes(search) ||
          (customer.gst ?? "").toLowerCase().includes(search),
      );

      const orders = state.orders.filter(
        (order) =>
          order.orderNumber.toLowerCase().includes(search) ||
          order.invoiceNumber.toLowerCase().includes(search) ||
          order.customerName.toLowerCase().includes(search) ||
          order.mobile.includes(search) ||
          order.contactPerson.toLowerCase().includes(search),
      );

      const payments = state.payments.filter(
        (payment) =>
          payment.customerName.toLowerCase().includes(search) ||
          payment.invoiceNumber.toLowerCase().includes(search),
      );

      return { customers, orders, payments };
    }

    return {
      ready,
      currentUser,
      state,
      login,
      logout,
      createCustomer,
      createOrder,
      updateOrderBeforePacking,
      acceptOrder,
      toggleChecklistItem,
      markReadyForDelivery,
      startDelivery,
      completeDelivered,
      completePartialDelivery,
      completeFullReturn,
      recordPayment,
      addOrderDocuments,
      searchAll,
    };
  }, [currentUser, ready, state]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
}
