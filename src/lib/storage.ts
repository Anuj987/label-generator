import type { AppState, AuditEvent, Expense, Payment, Role } from "@/lib/types";
import { createInitialState } from "@/lib/demo-data";

const STORAGE_KEY = "nt-operations-console-v4";
const LIVE_AUDIT_KEY = "nt-live-audit-events-v1";
const LIVE_PAYMENTS_KEY = "nt-live-payments-v1";
const LIVE_EXPENSES_KEY = "nt-live-expenses-v1";
const ROLE_COOKIE = "nt_role";

function normalizeState(parsed: AppState): AppState {
  return {
    ...createInitialState(),
    ...parsed,
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    payments: Array.isArray(parsed.payments) ? parsed.payments : [],
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    auditEvents: Array.isArray(parsed.auditEvents) ? parsed.auditEvents : [],
    nextOrderSequence: parsed.nextOrderSequence || 1,
  };
}

export function loadState(): AppState {
  if (typeof window === "undefined") return createInitialState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    return normalizeState(JSON.parse(raw) as AppState);
  } catch {
    return createInitialState();
  }
}

export function saveState(state: AppState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadLiveAuditEvents(): AuditEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LIVE_AUDIT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLiveAuditEvents(events: AuditEvent[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIVE_AUDIT_KEY, JSON.stringify(events.slice(0, 500)));
}

export function appendLiveAuditEvent(event: AuditEvent) {
  const next = [event, ...loadLiveAuditEvents().filter((item) => item.id !== event.id)];
  saveLiveAuditEvents(next);
  return next;
}

export function mergeAuditEvents(...groups: AuditEvent[][]): AuditEvent[] {
  const byId = new Map<string, AuditEvent>();
  for (const group of groups) {
    for (const event of group) {
      byId.set(event.id, event);
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function loadLivePayments(): Payment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LIVE_PAYMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Payment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLivePayments(payments: Payment[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIVE_PAYMENTS_KEY, JSON.stringify(payments.slice(0, 300)));
}

export function appendLivePayment(payment: Payment) {
  try {
    const next = [payment, ...loadLivePayments().filter((item) => item.id !== payment.id)];
    saveLivePayments(next);
    return next;
  } catch {
    // Phone storage quota often fails with large photos — keep metadata only.
    const slim: Payment = { ...payment, documents: [] };
    const next = [slim, ...loadLivePayments().filter((item) => item.id !== payment.id)];
    try {
      saveLivePayments(next);
    } catch {
      // ignore
    }
    return next;
  }
}

export function mergePayments(...groups: Payment[][]): Payment[] {
  const byId = new Map<string, Payment>();
  for (const group of groups) {
    for (const payment of group) {
      const existing = byId.get(payment.id);
      if (!existing) {
        byId.set(payment.id, payment);
        continue;
      }
      byId.set(payment.id, {
        ...existing,
        ...payment,
        documents:
          (payment.documents?.length ?? 0) >= (existing.documents?.length ?? 0)
            ? payment.documents
            : existing.documents,
      });
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function loadLiveExpenses(): Expense[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LIVE_EXPENSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Expense[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLiveExpenses(expenses: Expense[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LIVE_EXPENSES_KEY, JSON.stringify(expenses.slice(0, 400)));
}

export function appendLiveExpense(expense: Expense) {
  try {
    const next = [expense, ...loadLiveExpenses().filter((item) => item.id !== expense.id)];
    saveLiveExpenses(next);
    return next;
  } catch {
    const slim: Expense = { ...expense, receiptPreviewUrl: undefined };
    const next = [slim, ...loadLiveExpenses().filter((item) => item.id !== slim.id)];
    try {
      saveLiveExpenses(next);
    } catch {
      // ignore
    }
    return next;
  }
}

export function mergeExpenses(...groups: Expense[][]): Expense[] {
  const byId = new Map<string, Expense>();
  for (const group of groups) {
    for (const expense of group) {
      const existing = byId.get(expense.id);
      if (!existing) {
        byId.set(expense.id, expense);
        continue;
      }
      byId.set(expense.id, {
        ...existing,
        ...expense,
        receiptPreviewUrl: expense.receiptPreviewUrl || existing.receiptPreviewUrl,
        receiptPath: expense.receiptPath || existing.receiptPath,
      });
    }
  }
  return [...byId.values()].sort((a, b) => {
    const dateCmp = b.expenseDate.localeCompare(a.expenseDate);
    if (dateCmp !== 0) return dateCmp;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function getRoleCookie(): Role | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )nt_role=([^;]*)/);
  const fromCookie = match?.[1];
  if (fromCookie === "admin" || fromCookie === "packing" || fromCookie === "delivery") {
    return fromCookie;
  }
  try {
    const fromStorage = window.localStorage.getItem(ROLE_COOKIE);
    if (fromStorage === "admin" || fromStorage === "packing" || fromStorage === "delivery") {
      return fromStorage;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function setRoleCookie(role: Role | null) {
  if (typeof document === "undefined") return;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  if (!role) {
    document.cookie = `${ROLE_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
    try {
      window.localStorage.removeItem(ROLE_COOKIE);
    } catch {
      // ignore storage errors
    }
    return;
  }
  document.cookie = `${ROLE_COOKIE}=${role}; path=/; max-age=604800; SameSite=Lax${secure}`;
  try {
    window.localStorage.setItem(ROLE_COOKIE, role);
  } catch {
    // ignore storage errors
  }
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

export function minutesBetween(start?: string, end?: string) {
  if (!start || !end) return undefined;
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

export function isSameDay(iso: string, day = new Date()) {
  const value = new Date(iso);
  return (
    value.getFullYear() === day.getFullYear() &&
    value.getMonth() === day.getMonth() &&
    value.getDate() === day.getDate()
  );
}

export async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/** Compress phone camera photos so payment save works on mobile. */
export async function fileToCompressedDataUrl(
  file: File,
  options?: { maxEdge?: number; quality?: number },
) {
  const maxEdge = options?.maxEdge ?? 1280;
  const quality = options?.quality ?? 0.72;

  if (!file.type.startsWith("image/")) {
    return fileToDataUrl(file);
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return fileToDataUrl(file);
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return fileToDataUrl(file);
  }
}

export function errorMessage(err: unknown, fallback = "Something went wrong") {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = String((err as { message?: unknown }).message ?? "");
    if (message.trim()) return message;
  }
  return fallback;
}
