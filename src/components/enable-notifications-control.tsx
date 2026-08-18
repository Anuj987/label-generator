"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useAppContext } from "@/components/providers/app-provider";
import { Button } from "@/components/ui";
import {
  enableOneSignalNotifications,
  getOneSignalPermission,
  isIosSafariLike,
  isRunningAsInstalledWebApp,
  loginOneSignalExternalId,
} from "@/lib/onesignal-client";

/**
 * Small header control so phones (especially iOS) can enable push with a user tap.
 * Does not redesign the console — only appears when notifications are not granted.
 */
export function EnableNotificationsControl() {
  const { currentUser } = useAppContext();
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied" | "default">(
    "unknown",
  );
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    void getOneSignalPermission().then(setPermission);
  }, []);

  if (!currentUser || permission === "granted" || permission === "unknown") return null;

  async function onEnable() {
    setBusy(true);
    setHint(null);
    try {
      if (isIosSafariLike() && !isRunningAsInstalledWebApp()) {
        setHint(
          "On iPhone: Share → Add to Home Screen, open NT Console from the home icon, then tap Enable alerts again.",
        );
        setBusy(false);
        return;
      }
      if (currentUser?.id) {
        await loginOneSignalExternalId(currentUser.id, { requestPermission: false });
      }
      const next = await enableOneSignalNotifications();
      setPermission(next);
      if (next !== "granted") {
        setHint(
          next === "denied"
            ? "Notifications are blocked in browser settings. Allow them for this site, then try again."
            : "Notification permission was not granted.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-[11rem] flex-col items-end gap-1 sm:max-w-xs">
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void onEnable()}>
        <Bell className="mr-2 h-4 w-4" />
        {busy ? "…" : "Enable alerts"}
      </Button>
      {hint ? <p className="text-[10px] leading-snug text-amber-700 sm:text-xs">{hint}</p> : null}
    </div>
  );
}
