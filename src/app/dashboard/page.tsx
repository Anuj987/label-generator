"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import { Badge, EmptyState, PageHeader, SectionCard, StatCard } from "@/components/ui";
import { STATUS_LABELS } from "@/lib/demo-data";
import { formatCurrency, formatDateTime, isSameDay } from "@/lib/storage";

export default function DashboardPage() {
  const { currentUser, state, getCustomer } = useAppContext();

  const stats = useMemo(() => {
    const todayOrders = state.orders.filter((order) => isSameDay(order.createdAt));
    const paymentsToday = state.payments
      .filter((payment) => isSameDay(payment.createdAt))
      .reduce((sum, payment) => sum + payment.amount, 0);

    const count = (status: string) => state.orders.filter((order) => order.status === status).length;

    return {
      ordersToday: todayOrders.length,
      newOrders: count("new"),
      packing: count("packing"),
      ready: count("ready"),
      out: count("out_for_delivery"),
      delivered: count("delivered"),
      partial: count("partial_delivery"),
      returned: count("full_return"),
      paymentsToday,
    };
  }, [state.orders, state.payments]);

  if (!currentUser) return null;

  if (currentUser.role !== "admin") {
    return (
      <div className="space-y-5">
        <PageHeader title="Dashboard" description="Admin-only operational overview." />
        <EmptyState title="Restricted" description="Use your role home from the navigation." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin"
        title="Operations dashboard"
        description="Live counts and the latest activity across packing, delivery, and payments."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Orders today" value={stats.ordersToday} />
        <StatCard label="New orders" value={stats.newOrders} />
        <StatCard label="Packing" value={stats.packing} />
        <StatCard label="Ready for delivery" value={stats.ready} />
        <StatCard label="Out for delivery" value={stats.out} />
        <StatCard label="Delivered" value={stats.delivered} />
        <StatCard label="Partial returns" value={stats.partial} />
        <StatCard label="Full returns" value={stats.returned} />
        <StatCard label="Payments collected today" value={formatCurrency(stats.paymentsToday)} />
      </div>

      <SectionCard title="Activity feed" description="Latest operational events across the business.">
        <div className="space-y-3">
          {state.auditEvents.slice(0, 12).map((event) => (
            <div
              key={event.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <p className="text-sm font-medium text-slate-900">
                {event.emoji} {event.detail}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {event.actorName} · {formatDateTime(event.createdAt)}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Recent orders">
        <div className="space-y-3">
          {state.orders.slice(0, 6).map((order) => {
            const customer = getCustomer(order.customerId);
            return (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="font-semibold text-slate-900">{order.orderNumber}</p>
                  <p className="text-sm text-slate-600">
                    {customer?.name} · {order.invoiceNumber}
                  </p>
                </div>
                <Badge tone="teal">{STATUS_LABELS[order.status]}</Badge>
              </Link>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
