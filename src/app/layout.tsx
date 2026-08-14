import type { Metadata } from "next";
import { AppProvider } from "@/components/providers/app-provider";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "National Traders Operations Console",
  description: "Mobile-first operations console for Admin, Packing, and Delivery teams.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
