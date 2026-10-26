import type { Priority } from "@/lib/types";

export type ParsedWhatsAppProduct = {
  productName: string;
  quantity: number;
  unit: string;
  purchasePrice?: number;
  sellingPrice?: number;
};

export type ParsedWhatsAppOrder = {
  customerName?: string;
  contactPerson?: string;
  mobile?: string;
  address?: string;
  invoiceNumber?: string;
  deliveryDate?: string;
  priority: Priority;
  notes?: string;
  products: ParsedWhatsAppProduct[];
  warnings: string[];
};

type CustomerReference = { name: string };

const PRODUCT_ALIASES: ReadonlyArray<[canonical: string, aliases: readonly string[]]> = [
  ["RAVA KANI", ["RAVA KANI"]],
  ["KANI", ["KAJU KANI", "KANI"]],
  ["SSP1", ["SSP1", "SSP 1", "SSP-1"]],
  ["SSP2", ["SSP2", "SSP 2", "SSP-2"]],
  ["SSP3", ["SSP3", "SSP 3", "SSP-3"]],
  ["SSP", ["SSP"]],
  ["DP1", ["DP1", "DP 1", "DP-1"]],
  ["DP", ["DP"]],
  ["BB1", ["BB1", "BB 1", "BB-1"]],
  ["BB2", ["BB2", "BB 2", "BB-2"]],
  ["BB3", ["BB3", "BB 3", "BB-3"]],
  ["BB4", ["BB4", "BB 4", "BB-4"]],
  ["BB", ["BB"]],
  ["LWP", ["LWP"]],
  ["SWP1", ["SWP1", "SWP 1", "SWP-1"]],
  ["SWP2", ["SWP2", "SWP 2", "SWP-2"]],
  ["SWP", ["SWP"]],
  ["W180", ["W180", "W 180", "W-180"]],
  ["W210", ["W210", "W 210", "W-210"]],
  ["W240", ["W240", "W 240", "W-240"]],
  ["W320", ["W320", "W 320", "W-320"]],
];

function normalizeProductToken(value: string) {
  return value.toUpperCase().replace(/[\s-]+/g, "");
}

const ALIAS_TO_PRODUCT = new Map(
  PRODUCT_ALIASES.flatMap(([canonical, aliases]) =>
    aliases.map((alias) => [normalizeProductToken(alias), canonical] as const),
  ),
);
const PRODUCT_PATTERN = PRODUCT_ALIASES.flatMap(([, aliases]) => aliases)
  .sort((a, b) => b.length - a.length)
  .map((alias) =>
    alias
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/[\s-]+/g, "[\\s-]*"),
  )
  .filter((alias, index, aliases) => aliases.indexOf(alias) === index)
  .join("|");
const UNIT_PATTERN = "kg|kgs|g|gm|gms|gram|grams|ltr|litre|litres|l|ml|pcs|pc|pieces|piece|box|boxes|bag|bags|packet|packets|pkt|pkts|unit|units";
const PRODUCT_EXPRESSION = new RegExp(
  `(?:(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})\\s*(?:of\\s+)?(${PRODUCT_PATTERN})(?![A-Z0-9])|(?<![A-Z0-9])(${PRODUCT_PATTERN})(?![A-Z0-9])\\s*[-–—,:]?\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN}))`,
  "gi",
);
const FIELD_PATTERN = /^(customer|customer name|contact|contact person|mobile|phone|address|invoice|invoice no|invoice number|delivery|delivery date|priority|note|notes)\s*[:=-]\s*(.+)$/i;
const PRODUCT_LIKE_PATTERN = new RegExp(`\\d+(?:\\.\\d+)?\\s*(?:${UNIT_PATTERN})\\b`, "i");

function normalizeCustomer(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizeUnit(unit: string) {
  const normalized = unit.toLowerCase();
  if (normalized === "kgs") return "kg";
  if (["gm", "gms", "gram", "grams"].includes(normalized)) return "g";
  if (["litre", "litres"].includes(normalized)) return "ltr";
  if (["pc", "piece", "pieces"].includes(normalized)) return "pcs";
  if (normalized === "boxes") return "box";
  if (normalized === "bags") return "bag";
  if (["packet", "packets", "pkts"].includes(normalized)) return "pkt";
  if (normalized === "units") return "unit";
  return normalized;
}

function parseDate(value: string) {
  const iso = value.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const indian = value.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/);
  if (!indian) return undefined;
  const [, day, month, year] = indian;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parsePriority(value: string): Priority {
  if (/very\s*urgent|most\s*urgent|immediate/i.test(value)) return "very_urgent";
  if (/urgent/i.test(value)) return "urgent";
  return "normal";
}

function addWarning(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function resolveCustomer(candidate: string, customers: readonly CustomerReference[], result: ParsedWhatsAppOrder) {
  const cleaned = candidate.replace(/^(?:order\s+(?:for|from)|from)\s+/i, "").trim();
  if (!cleaned || /^(?:send|please|need|want|order)$/i.test(cleaned)) return;
  if (!customers.length) {
    addWarning(result.warnings, `Select customer for: ${cleaned}`);
    return;
  }
  const normalized = normalizeCustomer(cleaned);
  const exact = customers.filter((customer) => normalizeCustomer(customer.name) === normalized);
  if (exact.length === 1) {
    result.customerName = exact[0].name;
    result.contactPerson ||= exact[0].name;
    return;
  }
  const possible = customers.filter((customer) => {
    const name = normalizeCustomer(customer.name);
    return name.includes(normalized) || normalized.includes(name);
  });
  if (possible.length === 1 && normalized.length >= 4) {
    result.customerName = possible[0].name;
    result.contactPerson ||= possible[0].name;
    return;
  }
  addWarning(
    result.warnings,
    possible.length > 1
      ? `Customer “${cleaned}” is ambiguous. Select the customer manually.`
      : `Customer “${cleaned}” was not matched. Select the customer manually.`,
  );
}

function extractProducts(
  line: string,
  customers: readonly CustomerReference[],
  result: ParsedWhatsAppOrder,
  noteLines: string[],
) {
  const matches = [...line.matchAll(new RegExp(PRODUCT_EXPRESSION.source, "gi"))];
  if (!matches.length) return false;
  const consumed: Array<[number, number]> = [];

  matches.forEach((match, index) => {
    const quantity = Number(match[1] ?? match[5]);
    const unit = normalizeUnit(match[2] ?? match[6]);
    const canonical = ALIAS_TO_PRODUCT.get(normalizeProductToken(match[3] ?? match[4]));
    if (!canonical || !Number.isFinite(quantity) || quantity <= 0) return;
    const product: ParsedWhatsAppProduct = { productName: canonical, quantity, unit };
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const nextStart = matches[index + 1]?.index ?? line.length;
    const tail = line.slice(end, nextStart);
    const purchase = tail.match(/(?:^|[\s,;|])(?:@|rate\s*[:=@-]?|purchase(?:\s+price)?\s*[:=@-]?|cost\s*[:=@-]?)\s*(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)/i);
    const selling = tail.match(/(?:^|[\s,;|])(?:selling|sell)(?:\s+price)?\s*[:=@-]?\s*(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)/i);
    if (purchase) {
      product.purchasePrice = Number(purchase[1]);
      if (purchase[0].trim().startsWith("@")) {
        addWarning(
          result.warnings,
          `Review unlabelled rate ${purchase[1]} for ${canonical}; it was placed in Purchase Price, not Selling Price.`,
        );
      }
    }
    if (selling) product.sellingPrice = Number(selling[1]);
    result.products.push(product);
    consumed.push([start, end]);
    if (purchase?.index !== undefined) consumed.push([end + purchase.index, end + purchase.index + purchase[0].length]);
    if (selling?.index !== undefined) consumed.push([end + selling.index, end + selling.index + selling[0].length]);
  });

  const firstStart = matches[0].index ?? 0;
  const prefix = line.slice(0, firstStart).replace(/^(?:send|please send|need|want)\s+/i, "").trim();
  if (prefix && !result.customerName) resolveCustomer(prefix, customers, result);
  if (firstStart > 0) consumed.push([0, firstStart]);
  let remainder = line;
  for (const [start, end] of consumed.sort((a, b) => b[0] - a[0])) {
    remainder = `${remainder.slice(0, start)} ${remainder.slice(end)}`;
  }
  remainder = remainder
    .replace(/\b(?:and|also|plus|send|please|order)\b/gi, " ")
    .replace(/[,&;+|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (remainder) {
    noteLines.push(remainder);
    addWarning(result.warnings, `Review unrecognised text: ${remainder}`);
  }
  return true;
}

export function parseWhatsAppOrder(message: string, customers: readonly CustomerReference[] = []): ParsedWhatsAppOrder {
  const lines = message.split(/\r?\n/).map((line) => line.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
  const result: ParsedWhatsAppOrder = { priority: parsePriority(message), products: [], warnings: [] };
  const noteLines: string[] = [];

  for (const line of lines) {
    const field = line.match(FIELD_PATTERN);
    if (field) {
      const key = field[1].toLowerCase();
      const value = field[2].trim();
      if (key === "customer" || key === "customer name") resolveCustomer(value, customers, result);
      else if (key === "contact" || key === "contact person") result.contactPerson = value;
      else if (key === "mobile" || key === "phone") result.mobile = value;
      else if (key === "address") result.address = value;
      else if (key.startsWith("invoice")) result.invoiceNumber = value;
      else if (key.startsWith("delivery")) {
        result.deliveryDate = parseDate(value);
        if (!result.deliveryDate) addWarning(result.warnings, `Check delivery date: ${value}`);
      } else if (key === "priority") result.priority = parsePriority(value);
      else noteLines.push(value);
      continue;
    }
    if (extractProducts(line, customers, result, noteLines)) continue;
    if (PRODUCT_LIKE_PATTERN.test(line)) {
      noteLines.push(line);
      addWarning(result.warnings, `Unknown product or grade: ${line}`);
      continue;
    }
    if (!result.customerName && !/\b(?:urgent|tomorrow|today)\b/i.test(line)) {
      resolveCustomer(line, customers, result);
      continue;
    }
    noteLines.push(line);
    addWarning(result.warnings, `Review unrecognised text: ${line}`);
  }
  result.notes = noteLines.length ? noteLines.join("\n") : undefined;
  if (!result.customerName) addWarning(result.warnings, "Select a customer before creating the order.");
  if (!result.products.length) addWarning(result.warnings, "No recognised product lines were detected.");
  return result;
}

export const SUPPORTED_WHATSAPP_PRODUCTS = PRODUCT_ALIASES.map(([canonical]) => canonical);
