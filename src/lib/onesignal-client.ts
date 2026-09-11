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

export function oneSignalConfigured() {
  return Boolean(appId);
}

export function getOneSignal(): Promise<OneSignalSdk> {
  if (!appId) return Promise.reject(new Error("OneSignal is not configured"));
  if (window.ntOneSignalInit) return window.ntOneSignalInit;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.ntOneSignalInit = new Promise((resolve, reject) => {
    window.OneSignalDeferred?.push(async (oneSignal) => {
      try {
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
  return window.ntOneSignalInit;
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
