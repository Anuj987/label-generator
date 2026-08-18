"use client";

import { FormEvent, useMemo, useState } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  PhotoThumbGrid,
  SectionCard,
  Select,
  TextArea,
} from "@/components/ui";
import { errorMessage, fileToCompressedDataUrl, formatCurrency, formatDateTime } from "@/lib/storage";
import type { DocumentKind, PaymentMode } from "@/lib/types";

export default function PaymentsPage() {
  const { currentUser, recordPayment, state } = useAppContext();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: "",
    mode: "cash" as PaymentMode,
    chequeNumber: "",
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
    if (form.mode === "cheque" && !form.chequeNumber.trim()) {
      setError("Cheque number is required for cheque payments.");
      return;
    }

    setError(null);
    setSaving(true);

    const kindByMode: Record<PaymentMode, DocumentKind> = {
      cash: "receipt",
      upi: "upi_screenshot",
      bank_transfer: "payment_proof",
      cheque: "cheque_photo",
    };

    try {
      const uploaded = [];
      if (files) {
        for (const file of Array.from(files)) {
          uploaded.push({
            name: file.name.replace(/\.\w+$/, "") + ".jpg",
            kind: kindByMode[form.mode],
            dataUrl: await fileToCompressedDataUrl(file),
          });
        }
      }

      await recordPayment({
        customerName: form.customerName,
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate,
        paymentDate: form.paymentDate,
        amount: Number(form.amount),
        mode: form.mode,
        chequeNumber: form.chequeNumber || undefined,
        orderId: form.orderId || undefined,
        notes: form.notes || undefined,
        files: uploaded,
      });

      setForm({
        customerName: "",
        invoiceNumber: "",
        invoiceDate: new Date().toISOString().slice(0, 10),
        paymentDate: new Date().toISOString().slice(0, 10),
        amount: "",
        mode: "cash",
        chequeNumber: "",
        orderId: "",
        notes: "",
      });
      setFiles(null);
    } catch (err) {
      setError(errorMessage(err, "Failed to save payment"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Payments"
        title="Payment collection"
        description="Type a customer name or pick from suggestions. Invoice number is optional."
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
                label="Invoice number (optional)"
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
                label="Payment date"
                type="date"
                required
                value={form.paymentDate}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, paymentDate: event.target.value }))
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
              {form.mode === "cheque" ? (
                <Input
                  label="Cheque number"
                  required
                  value={form.chequeNumber}
                  onChange={(event) =>
                    setForm((previous) => ({ ...previous, chequeNumber: event.target.value }))
                  }
                />
              ) : null}
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
              label="Upload cheque / UPI / receipt photo"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setFiles(event.target.files)}
            />
            <p className="text-xs text-slate-500">Photos are compressed automatically for mobile save.</p>
            <TextArea
              label="Notes"
              value={form.notes}
              onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
            />
            {error ? (
              <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            ) : null}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save payment"}
            </Button>
          </form>
        </SectionCard>

        <SectionCard title="Payment list" description="Shared across phones. Search by customer or invoice.">
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
                      {payment.customerName} · {payment.invoiceNumber || "No invoice"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {payment.mode.replace("_", " ")} · {payment.collectedBy} ·{" "}
                      {formatDateTime(payment.createdAt)}
                    </p>
                  </div>
                </div>
                {payment.documents.length ? (
                  <div className="mt-3">
                    <PhotoThumbGrid
                      items={payment.documents.map((doc) => ({
                        id: doc.id,
                        src: doc.dataUrl,
                        title: doc.name,
                      }))}
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-400">No proof photo attached</p>
                )}
              </div>
            ))}
            {!filtered.length ? <EmptyState title="No payments yet" /> : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Payment activity" description="Recent payment collections (all devices).">
        <div className="space-y-3">
          {state.auditEvents
            .filter((event) => event.action === "payment_collected")
            .slice(0, 12)
            .map((event) => (
              <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-medium text-slate-900">
                  {event.emoji} {event.detail}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {event.actorName} · {formatDateTime(event.createdAt)}
                </p>
              </div>
            ))}
          {!state.auditEvents.some((event) => event.action === "payment_collected") ? (
            <EmptyState title="No payment activity yet" description="Saved payments will appear here on all phones." />
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
