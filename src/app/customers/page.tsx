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
    contactPerson: "",
    mobile: "",
    address: "",
    gst: "",
    notes: "",
    billingSource: "",
    externalCustomerId: "",
  });

  const filteredCustomers = useMemo(() => {
    const search = query.toLowerCase().trim();
    if (!search) return state.customers;

    return state.customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(search) ||
        customer.contactPerson.toLowerCase().includes(search) ||
        customer.mobile.includes(search),
    );
  }, [query, state.customers]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    createCustomer({
      ...form,
      gst: form.gst || undefined,
      notes: form.notes || undefined,
      billingSource: form.billingSource || undefined,
      externalCustomerId: form.externalCustomerId || undefined,
    });

    setForm({
      name: "",
      contactPerson: "",
      mobile: "",
      address: "",
      gst: "",
      notes: "",
      billingSource: "",
      externalCustomerId: "",
    });
  }

  if (!currentUser) return null;

  if (currentUser.role !== "admin") {
    return (
      <div className="space-y-5">
        <PageHeader
          eyebrow="Customers"
          title="Restricted"
          description="Only admin can create and edit customers."
        />
        <SectionCard title="Access limited">
          <EmptyState
            title="Customer management is for admin only"
            description="Packing and delivery users can still work with customer names inside order workflows."
          />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin"
        title="Customer module"
        description="Create customers and search instantly by name, contact person, or mobile."
      />

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard
          title="Create customer"
          description="This data stays independent from any billing system."
        >
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <Input
              label="Customer name"
              value={form.name}
              required
              onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
            />
            <Input
              label="Contact person"
              value={form.contactPerson}
              required
              onChange={(event) =>
                setForm((previous) => ({ ...previous, contactPerson: event.target.value }))
              }
            />
            <Input
              label="Mobile"
              value={form.mobile}
              required
              onChange={(event) => setForm((previous) => ({ ...previous, mobile: event.target.value }))}
            />
            <TextArea
              label="Address"
              value={form.address}
              required
              onChange={(event) => setForm((previous) => ({ ...previous, address: event.target.value }))}
            />
            <Input
              label="GST"
              value={form.gst}
              onChange={(event) => setForm((previous) => ({ ...previous, gst: event.target.value }))}
            />
            <Input
              label="Billing source"
              placeholder="Swipe, Odoo, Zoho, Tally"
              value={form.billingSource}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, billingSource: event.target.value }))
              }
            />
            <Input
              label="External customer ID"
              value={form.externalCustomerId}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  externalCustomerId: event.target.value,
                }))
              }
            />
            <TextArea
              label="Notes"
              value={form.notes}
              onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
            />
            <Button type="submit">Save customer</Button>
          </form>
        </SectionCard>

        <SectionCard
          title="Customer list"
          description="Search results update as you type."
        >
          <Input
            label="Instant search"
            placeholder="Search by name, person, or mobile"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          <div className="mt-4 space-y-3">
            {filteredCustomers.length ? (
              filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{customer.name}</p>
                      <p className="text-sm text-slate-600">
                        {customer.contactPerson} • {customer.mobile}
                      </p>
                    </div>
                    {customer.gst ? (
                      <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                        GST available
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{customer.address}</p>
                  {customer.notes ? (
                    <p className="mt-2 text-sm text-slate-500">{customer.notes}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState
                title="No matching customers"
                description="Try a different name, number, or contact person."
              />
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
