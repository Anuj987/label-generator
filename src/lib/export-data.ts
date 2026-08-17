import { PRIORITY_LABELS, STATUS_LABELS, totalPurchaseCost, totalQuantity } from "@/lib/demo-data";
import type { Expense, Order, Payment } from "@/lib/types";

function escapeCsv(value: string | number | undefined | null) {
  const text = value === undefined || value === null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers: string[], rows: Array<Array<string | number | undefined | null>>) {
  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ];
  // UTF-8 BOM helps Excel on Windows open Hindi/special characters correctly.
  return `\uFEFF${lines.join("\r\n")}`;
}

export function buildOrdersCsv(orders: Order[]) {
  const headers = [
    "Order Number",
    "Invoice Number",
    "Invoice Date",
    "Delivery Date",
    "Customer Name",
    "Contact Person",
    "Mobile",
    "Address",
    "GST",
    "Priority",
    "Status",
    "Product Count",
    "Total Qty",
    "Total Purchase Cost",
    "Notes",
    "Created By",
    "Created At",
    "Accepted By",
    "Packing Start",
    "Packing Completed",
    "Packing Duration (min)",
    "Delivery Start",
    "Delivery Completed",
    "Return Reason",
    "Delivery Notes",
  ];

  const rows = orders.map((order) => [
    order.orderNumber,
    order.invoiceNumber,
    order.invoiceDate,
    order.deliveryDate,
    order.customerName,
    order.contactPerson,
    order.mobile,
    order.address,
    order.gst ?? "",
    PRIORITY_LABELS[order.priority],
    STATUS_LABELS[order.status],
    order.products.length,
    totalQuantity(order.products),
    totalPurchaseCost(order.products),
    order.notes ?? "",
    order.createdBy,
    order.createdAt,
    order.acceptedBy ?? "",
    order.packingStartTime ?? "",
    order.packingCompletedTime ?? "",
    order.packingDurationMinutes ?? "",
    order.deliveryStartTime ?? "",
    order.deliveryCompletedTime ?? "",
    order.returnReason ?? "",
    order.deliveryOutcomeNotes ?? "",
  ]);

  return toCsv(headers, rows);
}

export function buildOrderProductsCsv(orders: Order[]) {
  const headers = [
    "Order Number",
    "Invoice Number",
    "Customer Name",
    "Delivery Date",
    "Status",
    "Product Name",
    "Description",
    "Quantity",
    "Unit",
    "Purchase Price",
    "Line Purchase Cost",
  ];

  const rows = orders.flatMap((order) =>
    order.products.map((product) => {
      const purchasePrice = product.purchasePrice ?? "";
      const lineCost =
        product.purchasePrice !== undefined
          ? product.purchasePrice * product.quantity
          : "";
      return [
        order.orderNumber,
        order.invoiceNumber,
        order.customerName,
        order.deliveryDate,
        STATUS_LABELS[order.status],
        product.productName,
        product.description ?? "",
        product.quantity,
        product.unit,
        purchasePrice,
        lineCost,
      ];
    }),
  );

  return toCsv(headers, rows);
}

export function buildPaymentsCsv(payments: Payment[], orders: Order[]) {
  const orderById = new Map(orders.map((order) => [order.id, order]));

  const headers = [
    "Payment Date",
    "Customer Name",
    "Invoice Number",
    "Invoice Date",
    "Amount",
    "Mode",
    "Linked Order",
    "Collected By",
    "Notes",
  ];

  const rows = payments.map((payment) => [
    payment.createdAt,
    payment.customerName,
    payment.invoiceNumber,
    payment.invoiceDate,
    payment.amount,
    payment.mode,
    payment.orderId ? (orderById.get(payment.orderId)?.orderNumber ?? payment.orderId) : "",
    payment.collectedBy,
    payment.notes ?? "",
  ]);

  return toCsv(headers, rows);
}

export function buildExpensesCsv(expenses: Expense[]) {
  const headers = ["Date", "Person", "Category", "Amount", "Description"];
  const rows = expenses.map((expense) => [
    expense.expenseDate,
    expense.submittedByName,
    expense.category,
    expense.amount,
    expense.description ?? "",
  ]);
  return toCsv(headers, rows);
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function stampFilename(prefix: string) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  return `${prefix}-${stamp}.csv`;
}
