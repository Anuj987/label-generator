/**
 * Client-side OneSignal Web Push helpers.
 * App ID is public; REST API key must NEVER live here.
 */
import OneSignal from "react-onesignal";

const APP_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID?.trim() ||
  "47bfa90f-67bb-4210-a7ad-41ffcddee9a6";

let initPromise: Promise<boolean> | null = null;

function canUseOneSignal() {
  return typeof window !== "undefined" && Boolean(APP_ID);
}

export function getOneSignalAppId() {
  return APP_ID;
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
export async function loginOneSignalExternalId(userId: string) {
  if (!userId) return;
  const ready = await initOneSignal();
  if (!ready) return;

  try {
    await OneSignal.login(userId);
  } catch (error) {
    console.warn("OneSignal login failed:", error);
  }

  try {
    // Native browser permission prompt (no custom UI chrome).
    await OneSignal.Notifications.requestPermission();
  } catch (error) {
    console.warn("OneSignal permission request skipped:", error);
  }
}

export async function logoutOneSignal() {
  const ready = await initOneSignal();
  if (!ready) return;
  try {
    await OneSignal.logout();
  } catch (error) {
    console.warn("OneSignal logout skipped:", error);
  }
}
