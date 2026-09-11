"use client";

import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import { Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getOneSignal, oneSignalConfigured } from "@/lib/onesignal-client";

export function PushNotificationControl() {
  const { currentUser } = useAppContext();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!currentUser || !supabase || !oneSignalConfigured()) return;
    let cancelled = false;

    void (async () => {
      try {
        const [oneSignal, auth] = await Promise.all([
          getOneSignal(),
          supabase.auth.getUser(),
        ]);
        if (!auth.data.user || cancelled) return;
        await oneSignal.login(auth.data.user.id);
        if (!cancelled) {
          setSupported(oneSignal.Notifications.isPushSupported());
          setEnabled(oneSignal.Notifications.permission);
        }
      } catch {
        if (!cancelled) setSupported(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  if (!supported || enabled) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        void getOneSignal().then(async (oneSignal) => {
          await oneSignal.Notifications.requestPermission();
          setEnabled(oneSignal.Notifications.permission);
        });
      }}
    >
      <Bell className="mr-2 h-4 w-4" />
      Enable notifications
    </Button>
  );
}
