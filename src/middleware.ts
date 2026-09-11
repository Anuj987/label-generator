import type { NextRequest } from "next/server";
import { updateSessionAndAuthorize } from "@/lib/supabase/proxy";

export function middleware(request: NextRequest) {
  return updateSessionAndAuthorize(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|OneSignalSDKWorker.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
