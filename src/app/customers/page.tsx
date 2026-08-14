"use client";

import { FormEvent, useMemo, useState } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  SectionCard,
  TextArea,
} from "@/components/ui";

export default function CustomersPage() {
  const { createCustomer, currentUser, state } = useAppContext();
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    gst: "",
    notes: "",
  });

  const filtered = useMemo(() => {
    const search = query.toLowerCase().trim();
    const list = [...state.customers].sort((a, b) => a.name.localeCompare(b.name));
    if (!search) return list;
    return list.filter(
      (customer) =>
        customer.name.toLowerCase().includes(search) ||
        (customer.mobile ?? "").includes(search) ||
        (customer.gst ?? "").toLowerCase().includes(search),
    );
  }, [query, state.customers]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createCustomer({
      name: form.name,
      mobile: form.mobile || undefined,
      gst: form.gst || undefined,
      notes: form.notes || undefined,
    });
    setForm({ name: "", mobile: "", gst: "", notes: "" });
  }

  if (!currentUser) return null;

  if (currentUser.role !== "admin") {
    return (
      <div className="space-y-5">
        <PageHeader title="Customers" description="Admin only." />
        <EmptyState title="Restricted" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Directory"
        title="Customers"
        description="Imported from your list. Add new names anytime. Orders still let you type the name each time."
      />

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Add customer" description="New names are available for quick pick on orders.">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <Input
              label="Customer name"
              required
              value={form.name}
              onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
            />
            <Input
              label="Mobile"
              value={form.mobile}
              onChange={(event) => setForm((previous) => ({ ...previous, mobile: event.target.value }))}
            />
            <Input
              label="GST"
              value={form.gst}
              onChange={(event) => setForm((previous) => ({ ...previous, gst: event.target.value }))}
            />
            <TextArea
              label="Notes"
              value={form.notes}
              onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
            />
            <Button type="submit">Save customer</Button>
          </form>
        </SectionCard>

        <SectionCard title={`Customer list (${filtered.length})`} description="Search by name, mobile, or GST.">
          <Input
            label="Search"
            placeholder="Patel Brothers, 70211..., GSTIN..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="mt-4 max-h-[70vh] space-y-2 overflow-auto">
            {filtered.map((customer) => (
              <div
                key={customer.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <p className="font-semibold text-slate-950">{customer.name}</p>
                <p className="text-sm text-slate-600">
                  {[customer.mobile, customer.gst].filter(Boolean).join(" · ") || "No mobile / GST"}
                </p>
                {customer.notes ? <p className="mt-1 text-sm text-slate-500">{customer.notes}</p> : null}
              </div>
            ))}
            {!filtered.length ? <EmptyState title="No matching customers" /> : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
