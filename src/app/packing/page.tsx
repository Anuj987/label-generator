"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import { Badge, Button, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import { PRIORITY_LABELS, totalQuantity } from "@/lib/demo-data";
import { formatDate } from "@/lib/storage";

export default function PackingPage() {
  const {
    acceptOrder,
    currentUser,
    getCustomer,
    markReadyForDelivery,
    state,
    toggleChecklistItem,
  } = useAppContext();

  const queue = useMemo(
    () => state.orders.filter((order) => order.status === "new" || order.status === "packing"),
    [state.orders],
  );

  if (!currentUser) return null;

  if (currentUser.role !== "packing") {
    return (
      <div className="space-y-5">
        <PageHeader title="Packing" description="Packing role only." />
        <EmptyState title="Restricted" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Packing · Somnath"
        title="Packing queue"
        description="Accept new orders, complete the checklist, then mark Ready for Delivery."
      />

      <div className="space-y-4">
        {queue.map((order) => {
          const customer = getCustomer(order.customerId);
          const allDone = order.packingChecklist.every((item) => item.completed);

          return (
            <SectionCard
              key={order.id}
              title={order.orderNumber}
              description={`${customer?.name} · Invoice ${order.invoiceNumber}`}
              actions={<Badge tone={order.priority === "normal" ? "slate" : "amber"}>{PRIORITY_LABELS[order.priority]}</Badge>}
            >
              <div className="mb-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <p>Delivery date: {formatDate(order.deliveryDate)}</p>
                <p>
                  Products: {order.products.length} · Total qty: {totalQuantity(order.products)}
                </p>
                {order.acceptedBy ? <p>Accepted by: {order.acceptedBy}</p> : null}
              </div>

              {order.status === "new" ? (
                <Button onClick={() => acceptOrder(order.id)}>Accept order</Button>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {order.packingChecklist.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => toggleChecklistItem(order.id, item.id)}
                          className="h-4 w-4 accent-teal-700"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={!allDone} onClick={() => markReadyForDelivery(order.id)}>
                      Ready for Delivery
                    </Button>
                    <Link href={`/orders/${order.id}`}>
                      <Button variant="secondary">View order</Button>
                    </Link>
                  </div>
                </div>
              )}
            </SectionCard>
          );
        })}

        {!queue.length ? (
          <EmptyState
            title="No packing work right now"
            description="New and packing orders will appear here."
          />
        ) : null}
      </div>
    </div>
  );
}
