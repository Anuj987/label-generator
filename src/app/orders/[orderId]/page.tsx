"use client";

import { FormEvent, use, useMemo, useState } from "react";
import Link from "next/link";
import { useAppContext } from "@/components/providers/app-provider";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  SectionCard,
  Select,
  TextArea,
} from "@/components/ui";
import { PRIORITY_LABELS, STATUS_LABELS, totalPurchaseCost } from "@/lib/demo-data";
import { formatDate, formatDateTime } from "@/lib/storage";
import type { Priority } from "@/lib/types";

export default function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const { currentUser, state, updateOrderBeforePacking } = useAppContext();

  const order = state.orders.find((item) => item.id === orderId);
  const events = useMemo(
    () => state.auditEvents.filter((event) => event.orderId === orderId),
    [orderId, state.auditEvents],
  );

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    customerName: order?.customerName ?? "",
    contactPerson: order?.contactPerson ?? "",
    mobile: order?.mobile ?? "",
    address: order?.address ?? "",
    gst: order?.gst ?? "",
    invoiceNumber: order?.invoiceNumber ?? "",
    invoiceDate: order?.invoiceDate ?? "",
    deliveryDate: order?.deliveryDate ?? "",
    priority: (order?.priority ?? "normal") as Priority,
    notes: order?.notes ?? "",
  });
  const [products, setProducts] = useState(
    order?.products.map((product) => ({
      productName: product.productName,
      quantity: String(product.quantity),
      unit: product.unit,
      purchasePrice:
        product.purchasePrice !== undefined && product.purchasePrice !== null
          ? String(product.purchasePrice)
          : "",
    })) ?? [],
  );

  if (!currentUser) return null;

  if (!order) {
    return (
      <div className="space-y-5">
        <PageHeader title="Order not found" />
        <EmptyState title="Missing order" description="Return to orders and try again." />
      </div>
    );
  }

  const canEdit = currentUser.role === "admin" && order.status === "new";

  function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!order) return;
    updateOrderBeforePacking(order.id, {
      ...form,
      gst: form.gst || undefined,
      notes: form.notes || undefined,
      products: products.map((product) => ({
        productName: product.productName,
        quantity: Number(product.quantity) || 1,
        unit: product.unit,
        purchasePrice: product.purchasePrice.trim()
          ? Number(product.purchasePrice)
          : undefined,
      })),
    });
    setEditing(false);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={order.orderNumber}
        title={order.customerName}
        description={`${order.invoiceNumber} · Delivery ${formatDate(order.deliveryDate)}`}
        actions={
          <div className="flex gap-2">
            <Badge tone="teal">{STATUS_LABELS[order.status]}</Badge>
            <Badge tone={order.priority === "normal" ? "slate" : "amber"}>
              {PRIORITY_LABELS[order.priority]}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Order details"
          actions={
            canEdit ? (
              <Button variant="secondary" onClick={() => setEditing((value) => !value)}>
                {editing ? "Cancel" : "Edit"}
              </Button>
            ) : null
          }
        >
          {editing ? (
            <form className="grid gap-3" onSubmit={saveEdit}>
              <Input
                label="Customer name"
                value={form.customerName}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, customerName: event.target.value }))
                }
              />
              <Input
                label="Contact person"
                value={form.contactPerson}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, contactPerson: event.target.value }))
                }
              />
              <Input
                label="Mobile"
                value={form.mobile}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, mobile: event.target.value }))
                }
              />
              <TextArea
                label="Address"
                value={form.address}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, address: event.target.value }))
                }
              />
              <Input
                label="Invoice number"
                value={form.invoiceNumber}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, invoiceNumber: event.target.value }))
                }
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Invoice date"
                  type="date"
                  value={form.invoiceDate}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, invoiceDate: event.target.value }))
                  }
                />
                <Input
                  label="Delivery date"
                  type="date"
                  value={form.deliveryDate}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, deliveryDate: event.target.value }))
                  }
                />
              </div>
              <Select
                label="Priority"
                value={form.priority}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, priority: event.target.value as Priority }))
                }
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <TextArea
                label="Notes"
                value={form.notes}
                onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
              />
              {products.map((product, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    label="Product"
                    value={product.productName}
                    onChange={(event) =>
                      setProducts((previous) =>
                        previous.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, productName: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    label="Qty"
                    value={product.quantity}
                    onChange={(event) =>
                      setProducts((previous) =>
                        previous.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, quantity: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    label="Unit"
                    value={product.unit}
                    onChange={(event) =>
                      setProducts((previous) =>
                        previous.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, unit: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    label="Purchase price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={product.purchasePrice}
                    onChange={(event) =>
                      setProducts((previous) =>
                        previous.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, purchasePrice: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              <Button type="submit">Save changes</Button>
            </form>
          ) : (
            <div className="space-y-3 text-sm text-slate-700">
              <p>
                <span className="font-medium text-slate-900">Customer:</span> {order.customerName}
              </p>
              <p>
                <span className="font-medium text-slate-900">Contact:</span> {order.contactPerson} ·{" "}
                {order.mobile}
              </p>
              <p>
                <span className="font-medium text-slate-900">Address:</span> {order.address}
              </p>
              {order.gst ? (
                <p>
                  <span className="font-medium text-slate-900">GST:</span> {order.gst}
                </p>
              ) : null}
              <p>
                <span className="font-medium text-slate-900">Created by:</span> {order.createdBy} ·{" "}
                {formatDateTime(order.createdAt)}
              </p>
              {order.acceptedBy ? (
                <p>
                  <span className="font-medium text-slate-900">Accepted by:</span> {order.acceptedBy} ·{" "}
                  {formatDateTime(order.packingStartTime)}
                </p>
              ) : null}
              {order.packingCompletedTime ? (
                <p>
                  <span className="font-medium text-slate-900">Packing completed:</span>{" "}
                  {formatDateTime(order.packingCompletedTime)}
                  {order.packingDurationMinutes ? ` · ${order.packingDurationMinutes} min` : ""}
                </p>
              ) : null}
              {order.deliveryStartTime ? (
                <p>
                  <span className="font-medium text-slate-900">Delivery started:</span>{" "}
                  {formatDateTime(order.deliveryStartTime)}
                </p>
              ) : null}
              {order.deliveryCompletedTime ? (
                <p>
                  <span className="font-medium text-slate-900">Delivery completed:</span>{" "}
                  {formatDateTime(order.deliveryCompletedTime)}
                </p>
              ) : null}
              {order.notes ? <p className="rounded-2xl bg-slate-50 p-3">{order.notes}</p> : null}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Products">
          <div className="space-y-2">
            {order.products.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-900">{product.productName}</span>
                <span className="text-right text-slate-600">
                  {product.quantity} {product.unit}
                  {currentUser.role === "admin" && product.purchasePrice !== undefined ? (
                    <span className="mt-1 block text-xs text-teal-800">
                      Purchase ₹{product.purchasePrice.toLocaleString("en-IN")} / {product.unit}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
            {currentUser.role === "admin" ? (
              <p className="pt-2 text-sm font-medium text-slate-800">
                Total purchase cost: ₹
                {totalPurchaseCost(order.products).toLocaleString("en-IN")}
              </p>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Packing checklist">
        <div className="space-y-2">
          {order.packingChecklist.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-2 text-sm"
            >
              <span>{item.label}</span>
              <Badge tone={item.completed ? "emerald" : "slate"}>
                {item.completed ? "Done" : "Pending"}
              </Badge>
            </div>
          ))}
        </div>
      </SectionCard>

      {order.partialLines?.length ? (
        <SectionCard title="Partial delivery lines">
          <div className="space-y-2">
            {order.partialLines.map((line) => (
              <div key={line.productId} className="rounded-2xl border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">{line.productName}</p>
                <p className="text-slate-600">
                  Ordered {line.orderedQuantity} · Delivered {line.deliveredQuantity} · Returned{" "}
                  {line.returnedQuantity}
                </p>
                <p className="text-slate-500">{line.reason}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {order.returnReason ? (
        <SectionCard title="Full return reason">
          <p className="text-sm text-slate-700">{order.returnReason}</p>
        </SectionCard>
      ) : null}

      <SectionCard title="Documents">
        {order.documents.length ? (
          <div className="space-y-2">
            {order.documents.map((doc) => (
              <a
                key={doc.id}
                href={doc.dataUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
              >
                {doc.name} · {doc.kind} · {doc.uploadedBy}
              </a>
            ))}
          </div>
        ) : (
          <EmptyState title="No documents yet" description="Delivery proofs and bills appear here." />
        )}
      </SectionCard>

      <SectionCard title="Audit timeline">
        <div className="space-y-3">
          {events.map((event) => (
            <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-900">
                {event.emoji} {event.detail}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {event.actorName} · {formatDateTime(event.createdAt)}
              </p>
            </div>
          ))}
          {!events.length ? <EmptyState title="No timeline events yet" /> : null}
        </div>
      </SectionCard>

      <div className="flex gap-2">
        <Link href="/orders">
          <Button variant="secondary">Back to orders</Button>
        </Link>
        {currentUser.role === "packing" ? (
          <Link href="/packing">
            <Button variant="secondary">Packing queue</Button>
          </Link>
        ) : null}
        {currentUser.role === "delivery" ? (
          <Link href="/delivery">
            <Button variant="secondary">Delivery queue</Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
