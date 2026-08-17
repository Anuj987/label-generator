/**
 * Client-side OneSignal Web Push helpers.
 * App ID is public; REST API key must NEVER live here.
 */
import OneSignal from "react-onesignal";

const APP_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID?.trim() ||
  "47bfa90f-67bb-4210-a7ad-41ffcddee9a6";

let initPromise: Promise<boolean> | null = null;
let linkedExternalId: string | null = null;

function canUseOneSignal() {
  return typeof window !== "undefined" && Boolean(APP_ID);
}

export function getOneSignalAppId() {
  return APP_ID;
}

export function isIosSafariLike() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iOS;
}

/** True when launched from home screen / installed PWA (required for iOS web push). */
export function isRunningAsInstalledWebApp() {
  if (typeof window === "undefined") return false;
  const standalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  if (standalone) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

export async function getOneSignalPermission(): Promise<"granted" | "denied" | "default" | "unknown"> {
  if (typeof window === "undefined") return "unknown";
  try {
    if (!("Notification" in window)) return "denied";
    const native = Notification.permission;
    if (native === "granted" || native === "denied" || native === "default") return native;
  } catch {
    // fall through
  }
  return "unknown";
}

export async function initOneSignal(): Promise<boolean> {
  if (!canUseOneSignal()) return false;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const isLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

      await OneSignal.init({
        appId: APP_ID,
        allowLocalhostAsSecureOrigin: isLocal,
        serviceWorkerPath: "OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/" },
      });
      return true;
    } catch (error) {
      console.warn("OneSignal init skipped:", error);
      return false;
    }
  })();

  return initPromise;
}

/** Bind this browser/device to public.users.id (External ID). */
export async function loginOneSignalExternalId(
  userId: string,
  options?: { requestPermission?: boolean },
) {
  if (!userId) return;
  const ready = await initOneSignal();
  if (!ready) return;

  try {
    await OneSignal.login(userId);
    linkedExternalId = userId;
  } catch (error) {
    console.warn("OneSignal login failed:", error);
  }

  const shouldPrompt = options?.requestPermission !== false;
  // iOS only allows the permission prompt after a user gesture from the installed web app.
  if (shouldPrompt && !isIosSafariLike()) {
    try {
      await OneSignal.Notifications.requestPermission();
    } catch (error) {
      console.warn("OneSignal permission request skipped:", error);
    }
  }
}

/** Call from a button tap so iOS/Android can show the native permission prompt. */
export async function enableOneSignalNotifications(): Promise<"granted" | "denied" | "default" | "unknown"> {
  const ready = await initOneSignal();
  if (!ready) return "unknown";

  if (linkedExternalId) {
    try {
      await OneSignal.login(linkedExternalId);
    } catch {
      // ignore
    }
  }

  try {
    await OneSignal.Notifications.requestPermission();
  } catch (error) {
    console.warn("OneSignal enable failed:", error);
  }

  return getOneSignalPermission();
}

export async function logoutOneSignal() {
  const ready = await initOneSignal();
  if (!ready) return;
  linkedExternalId = null;
  try {
    await OneSignal.logout();
  } catch (error) {
    console.warn("OneSignal logout skipped:", error);
  }
}
