"use client";

import { ReactNode, useEffect } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import {
  initOneSignal,
  isIosSafariLike,
  loginOneSignalExternalId,
  logoutOneSignal,
} from "@/lib/onesignal-client";

/**
 * Initializes OneSignal Web SDK and links External ID to public.users.id.
 * No UI redesign — uses the browser's native permission prompt after login.
 */
export function OneSignalBridge({ children }: { children: ReactNode }) {
  const { ready, currentUser, liveMode } = useAppContext();

  useEffect(() => {
    if (!ready || !liveMode) return;
    void initOneSignal();
  }, [ready, liveMode]);

  useEffect(() => {
    if (!ready || !liveMode) return;

    if (currentUser?.id) {
      // Auto-prompt on desktop/Android; iOS needs a user tap + home-screen app.
      void loginOneSignalExternalId(currentUser.id, {
        requestPermission: !isIosSafariLike(),
      });
      return;
    }

    void logoutOneSignal();
  }, [ready, liveMode, currentUser?.id]);

  return <>{children}</>;
}
