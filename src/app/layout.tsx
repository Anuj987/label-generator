import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/providers/app-provider";
import { OneSignalBridge } from "@/components/providers/onesignal-bridge";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "National Traders Operations Console",
  description: "Mobile-first operations console for Admin, Packing, and Delivery teams.",
  applicationName: "NT Console",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "NT Console",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <OneSignalBridge>
            <AppShell>{children}</AppShell>
          </OneSignalBridge>
        </AppProvider>
      </body>
    </html>
  );
}
