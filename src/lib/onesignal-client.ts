"use client";

type OneSignalSdk = {
  init(options: { appId: string; allowLocalhostAsSecureOrigin?: boolean }): Promise<void>;
  login(externalId: string): Promise<void>;
  logout(): Promise<void>;
  Notifications: {
    permission: boolean;
    isPushSupported(): boolean;
    requestPermission(): Promise<void>;
  };
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: OneSignalSdk) => void | Promise<void>>;
    ntOneSignal?: OneSignalSdk;
    ntOneSignalInit?: Promise<OneSignalSdk>;
  }
}

const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const DEFAULT_INITIALIZATION_TIMEOUT_MS = 10_000;

export function oneSignalConfigured() {
  return Boolean(appId);
}

export function getOneSignal(
  timeoutMs = DEFAULT_INITIALIZATION_TIMEOUT_MS,
): Promise<OneSignalSdk> {
  if (!appId) return Promise.reject(new Error("OneSignal is not configured"));
  if (window.ntOneSignal) return Promise.resolve(window.ntOneSignal);
  if (window.ntOneSignalInit) return window.ntOneSignalInit;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  let timeoutId: number | undefined;
  const initialization = new Promise<OneSignalSdk>((resolve, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error("OneSignal initialization timed out")),
      timeoutMs,
    );
    window.OneSignalDeferred?.push(async (oneSignal) => {
      try {
        if (window.ntOneSignal) {
          resolve(window.ntOneSignal);
          return;
        }
        await oneSignal.init({
          appId,
          allowLocalhostAsSecureOrigin: process.env.NODE_ENV !== "production",
        });
        window.ntOneSignal = oneSignal;
        resolve(oneSignal);
      } catch (error) {
        reject(error);
      }
    });
  });
  const trackedInitialization = initialization.finally(() => {
    if (timeoutId) window.clearTimeout(timeoutId);
  });
  window.ntOneSignalInit = trackedInitialization;
  void trackedInitialization.catch(() => {
    if (window.ntOneSignalInit === trackedInitialization) window.ntOneSignalInit = undefined;
  });
  return trackedInitialization;
}

export function retryOneSignal() {
  window.ntOneSignalInit = undefined;
  return getOneSignal();
}

export async function logoutPushNotifications() {
  if (!appId || typeof window === "undefined") return;
  try {
    const oneSignal = await getOneSignal();
    await oneSignal.logout();
  } catch {
    // Signing out of the application must still succeed if push is unavailable.
  }
}
