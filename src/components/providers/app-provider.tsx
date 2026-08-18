"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import {
  getSessionStaffProfile,
  signInWithEmailPassword,
  signOutStaff,
} from "@/lib/supabase-auth";
import {
  createLiveCustomer,
  createLiveExpense,
  createLiveOrder,
  createLivePayment,
  deleteLiveOrder,
  loadLiveExpensesFromDb,
  loadLiveState,
  persistChecklistCompletion,
  recordLiveAuditLog,
  subscribeLiveChanges,
  updateLiveOrderBeforePacking,
  updateLiveOrderItemsQuantities,
  updateLiveOrderStatus,
  uploadLiveDeliveryDocuments,
} from "@/lib/supabase-data";
import {
  appendLiveAuditEvent,
  appendLiveExpense,
  appendLivePayment,
  fileToDataUrl,
  loadLiveAuditEvents,
  loadLiveExpenses,
  loadLivePayments,
  loadState,
  mergeAuditEvents,
  mergeExpenses,
  mergePayments,
  minutesBetween,
  saveLiveAuditEvents,
  saveLiveExpenses,
  saveLivePayments,
  saveState,
  setRoleCookie,
} from "@/lib/storage";
import { fetchOpsSync, publishOpsSync } from "@/lib/ops-sync";
import { requestNewOrderNotification } from "@/lib/notify-new-order";
import { createId, generatePackingChecklist } from "@/lib/demo-data";
import type {
  AppState,
  AuditEvent,
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
  loginWithPassword: (email: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshLive: () => Promise<void>;
  createCustomer: (input: CustomerInput) => Promise<void>;
  createOrder: (input: CreateOrderInput) => Promise<Order>;
  updateOrderBeforePacking: (orderId: string, input: CreateOrderInput) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;
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
  createExpense: (input: ExpenseInput) => Promise<void>;
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
  const liveMode = supabaseConfigured;
  const [ready, setReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [state, setState] = useState<AppState>(() => loadState());

  const refreshLive = useCallback(async () => {
    if (!liveMode) return;
    const [live, sync, remoteExpenses] = await Promise.all([
      loadLiveState(),
      fetchOpsSync(),
      loadLiveExpensesFromDb(),
    ]);
    // Keep local caches aligned with shared sync so phones see the same payments/activity.
    if (sync.sync) {
      saveLivePayments(mergePayments(sync.payments, loadLivePayments()));
      saveLiveAuditEvents(mergeAuditEvents(sync.events, loadLiveAuditEvents()));
    }
    const expenses = mergeExpenses(remoteExpenses, loadLiveExpenses());
    // Prefer remote when the DB table is live; still keep local drafts until migration runs.
    if (remoteExpenses.length) {
      saveLiveExpenses(mergeExpenses(remoteExpenses, loadLiveExpenses()));
    }
    setState((previous) => ({
      ...live,
      auditEvents: mergeAuditEvents(
        previous.auditEvents,
        live.auditEvents,
        sync.events,
        loadLiveAuditEvents(),
      ),
      payments: mergePayments(previous.payments, live.payments, sync.payments, loadLivePayments()),
      expenses: mergeExpenses(previous.expenses, expenses),
    }));
  }, [liveMode]);

  function rememberLiveEvent(event: AuditEvent) {
    appendLiveAuditEvent(event);
    void publishOpsSync({ event });
    setState((previous) => ({
      ...previous,
      auditEvents: mergeAuditEvents([event], previous.auditEvents),
    }));
  }

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    async function boot() {
      // Clear legacy passwordless role cookie so live mode cannot bypass Auth.
      if (liveMode) setRoleCookie(null);

      try {
        if (liveMode) {
          const profile = await getSessionStaffProfile();
          if (!cancelled) setCurrentUser(profile);
          const [live, sync, remoteExpenses] = await Promise.all([
            loadLiveState(),
            fetchOpsSync(),
            loadLiveExpensesFromDb(),
          ]);
          if (sync.sync) {
            const localPayments = loadLivePayments();
            const localEvents = loadLiveAuditEvents();
            // Upload any device-local payments/events so other phones can see them.
            if (localPayments.length || localEvents.length) {
              await publishOpsSync({ payments: localPayments, events: localEvents });
            }
            saveLivePayments(mergePayments(sync.payments, localPayments));
            saveLiveAuditEvents(mergeAuditEvents(sync.events, localEvents));
          }
          const expenses = mergeExpenses(remoteExpenses, loadLiveExpenses());
          if (remoteExpenses.length) {
            saveLiveExpenses(expenses);
          }
          if (!cancelled) {
            setState({
              ...live,
              payments: mergePayments(live.payments, sync.payments, loadLivePayments()),
              expenses,
              auditEvents: mergeAuditEvents(live.auditEvents, sync.events, loadLiveAuditEvents()),
            });
          }

          if (supabase) {
            const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
              if (cancelled) return;
              if (event === "SIGNED_OUT" || !session?.user) {
                setCurrentUser(null);
                return;
              }
              if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
                const next = await getSessionStaffProfile();
                if (!cancelled) setCurrentUser(next);
              }
            });
            unsubscribe = () => data.subscription.unsubscribe();
          }
        } else {
          // Demo mode only: no passwordless cookie login when Supabase is configured.
          if (!cancelled) setCurrentUser(null);
          if (!cancelled) setState(loadState());
        }
      } catch (error) {
        console.error("Failed to boot app session", error);
        if (!cancelled) {
          setCurrentUser(null);
          setState(loadState());
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void boot();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [liveMode]);

  useEffect(() => {
    if (!ready || liveMode) return;
    saveState(state);
  }, [ready, state, liveMode]);

  useEffect(() => {
    if (!liveMode || !ready) return;
    return subscribeLiveChanges(() => {
      void refreshLive();
    });
  }, [liveMode, ready, refreshLive]);

  const value = useMemo<AppContextValue>(() => {
    async function loginWithPassword(email: string, password: string) {
      if (!liveMode) {
        throw new Error("Password login requires Supabase Auth.");
      }
      const profile = await signInWithEmailPassword(email, password);
      setRoleCookie(null);
      setCurrentUser(profile);
      await refreshLive();
      return profile;
    }

    async function logout() {
      if (liveMode) await signOutStaff();
      setRoleCookie(null);
      setCurrentUser(null);
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
        const event: AuditEvent = {
          id: createId("evt"),
          orderId: order.id,
          actorId: currentUser.id,
          actorName: currentUser.name,
          action: "order_created",
          detail: `Order ${order.orderNumber} created by ${currentUser.name} for ${order.customerName}`,
          emoji: "🟢",
          createdAt: new Date().toISOString(),
        };
        rememberLiveEvent(event);
        void recordLiveAuditLog({
          orderId: order.id,
          userId: currentUser.id,
          action: "order_created",
          description: event.detail,
        });
        // Push only after a successful brand-new order INSERT (never on edits/status).
        void requestNewOrderNotification({
          orderId: order.id,
          orderNumber: order.orderNumber,
        });
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
        invoiceNumber: input.invoiceNumber?.trim() || "",
        invoiceDate: input.invoiceDate,
        deliveryDate: input.deliveryDate,
        customerName: input.customerName.trim(),
        contactPerson: input.contactPerson?.trim() || "",
        mobile: input.mobile?.trim() || "",
        address: input.address?.trim() || "",
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
      const existing = state.orders.find((order) => order.id === orderId);
      if (!existing || existing.status !== "new") return;

      const productCount = input.products.filter((product) => product.productName.trim()).length;
      const detail = `${currentUser.name} edited ${existing.orderNumber} · ${input.customerName.trim()} · ${productCount} product${productCount === 1 ? "" : "s"}`;

      if (liveMode) {
        await updateLiveOrderBeforePacking(orderId, input);
        const event: AuditEvent = {
          id: createId("evt"),
          orderId,
          actorId: currentUser.id,
          actorName: currentUser.name,
          action: "order_edited",
          detail,
          emoji: "✏️",
          createdAt: new Date().toISOString(),
        };
        rememberLiveEvent(event);
        void recordLiveAuditLog({
          orderId,
          userId: currentUser.id,
          action: "order_edited",
          description: detail,
        });
        await refreshLive();
        return;
      }

      setState((previous) => {
        const target = previous.orders.find((order) => order.id === orderId);
        if (!target || target.status !== "new") return previous;
        const products = input.products.map((product) => ({
          id: createId("prod"),
          ...product,
        }));
        return pushEvent(
          {
            ...previous,
            orders: previous.orders.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    invoiceNumber: input.invoiceNumber?.trim() || "",
                    invoiceDate: input.invoiceDate,
                    deliveryDate: input.deliveryDate,
                    customerName: input.customerName.trim(),
                    contactPerson: input.contactPerson?.trim() || "",
                    mobile: input.mobile?.trim() || "",
                    address: input.address?.trim() || "",
                    gst: input.gst?.trim() || undefined,
                    priority: input.priority,
                    notes: input.notes,
                    products,
                    packingChecklist: generatePackingChecklist(products),
                    updatedAt: new Date().toISOString(),
                  }
                : order,
            ),
          },
          {
            orderId,
            actorId: currentUser.id,
            actorName: currentUser.name,
            action: "order_edited",
            detail,
            emoji: "✏️",
          },
        );
      });
    }

    async function deleteOrder(orderId: string) {
      if (!currentUser || currentUser.role !== "admin") {
        throw new Error("Only admin can delete orders");
      }
      const existing = state.orders.find((order) => order.id === orderId);
      if (!existing) throw new Error("Order not found");

      if (liveMode) {
        await deleteLiveOrder(orderId);
        const event: AuditEvent = {
          id: createId("evt"),
          orderId,
          actorId: currentUser.id,
          actorName: currentUser.name,
          action: "order_deleted",
          detail: `${currentUser.name} deleted ${existing.orderNumber} · ${existing.customerName}`,
          emoji: "🗑️",
          createdAt: new Date().toISOString(),
        };
        rememberLiveEvent(event);
        void recordLiveAuditLog({
          orderId,
          userId: currentUser.id,
          action: "order_deleted",
          description: event.detail,
        });
        setState((previous) => ({
          ...previous,
          orders: previous.orders.filter((order) => order.id !== orderId),
          auditEvents: mergeAuditEvents([event], previous.auditEvents),
        }));
        try {
          await refreshLive();
        } catch {
          // ignore refresh failures after delete
        }
        return;
      }

      setState((previous) =>
        pushEvent(
          {
            ...previous,
            orders: previous.orders.filter((order) => order.id !== orderId),
          },
          {
            orderId,
            actorId: currentUser.id,
            actorName: currentUser.name,
            action: "order_deleted",
            detail: `${currentUser.name} deleted ${existing.orderNumber} · ${existing.customerName}`,
            emoji: "🗑️",
          },
        ),
      );
    }

    async function acceptOrder(orderId: string) {
      if (!currentUser || currentUser.role !== "packing") return;
      const existing = state.orders.find((order) => order.id === orderId);
      if (!existing || existing.status !== "new") return;
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
      const existing = state.orders.find((order) => order.id === orderId);
      if (!existing || existing.status !== "ready") return;
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
        if (docs.length) {
          await uploadLiveDeliveryDocuments(
            orderId,
            docs.map((doc) => ({
              name: doc.name,
              dataUrl: doc.dataUrl,
              mimeType: doc.dataUrl.startsWith("data:")
                ? doc.dataUrl.slice(5, doc.dataUrl.indexOf(";"))
                : "image/jpeg",
            })),
            currentUser.id,
          );
        }
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
        if (docs.length) {
          await uploadLiveDeliveryDocuments(
            orderId,
            docs.map((doc) => ({
              name: doc.name,
              dataUrl: doc.dataUrl,
              mimeType: doc.dataUrl.startsWith("data:")
                ? doc.dataUrl.slice(5, doc.dataUrl.indexOf(";"))
                : "image/jpeg",
            })),
            currentUser.id,
          );
        }
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
        if (docs.length) {
          await uploadLiveDeliveryDocuments(
            orderId,
            docs.map((doc) => ({
              name: doc.name,
              dataUrl: doc.dataUrl,
              mimeType: doc.dataUrl.startsWith("data:")
                ? doc.dataUrl.slice(5, doc.dataUrl.indexOf(";"))
                : "image/jpeg",
            })),
            currentUser.id,
          );
        }
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
        const payment = await createLivePayment(input, currentUser);
        try {
          appendLivePayment(payment);
        } catch {
          // ignore phone storage quota errors
        }
        const event: AuditEvent = {
          id: createId("evt"),
          paymentId: payment.id,
          orderId: input.orderId,
          actorId: currentUser.id,
          actorName: currentUser.name,
          action: "payment_collected",
          detail: `Payment of ₹${input.amount.toLocaleString("en-IN")} collected from ${payment.customerName}`,
          emoji: "💰",
          createdAt: new Date().toISOString(),
        };
        try {
          rememberLiveEvent(event);
        } catch {
          // ignore
        }
        void recordLiveAuditLog({
          orderId: input.orderId,
          userId: currentUser.id,
          action: "payment_collected",
          description: event.detail,
        });
        void publishOpsSync({ payment, event });
        try {
          await refreshLive();
        } catch {
          // Payment already saved — don't fail the UI if refresh fails on poor mobile network.
        }
        setState((previous) => ({
          ...previous,
          payments: mergePayments([payment], previous.payments),
          auditEvents: mergeAuditEvents([event], previous.auditEvents),
        }));
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

    async function createExpense(input: ExpenseInput) {
      if (!currentUser) return;
      if (!input.amount || input.amount <= 0) {
        throw new Error("Amount is required");
      }
      if (!input.expenseDate) {
        throw new Error("Date is required");
      }
      if (!input.category) {
        throw new Error("Category is required");
      }

      if (liveMode) {
        try {
          const expense = await createLiveExpense(input, currentUser);
          try {
            appendLiveExpense(expense);
          } catch {
            // ignore quota
          }
          setState((previous) => ({
            ...previous,
            expenses: mergeExpenses([expense], previous.expenses),
          }));
          try {
            await refreshLive();
          } catch {
            // ignore refresh failures
          }
          return;
        } catch (error) {
          // Until the expenses migration is applied, keep a local draft so the UI works.
          const message = error instanceof Error ? error.message : String(error);
          const tableMissing =
            /could not find the table|schema cache|relation .*expenses/i.test(message) ||
            /expense-receipts/i.test(message);
          if (!tableMissing) throw error;
        }
      }

      const expense = {
        id: createId("exp"),
        amount: input.amount,
        expenseDate: input.expenseDate,
        category: input.category,
        description: input.description?.trim() || undefined,
        submittedBy: currentUser.id,
        submittedByName: currentUser.name,
        receiptFileName: input.receipt?.name,
        receiptPreviewUrl: input.receipt?.dataUrl,
        createdAt: new Date().toISOString(),
      };
      if (liveMode) {
        try {
          appendLiveExpense(expense);
        } catch {
          // ignore
        }
      }
      setState((previous) => ({
        ...previous,
        expenses: mergeExpenses([expense], previous.expenses),
      }));
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
      loginWithPassword,
      logout,
      refreshLive,
      createCustomer,
      createOrder,
      updateOrderBeforePacking,
      deleteOrder,
      acceptOrder,
      toggleChecklistItem,
      markReadyForDelivery,
      startDelivery,
      completeDelivered,
      completePartialDelivery,
      completeFullReturn,
      recordPayment,
      createExpense,
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
