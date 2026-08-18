"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import { Badge, Button, EmptyState, PageHeader, SectionCard, TextArea } from "@/components/ui";
import { PRIORITY_LABELS, sortOrdersByDelivery, totalQuantity } from "@/lib/demo-data";
import { errorMessage, formatDate } from "@/lib/storage";

export default function PackingPage() {
  const {
    acceptOrder,
    currentUser,
    markReadyForDelivery,
    savePackingNotes,
    state,
    toggleChecklistItem,
  } = useAppContext();

  const queue = useMemo(
    () =>
      sortOrdersByDelivery(
        state.orders.filter((order) => order.status === "new" || order.status === "packing"),
      ),
    [state.orders],
  );

  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  if (!currentUser) return null;

  if (currentUser.role !== "packing") {
    return (
      <div className="space-y-5">
        <PageHeader title="Packing" description="Packing role only." />
        <EmptyState title="Restricted" />
      </div>
    );
  }

  async function handleSaveNote(orderId: string, fallback: string) {
    setSavingId(orderId);
    setNoteError(null);
    try {
      const value = noteDrafts[orderId] ?? fallback;
      await savePackingNotes(orderId, value);
    } catch (err) {
      setNoteError(errorMessage(err, "Failed to save packing note"));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Packing · Somnath"
        title="Packing queue"
        description="View new orders, accept when ready, add an optional note for any changes, then mark Ready for Delivery."
      />

      {noteError ? <p className="text-sm text-rose-600">{noteError}</p> : null}

      <div className="space-y-4">
        {queue.map((order) => {
          const allDone = order.packingChecklist.every((item) => item.completed);
          const noteValue = noteDrafts[order.id] ?? order.packingNotes ?? "";

          return (
            <SectionCard
              key={order.id}
              title={order.orderNumber}
              description={`${order.customerName} · Invoice ${order.invoiceNumber}`}
              actions={
                <Badge tone={order.priority === "normal" ? "slate" : "amber"}>
                  {PRIORITY_LABELS[order.priority]}
                </Badge>
              }
            >
              <div className="mb-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <p>Mobile: {order.mobile}</p>
                <p>Delivery date: {formatDate(order.deliveryDate)}</p>
                <p>
                  Products: {order.products.length} · Total qty: {totalQuantity(order.products)}
                </p>
                {order.acceptedBy ? <p>Accepted by: {order.acceptedBy}</p> : null}
                {order.notes ? (
                  <p className="sm:col-span-2 rounded-2xl bg-slate-50 px-3 py-2 text-slate-700">
                    Order notes: {order.notes}
                  </p>
                ) : null}
              </div>

              {order.status === "new" ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => acceptOrder(order.id)}>Accept order</Button>
                  <Link href={`/orders/${order.id}`}>
                    <Button variant="secondary">View order</Button>
                  </Link>
                </div>
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

                  <TextArea
                    label="Packing note (optional)"
                    placeholder="Any changes, missing items, substitutions, or special packing notes"
                    rows={3}
                    value={noteValue}
                    onChange={(event) =>
                      setNoteDrafts((previous) => ({
                        ...previous,
                        [order.id]: event.target.value,
                      }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={savingId === order.id}
                      onClick={() => void handleSaveNote(order.id, order.packingNotes ?? "")}
                    >
                      {savingId === order.id ? "Saving…" : "Save note"}
                    </Button>
                    <Button disabled={!allDone} onClick={() => markReadyForDelivery(order.id)}>
                      Ready for Delivery
                    </Button>
                    <Link href={`/orders/${order.id}`}>
                      <Button variant="ghost">View order</Button>
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
