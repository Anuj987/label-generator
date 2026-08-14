"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { PRIORITY_LABELS, STATUS_LABELS, totalQuantity } from "@/lib/demo-data";
import type { Priority } from "@/lib/types";

type ProductDraft = { productName: string; quantity: string; unit: string };

const emptyProduct = (): ProductDraft => ({ productName: "", quantity: "1", unit: "kg" });

export default function OrdersPage() {
  const router = useRouter();
  const { createOrder, currentUser, getCustomer, state } = useAppContext();
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    customerId: "",
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    deliveryDate: new Date().toISOString().slice(0, 10),
    priority: "normal" as Priority,
    notes: "",
    billingSource: "",
    externalInvoiceId: "",
    externalCustomerId: "",
  });
  const [products, setProducts] = useState<ProductDraft[]>([emptyProduct()]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return state.orders.filter((order) => {
      const customer = getCustomer(order.customerId);
      if (!search) return true;
      return (
        order.orderNumber.toLowerCase().includes(search) ||
        order.invoiceNumber.toLowerCase().includes(search) ||
        customer?.name.toLowerCase().includes(search) ||
        customer?.mobile.includes(search)
      );
    });
  }, [getCustomer, query, state.orders]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.customerId) return;

    const order = createOrder({
      ...form,
      notes: form.notes || undefined,
      billingSource: form.billingSource || undefined,
      externalInvoiceId: form.externalInvoiceId || undefined,
      externalCustomerId: form.externalCustomerId || undefined,
      products: products
        .filter((product) => product.productName.trim())
        .map((product) => ({
          productName: product.productName.trim(),
          quantity: Number(product.quantity) || 1,
          unit: product.unit.trim() || "unit",
        })),
    });

    router.push(`/orders/${order.id}`);
  }

  if (!currentUser) return null;

  if (currentUser.role !== "admin") {
    return (
      <div className="space-y-5">
        <PageHeader title="Orders" description="Admin creates and edits orders before packing." />
        <EmptyState title="Restricted" description="Use packing or delivery queues for your role." />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin"
        title="Orders"
        description="Create orders after billing. Edit is allowed only while status is New."
      />

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard title="Create order">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <Select
              label="Customer"
              required
              value={form.customerId}
              onChange={(event) => setForm((previous) => ({ ...previous, customerId: event.target.value }))}
            >
              <option value="">Select customer</option>
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Invoice number"
                required
                value={form.invoiceNumber}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, invoiceNumber: event.target.value }))
                }
              />
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
              <Input
                label="Invoice date"
                type="date"
                required
                value={form.invoiceDate}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, invoiceDate: event.target.value }))
                }
              />
              <Input
                label="Delivery date"
                type="date"
                required
                value={form.deliveryDate}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, deliveryDate: event.target.value }))
                }
              />
            </div>
            <TextArea
              label="Order notes"
              value={form.notes}
              onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Products</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setProducts((previous) => [...previous, emptyProduct()])}
                >
                  Add product
                </Button>
              </div>
              {products.map((product, index) => (
                <div key={index} className="grid gap-2 rounded-2xl border border-slate-200 p-3 sm:grid-cols-3">
                  <Input
                    label="Product name"
                    required
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
                    label="Quantity"
                    type="number"
                    min="1"
                    required
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
                    required
                    value={product.unit}
                    onChange={(event) =>
                      setProducts((previous) =>
                        previous.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, unit: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Billing source"
                placeholder="Swipe / Odoo / Zoho / Tally"
                value={form.billingSource}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, billingSource: event.target.value }))
                }
              />
              <Input
                label="External invoice ID"
                value={form.externalInvoiceId}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, externalInvoiceId: event.target.value }))
                }
              />
            </div>

            <Button type="submit">Create order</Button>
          </form>
        </SectionCard>

        <SectionCard title="All orders" description="Search by customer, order, invoice, or mobile.">
          <Input
            label="Search orders"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="NT-00125, INV-88921, Patel..."
          />
          <div className="mt-4 space-y-3">
            {filtered.map((order) => {
              const customer = getCustomer(order.customerId);
              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{order.orderNumber}</p>
                      <p className="text-sm text-slate-600">
                        {customer?.name} · {order.invoiceNumber}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {order.products.length} products · qty {totalQuantity(order.products)} ·{" "}
                        {PRIORITY_LABELS[order.priority]}
                      </p>
                    </div>
                    <Badge tone="teal">{STATUS_LABELS[order.status]}</Badge>
                  </div>
                </Link>
              );
            })}
            {!filtered.length ? (
              <EmptyState title="No orders found" description="Try another search term." />
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
