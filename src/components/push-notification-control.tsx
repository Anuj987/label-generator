"use client";

import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import { Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import {
  getOneSignal,
  oneSignalConfigured,
  retryOneSignal,
} from "@/lib/onesignal-client";

type NotificationState = "initializing" | "available" | "enabled" | "unsupported" | "error";

export function PushNotificationControl() {
  const { currentUser } = useAppContext();
  const [notificationState, setNotificationState] =
    useState<NotificationState>("initializing");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!currentUser || !supabase || !oneSignalConfigured()) return;
    let cancelled = false;

    void (async () => {
      try {
        const [oneSignal, auth] = await Promise.all([
          attempt === 0 ? getOneSignal() : retryOneSignal(),
          supabase.auth.getUser(),
        ]);
        if (cancelled) return;
        if (!oneSignal.Notifications.isPushSupported()) {
          setNotificationState("unsupported");
          return;
        }
        if (!auth.data.user) throw new Error("Authenticated user unavailable");
        await oneSignal.login(auth.data.user.id);
        if (!cancelled)
          setNotificationState(
            oneSignal.Notifications.permission ? "enabled" : "available",
          );
      } catch (error) {
        console.warn(
          "Notification setup failed",
          error instanceof Error ? error.name : "UnknownError",
        );
        if (!cancelled) setNotificationState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, currentUser]);

  if (!currentUser || !oneSignalConfigured()) return null;

  if (notificationState === "initializing") {
    return <p className="text-xs text-slate-600">Checking notifications...</p>;
  }

  if (notificationState === "enabled") {
    return <p className="text-xs font-medium text-emerald-700">Notifications enabled</p>;
  }

  if (notificationState === "unsupported") {
    return (
      <p className="max-w-40 text-xs text-slate-600">
        Notifications not supported on this browser
      </p>
    );
  }

  if (notificationState === "error") {
    return (
      <div className="flex items-center gap-2">
        <p className="text-xs text-red-700">Notification setup failed</p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setNotificationState("initializing");
            setAttempt((value) => value + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        void getOneSignal()
          .then(async (oneSignal) => {
            await oneSignal.Notifications.requestPermission();
            setNotificationState(
              oneSignal.Notifications.permission ? "enabled" : "available",
            );
          })
          .catch((error) => {
            console.warn(
              "Notification permission request failed",
              error instanceof Error ? error.name : "UnknownError",
            );
            setNotificationState("error");
          });
      }}
    >
      <Bell className="mr-2 h-4 w-4" />
      Enable notifications
    </Button>
  );
}
