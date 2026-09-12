"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createId, generatePackingChecklist } from "@/lib/demo-data";
import { clearLegacyRoleState, fileToDataUrl, minutesBetween } from "@/lib/storage";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { logoutPushNotifications } from "@/lib/onesignal-client";
import {
  createLiveCustomer,
  createLiveExpense,
  createLiveOrder,
  createLivePayment,
  getLiveExpenseReceiptUrl,
  loadAuthenticatedProfile,
  loadLiveState,
  persistChecklistCompletion,
  subscribeLiveChanges,
  updateLiveOrderBeforePacking,
  updateLiveOrderItemsQuantities,
  updateLiveOrderStatus,
} from "@/lib/supabase-data";
import type {
  AppState,
  CreateOrderInput,
  CustomerInput,
  DocumentKind,
  ExpenseInput,
  Order,
  PartialDeliveryLine,
  PaymentInput,
  UploadedFile,
  UserProfile,
} from "@/lib/types";

type AppContextValue = {
  ready: boolean;
  liveMode: boolean;
  currentUser: UserProfile | null;
  state: AppState;
  login: (identifier: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshLive: () => Promise<void>;
  createCustomer: (input: CustomerInput) => Promise<void>;
  createOrder: (input: CreateOrderInput) => Promise<Order>;
  updateOrderBeforePacking: (orderId: string, input: CreateOrderInput) => Promise<void>;
  acceptOrder: (orderId: string) => Promise<void>;
  toggleChecklistItem: (orderId: string, itemId: string) => void;
  markReadyForDelivery: (orderId: string) => Promise<void>;
  startDelivery: (orderId: string) => Promise<void>;
  completeDelivered: (orderId: string, files: File[], notes?: string) => Promise<void>;
  completePartialDelivery: (
    orderId: string,
    lines: PartialDeliveryLine[],
    files: File[],
    notes?: string,
  ) => Promise<void>;
  completeFullReturn: (orderId: string, reason: string, files: File[]) => Promise<void>;
  recordPayment: (input: PaymentInput) => Promise<void>;
  addExpense: (input: ExpenseInput) => Promise<void>;
  getExpenseReceiptUrl: (path: string) => Promise<string>;
  addOrderDocuments: (orderId: string, files: File[], kind: DocumentKind) => Promise<void>;
  searchAll: (query: string) => {
    customers: AppState["customers"];
    orders: AppState["orders"];
    payments: AppState["payments"];
  };
};

const AppContext = createContext<AppContextValue | null>(null);

const EMPTY_STATE: AppState = {
  customers: [],
  orders: [],
  payments: [],
  expenses: [],
  auditEvents: [],
  nextOrderSequence: 1,
};

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
  const liveMode = supabaseConfigured;
  const [ready, setReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef(false);

  const refreshLive = useCallback(async () => {
    if (!liveMode || !currentUser) return;
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      await refreshInFlightRef.current;
      return;
    }

    do {
      refreshQueuedRef.current = false;
      const request = loadLiveState(currentUser.role).then((live) => setState(live));
      refreshInFlightRef.current = request;
      try {
        await request;
      } finally {
        refreshInFlightRef.current = null;
      }
    } while (refreshQueuedRef.current);
  }, [currentUser, liveMode]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        clearLegacyRoleState();
        if (!supabase) return;
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) return;

        const profile = await loadAuthenticatedProfile(data.user.id);
        if (!profile) return;
        const live = await loadLiveState(profile.role);
        if (cancelled) return;
        setCurrentUser(profile);
        setState(live);
      } catch (error) {
        console.error("Failed to initialize authenticated application session", error);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [liveMode]);

  useEffect(() => {
    if (!liveMode || !ready) return;
    let refreshTimer: number | undefined;
    const unsubscribe = subscribeLiveChanges(() => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refreshLive(), 150);
    });
    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [liveMode, ready, refreshLive]);

  const value = useMemo<AppContextValue>(() => {
    async function login(identifier: string, password: string) {
      if (!supabase) throw new Error("Supabase authentication is not configured");
      const { data, error } = await supabase.auth.signInWithPassword({
        email: identifier.trim(),
        password,
      });
      if (error || !data.user) throw new Error("Invalid email or password");

      const profile = await loadAuthenticatedProfile(data.user.id);
      if (!profile) {
        await supabase.auth.signOut();
        setCurrentUser(null);
        setState(EMPTY_STATE);
        throw new Error("This account is not authorized for the Operations Console");
      }

      const live = await loadLiveState(profile.role);
      setCurrentUser(profile);
      setState(live);
      return profile;
    }

    async function logout() {
      clearLegacyRoleState();
      await logoutPushNotifications();
      if (supabase) await supabase.auth.signOut();
      setCurrentUser(null);
      setState(EMPTY_STATE);
    }

    async function createCustomer(input: CustomerInput) {
      if (!currentUser || currentUser.role !== "admin") return;
      if (liveMode) {
        await createLiveCustomer(input);
        await refreshLive();
        return;
      }
      const name = input.name.trim();
      if (!name) return;
      const exists = state.customers.some(
        (customer) => customer.name.toLowerCase() === name.toLowerCase(),
      );
      if (exists) return;
      setState((previous) => ({
        ...previous,
        customers: [
          {
            id: createId("cust"),
            name,
            mobile: input.mobile?.trim() || undefined,
            gst: input.gst?.trim() || undefined,
            notes: input.notes?.trim() || undefined,
            createdAt: new Date().toISOString(),
          },
          ...previous.customers,
        ],
      }));
    }

    async function createOrder(input: CreateOrderInput) {
      if (!currentUser || currentUser.role !== "admin") {
        throw new Error("Only admin can create orders");
      }

      if (liveMode) {
        const order = await createLiveOrder(input, currentUser, state.orders);
        try {
          const notificationResponse = await fetch("/api/notifications/new-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: order.id }),
          });
          if (!notificationResponse.ok) {
            const notificationError = (await notificationResponse.json().catch(() => null)) as
              | { error?: unknown }
              | null;
            console.error("New-order push notification could not be sent", {
              status: notificationResponse.status,
              error:
                typeof notificationError?.error === "string"
                  ? notificationError.error
                  : "Notification request failed",
            });
          }
        } catch (error) {
          console.error("New-order push notification request failed", {
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
        }
        await refreshLive();
        return order;
      }

      const products = input.products.map((product) => ({
        id: createId("prod"),
        ...product,
      }));
      const orderNumber = `NT-${String(state.nextOrderSequence).padStart(5, "0")}`;
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

    async function updateOrderBeforePacking(orderId: string, input: CreateOrderInput) {
      if (!currentUser || currentUser.role !== "admin") return;
      if (liveMode) {
        await updateLiveOrderBeforePacking(orderId, input);
        await refreshLive();
        return;
      }

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
                  updatedAt: new Date().toISOString(),
                }
              : order,
          ),
        };
      });
    }

    async function acceptOrder(orderId: string) {
      if (!currentUser || currentUser.role !== "packing") return;
      const now = new Date().toISOString();
      if (liveMode) {
        await updateLiveOrderStatus(orderId, "packing", { packing_started_at: now });
        await refreshLive();
        return;
      }
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
          const nextChecklist = order.packingChecklist.map((item) => {
            if (item.id !== itemId) return item;
            const completed = !item.completed;
            persistChecklistCompletion(orderId, item.id, completed);
            if (item.productId) {
              persistChecklistCompletion(orderId, `product:${item.productId}`, completed);
            }
            return { ...item, completed };
          });
          return {
            ...order,
            packingChecklist: nextChecklist,
            updatedAt: new Date().toISOString(),
          };
        }),
      }));
    }

    async function markReadyForDelivery(orderId: string) {
      if (!currentUser || currentUser.role !== "packing") return;
      const now = new Date().toISOString();
      const target = state.orders.find((order) => order.id === orderId);
      if (!target || target.status !== "packing") return;
      if (!target.packingChecklist.every((item) => item.completed)) return;

      if (liveMode) {
        await updateLiveOrderStatus(orderId, "ready", { packing_completed_at: now });
        await refreshLive();
        return;
      }

      const duration = minutesBetween(target.packingStartTime, now);
      setState((previous) =>
        pushEvent(
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
        ),
      );
    }

    async function startDelivery(orderId: string) {
      if (!currentUser || currentUser.role !== "delivery") return;
      const now = new Date().toISOString();
      if (liveMode) {
        await updateLiveOrderStatus(orderId, "out_for_delivery", { delivery_started_at: now });
        await refreshLive();
        return;
      }
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

      if (liveMode) {
        await updateLiveOrderStatus(orderId, "delivered", {
          delivery_completed_at: now,
          delivery_instructions: notes || null,
        });
        await refreshLive();
        return;
      }

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

      if (liveMode) {
        await updateLiveOrderItemsQuantities(lines);
        await updateLiveOrderStatus(orderId, "partial_delivery", {
          delivery_completed_at: now,
          delivery_instructions: notes || null,
        });
        await refreshLive();
        return;
      }

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

      if (liveMode) {
        await updateLiveOrderStatus(orderId, "full_return", {
          delivery_completed_at: now,
          return_reason: reason,
        });
        await refreshLive();
        return;
      }

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

      if (liveMode) {
        await createLivePayment(input, currentUser);
        await refreshLive();
        return;
      }

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

    async function addExpense(input: ExpenseInput) {
      if (!currentUser) return;
      if (currentUser.role !== "admin" && currentUser.role !== "delivery") return;
      if (!liveMode) throw new Error("Expenses require Supabase");

      await createLiveExpense(input, currentUser);
      await refreshLive();
    }

    async function getExpenseReceiptUrl(path: string) {
      if (!currentUser) throw new Error("Authentication required");
      if (currentUser.role !== "admin" && currentUser.role !== "delivery") {
        throw new Error("Receipt access is restricted");
      }
      return getLiveExpenseReceiptUrl(path);
    }

    async function addOrderDocuments(orderId: string, files: File[], kind: DocumentKind) {
      if (!currentUser) return;
      const docs = await filesToDocuments(files, kind, { orderId });
      setState((previous) => ({
        ...previous,
        orders: previous.orders.map((order) =>
          order.id === orderId
            ? {
                ...order,
                documents: [...docs, ...order.documents],
                updatedAt: new Date().toISOString(),
              }
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
      liveMode,
      currentUser,
      state,
      login,
      logout,
      refreshLive,
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
      addExpense,
      getExpenseReceiptUrl,
      addOrderDocuments,
      searchAll,
    };
  }, [currentUser, liveMode, ready, refreshLive, state]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
}
