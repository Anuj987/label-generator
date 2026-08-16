import type { AppState, AuditEvent, Role } from "@/lib/types";
import { createInitialState } from "@/lib/demo-data";

const STORAGE_KEY = "nt-operations-console-v4";
const LIVE_AUDIT_KEY = "nt-live-audit-events-v1";
const ROLE_COOKIE = "nt_role";

export function loadState(): AppState {
  if (typeof window === "undefined") return createInitialState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    return JSON.parse(raw) as AppState;
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
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
