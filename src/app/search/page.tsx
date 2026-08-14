"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import { Badge, EmptyState, Input, PageHeader, SectionCard } from "@/components/ui";
import { STATUS_LABELS } from "@/lib/demo-data";

export default function SearchPage() {
  const { currentUser, getCustomer, searchAll } = useAppContext();
  const [query, setQuery] = useState("");
  const results = query.trim().length > 1 ? searchAll(query) : { customers: [], orders: [] };

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
          placeholder="NT-00125, INV-88921, Patel, 98765..."
        />
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Orders">
          <div className="space-y-2">
            {results.orders.map((order) => {
              const customer = getCustomer(order.customerId);
              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-3 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">{order.orderNumber}</p>
                    <p className="text-sm text-slate-600">
                      {customer?.name} · {order.invoiceNumber}
                    </p>
                  </div>
                  <Badge tone="teal">{STATUS_LABELS[order.status]}</Badge>
                </Link>
              );
            })}
            {query.trim().length > 1 && !results.orders.length ? (
              <EmptyState title="No matching orders" />
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Customers">
          <div className="space-y-2">
            {results.customers.map((customer) => (
              <div key={customer.id} className="rounded-2xl border border-slate-200 px-3 py-3">
                <p className="font-medium text-slate-900">{customer.name}</p>
                <p className="text-sm text-slate-600">
                  {customer.contactPerson} · {customer.mobile}
                </p>
              </div>
            ))}
            {query.trim().length > 1 && !results.customers.length ? (
              <EmptyState title="No matching customers" />
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
