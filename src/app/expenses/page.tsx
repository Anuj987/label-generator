"use client";

import { FormEvent, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useAppContext } from "@/components/providers/app-provider";
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  PhotoThumbGrid,
  SectionCard,
  Select,
  StatCard,
  TextArea,
} from "@/components/ui";
import { EXPENSE_CATEGORIES, todayDateString } from "@/lib/demo-data";
import { buildExpensesCsv, downloadCsv, stampFilename } from "@/lib/export-data";
import {
  errorMessage,
  fileToCompressedDataUrl,
  formatCurrency,
  formatDate,
} from "@/lib/storage";
import type { ExpenseCategory } from "@/lib/types";

function monthPrefix(day = new Date()) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
}

export default function ExpensesPage() {
  const { currentUser, createExpense, state } = useAppContext();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    expenseDate: todayDateString(),
    category: "Fuel" as ExpenseCategory,
    description: "",
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [personFilter, setPersonFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const isAdmin = currentUser?.role === "admin";

  const visibleExpenses = useMemo(() => {
    if (!currentUser) return [];
    return state.expenses.filter((expense) => {
      if (!isAdmin && expense.submittedBy !== currentUser.id) return false;
      if (isAdmin && personFilter !== "all" && expense.submittedBy !== personFilter) return false;
      if (categoryFilter !== "all" && expense.category !== categoryFilter) return false;
      if (dateFrom && expense.expenseDate < dateFrom) return false;
      if (dateTo && expense.expenseDate > dateTo) return false;
      return true;
    });
  }, [categoryFilter, currentUser, dateFrom, dateTo, isAdmin, personFilter, state.expenses]);

  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const expense of state.expenses) {
      map.set(expense.submittedBy, expense.submittedByName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [state.expenses]);

  const totals = useMemo(() => {
    const today = todayDateString();
    const month = monthPrefix();
    const scoped = isAdmin
      ? state.expenses
      : state.expenses.filter((expense) => expense.submittedBy === currentUser?.id);
    return {
      all: scoped.reduce((sum, expense) => sum + expense.amount, 0),
      today: scoped
        .filter((expense) => expense.expenseDate === today)
        .reduce((sum, expense) => sum + expense.amount, 0),
      month: scoped
        .filter((expense) => expense.expenseDate.startsWith(month))
        .reduce((sum, expense) => sum + expense.amount, 0),
      filtered: visibleExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    };
  }, [currentUser?.id, isAdmin, state.expenses, visibleExpenses]);

  if (!currentUser) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.amount || !form.expenseDate || !form.category) return;

    setError(null);
    setSaving(true);
    try {
      const receipt = receiptFile
        ? {
            name: receiptFile.name.replace(/\.\w+$/, "") + ".jpg",
            dataUrl: await fileToCompressedDataUrl(receiptFile),
          }
        : undefined;

      await createExpense({
        amount: Number(form.amount),
        expenseDate: form.expenseDate,
        category: form.category,
        description: form.description.trim() || undefined,
        receipt,
      });

      setForm({
        amount: "",
        expenseDate: todayDateString(),
        category: "Fuel",
        description: "",
      });
      setReceiptFile(null);
    } catch (err) {
      setError(errorMessage(err, "Failed to save expense"));
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    downloadCsv(stampFilename("expenses"), buildExpensesCsv(visibleExpenses));
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Expenses"
        title="Staff expenses"
        description={
          isAdmin
            ? "Record expenses and review everyone’s submissions."
            : "Record your expenses. You can only see your own entries."
        }
      />

      {isAdmin ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Total (all)" value={formatCurrency(totals.all)} />
          <StatCard label="Today" value={formatCurrency(totals.today)} />
          <StatCard label="This month" value={formatCurrency(totals.month)} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="My total" value={formatCurrency(totals.all)} />
          <StatCard label="My expenses today" value={formatCurrency(totals.today)} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Add expense">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Amount"
                type="number"
                min="1"
                step="0.01"
                required
                value={form.amount}
                onChange={(event) => setForm((previous) => ({ ...previous, amount: event.target.value }))}
              />
              <Input
                label="Date"
                type="date"
                required
                value={form.expenseDate}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, expenseDate: event.target.value }))
                }
              />
            </div>
            <Select
              label="Category"
              required
              value={form.category}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  category: event.target.value as ExpenseCategory,
                }))
              }
            >
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
            <TextArea
              label="Description / notes (optional)"
              value={form.description}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, description: event.target.value }))
              }
              rows={3}
            />
            <Input
              label="Receipt / photo (optional)"
              type="file"
              accept="image/*"
              onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
            />
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save expense"}
            </Button>
          </form>
        </SectionCard>

        <SectionCard
          title="Expense list"
          description={
            isAdmin
              ? `${visibleExpenses.length} shown · filtered total ${formatCurrency(totals.filtered)}`
              : `${visibleExpenses.length} of your expenses`
          }
          actions={
            isAdmin ? (
              <Button variant="secondary" onClick={exportCsv}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            ) : null
          }
        >
          {isAdmin ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <Select
                label="Person"
                value={personFilter}
                onChange={(event) => setPersonFilter(event.target.value)}
              >
                <option value="all">All people</option>
                {people.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
              <Select
                label="Category"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">All categories</option>
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
              <Input
                label="From date"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
              <Input
                label="To date"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
          ) : null}

          <div className="space-y-3">
            {visibleExpenses.map((expense) => (
              <div
                key={expense.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {formatCurrency(expense.amount)} · {expense.category}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatDate(expense.expenseDate)} · {expense.submittedByName}
                      {expense.receiptPath || expense.receiptPreviewUrl ? " · Receipt attached" : ""}
                    </p>
                    {expense.description ? (
                      <p className="mt-1 text-sm text-slate-500">{expense.description}</p>
                    ) : null}
                  </div>
                </div>
                {expense.receiptPreviewUrl ? (
                  <div className="mt-3">
                    <PhotoThumbGrid
                      items={[
                        {
                          id: `${expense.id}-receipt`,
                          src: expense.receiptPreviewUrl,
                          title: expense.receiptFileName || "Receipt",
                        },
                      ]}
                    />
                  </div>
                ) : null}
              </div>
            ))}
            {!visibleExpenses.length ? (
              <EmptyState title="No expenses yet" description="Add an expense using the form." />
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
