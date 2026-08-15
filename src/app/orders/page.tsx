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
import { PRIORITY_LABELS, STATUS_LABELS, sortOrdersByDelivery, totalQuantity } from "@/lib/demo-data";
import type { Priority } from "@/lib/types";

type ProductDraft = {
  productName: string;
  quantity: string;
  unit: string;
  description: string;
  purchasePrice: string;
};

const emptyProduct = (): ProductDraft => ({
  productName: "",
  quantity: "1",
  unit: "kg",
  description: "",
  purchasePrice: "",
});

export default function OrdersPage() {
  const router = useRouter();
  const { createOrder, currentUser, state } = useAppContext();
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    customerName: "",
    contactPerson: "",
    mobile: "",
    address: "",
    gst: "",
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
    const list = sortOrdersByDelivery(state.orders);
    if (!search) return list;
    return list.filter(
      (order) =>
        order.orderNumber.toLowerCase().includes(search) ||
        order.invoiceNumber.toLowerCase().includes(search) ||
        order.customerName.toLowerCase().includes(search) ||
        order.mobile.includes(search),
    );
  }, [query, state.orders]);

  const suggestions = useMemo(() => {
    const search = form.customerName.trim().toLowerCase();
    if (search.length < 1) return [];
    return state.customers
      .filter((customer) => customer.name.toLowerCase().includes(search))
      .slice(0, 8);
  }, [form.customerName, state.customers]);

  function applyCustomerSuggestion(name: string) {
    const match = state.customers.find((customer) => customer.name === name);
    setForm((previous) => ({
      ...previous,
      customerName: name,
      contactPerson: previous.contactPerson || name,
      mobile: match?.mobile || previous.mobile,
      gst: match?.gst || previous.gst,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.customerName.trim()) return;

    const order = createOrder({
      ...form,
      gst: form.gst || undefined,
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
          description: product.description.trim() || undefined,
          purchasePrice: product.purchasePrice.trim()
            ? Number(product.purchasePrice)
            : undefined,
        })),
    });

    setForm({
      customerName: "",
      contactPerson: "",
      mobile: "",
      address: "",
      gst: "",
      invoiceNumber: "",
      invoiceDate: new Date().toISOString().slice(0, 10),
      deliveryDate: new Date().toISOString().slice(0, 10),
      priority: "normal",
      notes: "",
      billingSource: "",
      externalInvoiceId: "",
      externalCustomerId: "",
    });
    setProducts([emptyProduct()]);
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
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Orders"
        description="Create a new order first. All existing orders are listed in their own section below."
      />

      <SectionCard
        title="Create order"
        titleClassName="text-2xl sm:text-3xl tracking-tight"
        description="Fill customer, invoice, delivery date, and product lines. Purchase price stays admin-only."
        className="border-teal-300/80 bg-gradient-to-br from-teal-50 via-white to-slate-50 p-5 shadow-md shadow-teal-900/5 sm:p-7"
      >
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="relative">
            <Input
              label="Customer name"
              required
              list="customer-suggestions"
              value={form.customerName}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, customerName: event.target.value }))
              }
              placeholder="Type name — suggestions appear from your list"
            />
            <datalist id="customer-suggestions">
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.name} />
              ))}
            </datalist>
            {suggestions.length ? (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
                {suggestions.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => applyCustomerSuggestion(customer.name)}
                  >
                    <span className="font-medium text-slate-900">{customer.name}</span>
                    {customer.mobile ? (
                      <span className="ml-2 text-slate-500">{customer.mobile}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Contact person"
              required
              value={form.contactPerson}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, contactPerson: event.target.value }))
              }
            />
            <Input
              label="Mobile"
              required
              value={form.mobile}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, mobile: event.target.value }))
              }
            />
          </div>

          <TextArea
            label="Address"
            required
            rows={3}
            value={form.address}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, address: event.target.value }))
            }
          />

          <Input
            label="GST (optional)"
            value={form.gst}
            onChange={(event) => setForm((previous) => ({ ...previous, gst: event.target.value }))}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            rows={2}
            value={form.notes}
            onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
          />

          <div className="space-y-4 rounded-3xl border border-teal-200/80 bg-white/80 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-slate-900">Products</p>
                <p className="text-sm text-slate-500">
                  Add name, qty, description, and purchase price for each line.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setProducts((previous) => [...previous, emptyProduct()])}
              >
                Add product
              </Button>
            </div>

            {products.map((product, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
              >
                <div className="grid gap-3 sm:grid-cols-3">
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
                <div className="grid gap-3 lg:grid-cols-2">
                  <Input
                    label="Purchase price (admin)"
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
                    placeholder="₹ per unit"
                  />
                  <TextArea
                    label="Product description"
                    rows={2}
                    value={product.description}
                    onChange={(event) =>
                      setProducts((previous) =>
                        previous.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="Grade, size, brand, packing notes…"
                  />
                </div>
              </div>
            ))}
          </div>

          <Button type="submit" className="h-12 w-full text-base sm:w-auto sm:min-w-56">
            Create order
          </Button>
        </form>
      </SectionCard>

      <SectionCard
        title="All orders"
        titleClassName="text-xl sm:text-2xl"
        description="Today’s delivery date orders stay on top."
        className="border-slate-200 bg-white"
      >
        <Input
          label="Search orders"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Customer name, NT-00001, INV..."
        />
        <div className="mt-4 space-y-3">
          {filtered.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{order.orderNumber}</p>
                  <p className="text-sm text-slate-600">
                    {order.customerName} · {order.invoiceNumber}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Delivery {order.deliveryDate} · {order.products.length} products · qty{" "}
                    {totalQuantity(order.products)} · {PRIORITY_LABELS[order.priority]}
                  </p>
                </div>
                <Badge tone="teal">{STATUS_LABELS[order.status]}</Badge>
              </div>
            </Link>
          ))}
          {!filtered.length ? (
            <EmptyState
              title="No orders yet"
              description="Use Create order above to add the first order."
            />
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
