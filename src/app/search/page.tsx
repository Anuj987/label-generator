"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import { Badge, EmptyState, Input, PageHeader, SectionCard } from "@/components/ui";
import { STATUS_LABELS } from "@/lib/demo-data";
import { formatCurrency } from "@/lib/storage";

export default function SearchPage() {
  const { currentUser, searchAll } = useAppContext();
  const [query, setQuery] = useState("");
  const results = query.trim().length > 1 ? searchAll(query) : { orders: [], payments: [] };

  if (!currentUser) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Global search"
        title="Find anything fast"
        description="Search by customer name, order number, invoice number, or mobile."
      />

      <SectionCard>
        <Input
          label="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Customer name, NT-00001, INV-88921, mobile..."
        />
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Orders">
          <div className="space-y-2">
            {results.orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{order.orderNumber}</p>
                  <p className="text-sm text-slate-600">
                    {order.customerName} · {order.invoiceNumber}
                  </p>
                </div>
                <Badge tone="teal">{STATUS_LABELS[order.status]}</Badge>
              </Link>
            ))}
            {query.trim().length > 1 && !results.orders.length ? (
              <EmptyState title="No matching orders" />
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Payments">
          <div className="space-y-2">
            {results.payments.map((payment) => (
              <div key={payment.id} className="rounded-2xl border border-slate-200 px-3 py-3">
                <p className="font-medium text-slate-900">{formatCurrency(payment.amount)}</p>
                <p className="text-sm text-slate-600">
                  {payment.customerName} · {payment.invoiceNumber}
                </p>
              </div>
            ))}
            {query.trim().length > 1 && !results.payments.length ? (
              <EmptyState title="No matching payments" />
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
