"use client";

import { FormEvent, useDeferredValue, useMemo, useState } from "react";
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
import { formatCurrency, formatDateTime } from "@/lib/storage";
import type { PaymentMode } from "@/lib/types";

const PAYMENT_PROOF_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_PAYMENT_PROOF_BYTES = 10 * 1024 * 1024;

export default function PaymentsPage() {
  const { currentUser, getPaymentProofUrl, recordPayment, state } = useAppContext();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [form, setForm] = useState({
    customerName: "",
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    amount: "",
    mode: "cash" as PaymentMode,
    orderId: "",
    notes: "",
  });
  const [customerId, setCustomerId] = useState("");
  const [proof, setProof] = useState<File>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase();
    return state.payments.filter((payment) => {
      if (!search) return true;
      return (
        payment.invoiceNumber.toLowerCase().includes(search) ||
        payment.customerName.toLowerCase().includes(search)
      );
    });
  }, [deferredQuery, state.payments]);

  if (!currentUser) return null;
  const currentRole = currentUser.role;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(form.amount);
    const selectedCustomer = state.customers.find((customer) => customer.id === customerId);
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (currentRole === "packing" && !selectedCustomer) {
      setError("Select an existing customer.");
      return;
    }
    if (currentRole !== "packing" && !form.customerName.trim()) return;

    setPending(true);
    setError("");
    try {
      await recordPayment({
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name ?? form.customerName,
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate,
        amount,
        mode: form.mode,
        orderId: form.orderId || undefined,
        notes: form.notes || undefined,
        proof,
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
      setCustomerId("");
      setProof(undefined);
      const proofInput = document.getElementById("payment-proof") as HTMLInputElement | null;
      if (proofInput) proofInput.value = "";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment could not be saved.");
    } finally {
      setPending(false);
    }
  }

  function chooseProof(file?: File) {
    setError("");
    if (!file) {
      setProof(undefined);
      return;
    }
    if (!PAYMENT_PROOF_TYPES.includes(file.type) || file.size > MAX_PAYMENT_PROOF_BYTES) {
      setProof(undefined);
      setError("Proof must be a PDF, JPG, PNG, WebP, HEIC or HEIF file up to 10 MB.");
      return;
    }
    setProof(file);
  }

  async function openProof(path: string) {
    setError("");
    try {
      const url = await getPaymentProofUrl(path);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.click();
    } catch {
      setError("Payment proof could not be opened.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Payments"
        title="Payment collection"
        description={
          currentRole === "packing"
            ? "Record payments for an existing customer and review your own collections."
            : "Record customer payments and review collections."
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Collect payment">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            {currentRole === "packing" ? (
              <Select
                label="Customer"
                required
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                <option value="">Select customer</option>
                {state.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </Select>
            ) : (
              <>
                <Input
                  label="Customer name"
                  required
                  list="payment-customer-suggestions"
                  value={form.customerName}
                  onChange={(event) => {
                    const customerName = event.target.value;
                    const match = state.customers.find(
                      (customer) => customer.name.toLowerCase() === customerName.trim().toLowerCase(),
                    );
                    setCustomerId(match?.id ?? "");
                    setForm((previous) => ({ ...previous, customerName }));
                  }}
                  placeholder="Type customer name"
                />
                <datalist id="payment-customer-suggestions">
                  {state.customers.map((customer) => (
                    <option key={customer.id} value={customer.name} />
                  ))}
                </datalist>
              </>
            )}
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
              id="payment-proof"
              label="Payment proof (optional)"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={(event) => chooseProof(event.target.files?.[0])}
            />
            {proof ? <p className="text-xs text-slate-500">Selected: {proof.name}</p> : null}
            <TextArea
              label="Notes"
              value={form.notes}
              onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
            />
            {error ? <p className="text-sm text-rose-700" role="alert">{error}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save payment"}
            </Button>
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
                {payment.proofPath ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void openProof(payment.proofPath!)}
                    >
                      {payment.proofFileName ?? "View payment proof"}
                    </Button>
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
