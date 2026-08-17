"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  LogOut,
  Package,
  Search,
  Truck,
  Users,
  Wallet,
  ClipboardList,
  Download,
  Receipt,
  X,
} from "lucide-react";
import { useAppContext } from "@/components/providers/app-provider";
import { Button, Input } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/demo-data";
import type { Role } from "@/lib/types";

const NAV: Record<Role, Array<{ href: string; label: string; icon: typeof Users }>> = {
  admin: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/customers", label: "Customers", icon: Users },
    { href: "/orders", label: "Orders", icon: ClipboardList },
    { href: "/payments", label: "Payments", icon: Wallet },
    { href: "/expenses", label: "Expenses", icon: Receipt },
    { href: "/export", label: "Export", icon: Download },
    { href: "/search", label: "Search", icon: Search },
  ],
  packing: [
    { href: "/packing", label: "Packing", icon: Package },
    { href: "/expenses", label: "Expenses", icon: Receipt },
    { href: "/search", label: "Search", icon: Search },
  ],
  delivery: [
    { href: "/delivery", label: "Delivery", icon: Truck },
    { href: "/payments", label: "Payments", icon: Wallet },
    { href: "/expenses", label: "Expenses", icon: Receipt },
    { href: "/search", label: "Search", icon: Search },
  ],
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout, ready, searchAll } = useAppContext();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready) return;
    if (!currentUser && pathname !== "/login") {
      router.replace("/login");
    }
  }, [currentUser, pathname, ready, router]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!searchRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSearchOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    // Reset search UI on navigation without blocking the next paint.
    const frame = window.requestAnimationFrame(() => {
      setSearchOpen(false);
      setQuery("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  const links = useMemo(
    () => (currentUser ? NAV[currentUser.role] : []),
    [currentUser],
  );

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-600">
        Loading console…
      </div>
    );
  }

  if (pathname === "/login") return <>{children}</>;
  if (!currentUser) return null;

  const results = query.trim().length > 1 ? searchAll(query) : null;
  const showResults = searchOpen && results !== null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#d8f3ef,_#eef2f7_45%,_#f8fafc)]">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
              National Traders
            </p>
            <p className="text-sm font-medium text-slate-800">Operations Console</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-900">{currentUser.name}</p>
              <p className="text-xs text-slate-500">{ROLE_LABELS[currentUser.role]}</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                void logout().then(() => router.push("/login"));
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1 rounded-3xl border border-slate-200 bg-white/90 p-3 shadow-sm">
            {links.map((link) => {
              const Icon = link.icon;
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium ${
                    active ? "bg-teal-700 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="relative space-y-4 pb-24 lg:pb-8">
          <div ref={searchRef} className="relative z-30">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  placeholder="Search customer, order, invoice, mobile"
                  value={query}
                  onFocus={() => setSearchOpen(true)}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSearchOpen(true);
                  }}
                />
              </div>
              {query ? (
                <Button
                  type="button"
                  variant="secondary"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    setSearchOpen(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            {showResults ? (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Quick results
                  </p>
                  <button
                    type="button"
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                    onClick={() => setSearchOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="space-y-2">
                  {results.orders.slice(0, 4).map((order) => (
                    <Link
                      key={order.id}
                      href={`/orders/${order.id}`}
                      className="block rounded-xl px-2 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setQuery("");
                        setSearchOpen(false);
                      }}
                    >
                      {order.orderNumber} · {order.customerName} · {order.invoiceNumber}
                    </Link>
                  ))}
                  {results.customers.slice(0, 4).map((customer) => (
                    <Link
                      key={customer.id}
                      href="/customers"
                      className="block rounded-xl px-2 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setQuery("");
                        setSearchOpen(false);
                      }}
                    >
                      {customer.name}
                      {customer.mobile ? ` · ${customer.mobile}` : ""}
                    </Link>
                  ))}
                  {results.payments.slice(0, 4).map((payment) => (
                    <Link
                      key={payment.id}
                      href="/payments"
                      className="block rounded-xl px-2 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setQuery("");
                        setSearchOpen(false);
                      }}
                    >
                      ₹{payment.amount.toLocaleString("en-IN")} · {payment.customerName}
                    </Link>
                  ))}
                  {!results.orders.length && !results.customers.length && !results.payments.length ? (
                    <p className="px-2 py-2 text-sm text-slate-500">No matches</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {showResults ? (
            <button
              type="button"
              aria-label="Dismiss search"
              className="fixed inset-0 z-20 cursor-default bg-slate-900/10"
              onClick={() => setSearchOpen(false)}
            />
          ) : null}

          <div className="relative z-0">{children}</div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl justify-around px-2 py-2">
          {links.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex min-w-16 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium ${
                  active ? "text-teal-700" : "text-slate-500"
                }`}
              >
                <Icon className="h-5 w-5" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
