"use client";

import { FormEvent, useMemo, useState } from "react";
import { useAppContext } from "@/components/providers/app-provider";
import { Button, EmptyState, Input, PageHeader, SectionCard, Select, TextArea } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/storage";
import type { ExpenseCategory } from "@/lib/types";

const CATEGORIES: ExpenseCategory[] = [
  "Fuel",
  "Transport",
  "Food",
  "Packing Material",
  "Loading/Unloading",
  "Other",
];

const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export default function ExpensesPage() {
  const { addExpense, currentUser, getExpenseReceiptUrl, state } = useAppContext();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("Fuel");
  const [note, setNote] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [receipt, setReceipt] = useState<File>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const visibleExpenses = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "admin") return state.expenses;
    if (currentUser.role === "delivery") {
      return state.expenses.filter((expense) => expense.submittedBy === currentUser.id);
    }
    return [];
  }, [currentUser, state.expenses]);

  if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "delivery")) {
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;

    setPending(true);
    setError("");
    try {
      await addExpense({
        amount: numericAmount,
        category,
        note: note || undefined,
        expenseDate,
        receipt,
      });
      setAmount("");
      setCategory("Fuel");
      setNote("");
      setExpenseDate(new Date().toISOString().slice(0, 10));
      setReceipt(undefined);
      const fileInput = document.getElementById("expense-receipt") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    } catch {
      setError("Expense could not be saved. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function chooseReceipt(file?: File) {
    setError("");
    if (!file) {
      setReceipt(undefined);
      return;
    }
    if (!RECEIPT_TYPES.includes(file.type) || file.size > MAX_RECEIPT_BYTES) {
      setReceipt(undefined);
      setError("Receipt must be a JPG, PNG, WebP, HEIC or HEIF image up to 5 MB.");
      return;
    }
    setReceipt(file);
  }

  async function openReceipt(path: string) {
    setError("");
    try {
      const url = await getExpenseReceiptUrl(path);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.click();
    } catch {
      setError("Receipt could not be opened.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Expenses"
        title={currentUser.role === "admin" ? "Staff expenses" : "My expenses"}
        description={
          currentUser.role === "admin"
            ? "View expenses submitted by all staff."
            : "Add an expense and review only your own submissions."
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <SectionCard title="Add expense">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <Input
                label="Expense date"
                type="date"
                required
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
              />
            </div>
            <Select
              label="Category"
              value={category}
              onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>
            <TextArea label="Note" value={note} onChange={(event) => setNote(event.target.value)} />
            <Input
              id="expense-receipt"
              label="Receipt (optional)"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={(event) => chooseReceipt(event.target.files?.[0])}
            />
            {receipt ? <p className="text-xs text-slate-500">Selected: {receipt.name}</p> : null}
            {error ? <p className="text-sm text-rose-700" role="alert">{error}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save expense"}
            </Button>
          </form>
        </SectionCard>

        <SectionCard title={currentUser.role === "admin" ? "All expenses" : "My expenses"}>
          <div className="space-y-3">
            {visibleExpenses.map((expense) => (
              <div key={expense.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{formatCurrency(expense.amount)}</p>
                    <p className="text-sm text-slate-600">
                      {expense.category} · {formatDate(expense.expenseDate)}
                    </p>
                    {currentUser.role === "admin" ? (
                      <p className="mt-1 text-xs text-slate-500">Submitted by {expense.submittedByName}</p>
                    ) : null}
                    {expense.note ? <p className="mt-2 text-sm text-slate-700">{expense.note}</p> : null}
                  </div>
                  {expense.receiptPath ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void openReceipt(expense.receiptPath!)}
                    >
                      Receipt
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            {!visibleExpenses.length ? <EmptyState title="No expenses yet" /> : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
