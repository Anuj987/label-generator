"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  SectionCard,
  TextArea,
} from "@/components/ui";
import { PRIORITY_LABELS, sortOrdersByDelivery, totalQuantity } from "@/lib/demo-data";
import { formatDate } from "@/lib/storage";
import type { PartialDeliveryLine } from "@/lib/types";

type OutcomeMode = "delivered" | "partial" | "return" | null;

export default function DeliveryPage() {
  const {
    completeDelivered,
    completeFullReturn,
    completePartialDelivery,
    currentUser,
    startDelivery,
    state,
  } = useAppContext();

  const queue = useMemo(
    () =>
      sortOrdersByDelivery(
        state.orders.filter(
          (order) => order.status === "ready" || order.status === "out_for_delivery",
        ),
      ),
    [state.orders],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<OutcomeMode>(null);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [partialLines, setPartialLines] = useState<PartialDeliveryLine[]>([]);

  if (!currentUser) return null;

  if (currentUser.role !== "delivery") {
    return (
      <div className="space-y-5">
        <PageHeader title="Delivery" description="Delivery role only." />
        <EmptyState title="Restricted" />
      </div>
    );
  }

  function openOutcome(orderId: string, nextMode: OutcomeMode) {
    const order = state.orders.find((item) => item.id === orderId);
    if (!order) return;
    setActiveId(orderId);
    setMode(nextMode);
    setNotes("");
    setReason("");
    setFiles(null);
    setPartialLines(
      order.products.map((product) => ({
        productId: product.id,
        productName: product.productName,
        orderedQuantity: product.quantity,
        deliveredQuantity: product.quantity,
        returnedQuantity: 0,
        reason: "",
      })),
    );
  }

  async function submitOutcome() {
    if (!activeId || !mode) return;
    const fileArray = files ? Array.from(files) : [];

    if (mode === "delivered") {
      await completeDelivered(activeId, fileArray, notes || undefined);
    } else if (mode === "partial") {
      await completePartialDelivery(activeId, partialLines, fileArray, notes || undefined);
    } else if (mode === "return") {
      await completeFullReturn(activeId, reason, fileArray);
    }

    setActiveId(null);
    setMode(null);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Delivery · Mayur"
        title="Delivery queue"
        description="Start ready orders, then record delivered, partial, or full return outcomes."
      />

      <div className="space-y-4">
        {queue.map((order) => {
          const isActive = activeId === order.id;

          return (
            <SectionCard
              key={order.id}
              title={order.orderNumber}
              description={`${order.customerName} · Invoice ${order.invoiceNumber}`}
              actions={<Badge tone={order.priority === "normal" ? "slate" : "amber"}>{PRIORITY_LABELS[order.priority]}</Badge>}
            >
              <div className="mb-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <p>Delivery date: {formatDate(order.deliveryDate)}</p>
                <p>
                  Products: {order.products.length} · Total qty: {totalQuantity(order.products)}
                </p>
                <p>Status: {order.status === "ready" ? "Ready" : "Out for Delivery"}</p>
              </div>

              {order.status === "ready" ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => startDelivery(order.id)}>Start delivery</Button>
                  <Link href={`/orders/${order.id}`}>
                    <Button variant="secondary">View order</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => openOutcome(order.id, "delivered")}>Delivered</Button>
                    <Button variant="secondary" onClick={() => openOutcome(order.id, "partial")}>
                      Partial Delivery
                    </Button>
                    <Button variant="danger" onClick={() => openOutcome(order.id, "return")}>
                      Full Return
                    </Button>
                    <Link href={`/orders/${order.id}`}>
                      <Button variant="ghost">View order</Button>
                    </Link>
                  </div>

                  {isActive && mode ? (
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      {mode === "delivered" ? (
                        <>
                          <Input
                            label="Upload signed bill / photos"
                            type="file"
                            multiple
                            onChange={(event) => setFiles(event.target.files)}
                          />
                          <TextArea
                            label="Notes"
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                          />
                        </>
                      ) : null}

                      {mode === "partial" ? (
                        <>
                          {partialLines.map((line, index) => (
                            <div key={line.productId} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                              <p className="text-sm font-medium text-slate-900">
                                {line.productName} · ordered {line.orderedQuantity}
                              </p>
                              <div className="grid gap-2 sm:grid-cols-3">
                                <Input
                                  label="Delivered qty"
                                  type="number"
                                  value={line.deliveredQuantity}
                                  onChange={(event) =>
                                    setPartialLines((previous) =>
                                      previous.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, deliveredQuantity: Number(event.target.value) || 0 }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                                <Input
                                  label="Returned qty"
                                  type="number"
                                  value={line.returnedQuantity}
                                  onChange={(event) =>
                                    setPartialLines((previous) =>
                                      previous.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, returnedQuantity: Number(event.target.value) || 0 }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                                <Input
                                  label="Reason"
                                  value={line.reason}
                                  onChange={(event) =>
                                    setPartialLines((previous) =>
                                      previous.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, reason: event.target.value }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </div>
                            </div>
                          ))}
                          <Input
                            label="Upload photos / signed bill"
                            type="file"
                            multiple
                            onChange={(event) => setFiles(event.target.files)}
                          />
                          <TextArea
                            label="Notes"
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                          />
                        </>
                      ) : null}

                      {mode === "return" ? (
                        <>
                          <TextArea
                            label="Return reason"
                            required
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                          />
                          <Input
                            label="Upload photos"
                            type="file"
                            multiple
                            onChange={(event) => setFiles(event.target.files)}
                          />
                        </>
                      ) : null}

                      <div className="flex gap-2">
                        <Button
                          onClick={submitOutcome}
                          disabled={mode === "return" && !reason.trim()}
                        >
                          Complete
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setActiveId(null);
                            setMode(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </SectionCard>
          );
        })}

        {!queue.length ? (
          <EmptyState
            title="No delivery work right now"
            description="Ready and out-for-delivery orders appear here."
          />
        ) : null}
      </div>
    </div>
  );
}
