"use client";

import { FormEvent, useMemo, useState } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  SectionCard,
  Select,
  TextArea,
} from "@/components/ui";
import { fileToDataUrl, formatCurrency, formatDateTime } from "@/lib/storage";
import type { DocumentKind, PaymentMode } from "@/lib/types";

export default function PaymentsPage() {
  const { currentUser, recordPayment, state } = useAppContext();
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    customerName: "",
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    amount: "",
    mode: "cash" as PaymentMode,
    orderId: "",
    notes: "",
  });
  const [files, setFiles] = useState<FileList | null>(null);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return state.payments.filter((payment) => {
      if (!search) return true;
      return (
        payment.invoiceNumber.toLowerCase().includes(search) ||
        payment.customerName.toLowerCase().includes(search)
      );
    });
  }, [query, state.payments]);

  if (!currentUser) return null;

  if (currentUser.role === "packing") {
    return (
      <div className="space-y-5">
        <PageHeader title="Payments" description="Packing cannot collect payments." />
        <EmptyState title="Restricted" />
      </div>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.customerName.trim() || !form.amount) return;

    const kindByMode: Record<PaymentMode, DocumentKind> = {
      cash: "receipt",
      upi: "upi_screenshot",
      bank_transfer: "payment_proof",
      cheque: "cheque_photo",
    };

    const uploaded = [];
    if (files) {
      for (const file of Array.from(files)) {
        uploaded.push({
          name: file.name,
          kind: kindByMode[form.mode],
          dataUrl: await fileToDataUrl(file),
        });
      }
    }

    await recordPayment({
      customerName: form.customerName,
      invoiceNumber: form.invoiceNumber,
      invoiceDate: form.invoiceDate,
      amount: Number(form.amount),
      mode: form.mode,
      orderId: form.orderId || undefined,
      notes: form.notes || undefined,
      files: uploaded,
    });

    setForm({
      customerName: "",
      invoiceNumber: "",
      invoiceDate: new Date().toISOString().slice(0, 10),
      amount: "",
      mode: "cash",
      orderId: "",
      notes: "",
    });
    setFiles(null);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Payments"
        title="Payment collection"
        description="Type the customer name each time. No customer list is saved."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Collect payment">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <Input
              label="Customer name"
              required
              list="payment-customer-suggestions"
              value={form.customerName}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, customerName: event.target.value }))
              }
              placeholder="Type customer name"
            />
            <datalist id="payment-customer-suggestions">
              {state.customers.map((customer) => (
                <option key={customer.id} value={customer.name} />
              ))}
            </datalist>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Invoice number"
                required
                value={form.invoiceNumber}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, invoiceNumber: event.target.value }))
                }
              />
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
                label="Amount"
                type="number"
                min="1"
                required
                value={form.amount}
                onChange={(event) => setForm((previous) => ({ ...previous, amount: event.target.value }))}
              />
              <Select
                label="Payment mode"
                value={form.mode}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, mode: event.target.value as PaymentMode }))
                }
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
              </Select>
            </div>
            <Select
              label="Link order (optional)"
              value={form.orderId}
              onChange={(event) => setForm((previous) => ({ ...previous, orderId: event.target.value }))}
            >
              <option value="">No linked order</option>
              {state.orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber} · {order.customerName} · {order.invoiceNumber}
                </option>
              ))}
            </Select>
            <Input
              label="Upload cheque / UPI / receipt"
              type="file"
              multiple
              onChange={(event) => setFiles(event.target.files)}
            />
            <TextArea
              label="Notes"
              value={form.notes}
              onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
            />
            <Button type="submit">Save payment</Button>
          </form>
        </SectionCard>

        <SectionCard title="Payment list" description="Search by typed customer name or invoice number.">
          <Input
            label="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Customer name, INV-88921..."
          />
          <div className="mt-4 space-y-3">
            {filtered.map((payment) => (
              <div key={payment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{formatCurrency(payment.amount)}</p>
                    <p className="text-sm text-slate-600">
                      {payment.customerName} · {payment.invoiceNumber}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {payment.mode.replace("_", " ")} · {payment.collectedBy} ·{" "}
                      {formatDateTime(payment.createdAt)}
                    </p>
                  </div>
                </div>
                {payment.documents.length ? (
                  <div className="mt-3 space-y-1">
                    {payment.documents.map((doc) => (
                      <a
                        key={doc.id}
                        href={doc.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-sm text-teal-700 hover:underline"
                      >
                        {doc.name}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {!filtered.length ? <EmptyState title="No payments yet" /> : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
