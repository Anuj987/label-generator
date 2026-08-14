import type { AppState, Role } from "@/lib/types";
import { createInitialState } from "@/lib/demo-data";

const STORAGE_KEY = "nt-operations-console-v4";
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

export function getRoleCookie(): Role | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )nt_role=([^;]*)/);
  const value = match?.[1];
  if (value === "admin" || value === "packing" || value === "delivery") return value;
  return null;
}

export function setRoleCookie(role: Role | null) {
  if (typeof document === "undefined") return;
  if (!role) {
    document.cookie = `${ROLE_COOKIE}=; path=/; max-age=0`;
    return;
  }
  document.cookie = `${ROLE_COOKIE}=${role}; path=/; max-age=604800`;
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
