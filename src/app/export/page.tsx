"use client";

import { Download } from "lucide-react";
import { useAppContext } from "@/components/providers/app-provider";
import { Button, EmptyState, PageHeader, SectionCard } from "@/components/ui";
import {
  buildOrderProductsCsv,
  buildOrdersCsv,
  buildPaymentsCsv,
  downloadCsv,
  stampFilename,
} from "@/lib/export-data";

export default function ExportPage() {
  const { currentUser, state } = useAppContext();

  if (!currentUser) return null;

  if (currentUser.role !== "admin") {
    return (
      <div className="space-y-5">
        <PageHeader title="Export" description="Admin can download Excel files." />
        <EmptyState title="Restricted" description="Only Admin can export orders and payments." />
      </div>
    );
  }

  function downloadOrders() {
    downloadCsv(stampFilename("orders"), buildOrdersCsv(state.orders));
  }

  function downloadProducts() {
    downloadCsv(stampFilename("order-products"), buildOrderProductsCsv(state.orders));
  }

  function downloadPayments() {
    downloadCsv(stampFilename("payments"), buildPaymentsCsv(state.payments, state.orders));
  }

  function downloadAll() {
    downloadOrders();
    window.setTimeout(downloadProducts, 250);
    window.setTimeout(downloadPayments, 500);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Export to Excel"
        description="Download CSV files that open directly in Excel. Includes purchase price on order exports."
      />

      <SectionCard
        title="Quick download"
        description={`${state.orders.length} orders · ${state.payments.length} payments`}
      >
        <div className="flex flex-wrap gap-3">
          <Button onClick={downloadAll}>
            <Download className="mr-2 h-4 w-4" />
            Download all
          </Button>
          <Button variant="secondary" onClick={downloadOrders}>
            Orders
          </Button>
          <Button variant="secondary" onClick={downloadProducts}>
            Order products
          </Button>
          <Button variant="secondary" onClick={downloadPayments}>
            Payments
          </Button>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Orders file" description="One row per order with status, dates, totals.">
          <p className="mb-4 text-sm text-slate-600">
            Customer, invoice, delivery date, status, total purchase cost, packing and delivery
            times.
          </p>
          <Button variant="secondary" onClick={downloadOrders}>
            <Download className="mr-2 h-4 w-4" />
            Download orders.csv
          </Button>
        </SectionCard>

        <SectionCard
          title="Order products file"
          description="One row per product line for detailed purchase cost."
        >
          <p className="mb-4 text-sm text-slate-600">
            Product name, description, qty, unit, purchase price, and line cost linked to each
            order.
          </p>
          <Button variant="secondary" onClick={downloadProducts}>
            <Download className="mr-2 h-4 w-4" />
            Download order-products.csv
          </Button>
        </SectionCard>

        <SectionCard title="Payments file" description="All collected payments for Excel analysis.">
          <p className="mb-4 text-sm text-slate-600">
            Amount, mode, invoice, customer, collector, and linked order number when available.
          </p>
          <Button variant="secondary" onClick={downloadPayments}>
            <Download className="mr-2 h-4 w-4" />
            Download payments.csv
          </Button>
        </SectionCard>
      </div>
    </div>
  );
}
