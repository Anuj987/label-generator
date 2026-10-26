import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const parserPath = path.join(process.cwd(), "src/lib/whatsapp-order-parser.ts");
const compiled = ts.transpileModule(fs.readFileSync(parserPath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: parserPath,
});
const parserModule = { exports: {} };
new Function("require", "module", "exports", compiled.outputText)(require, parserModule, parserModule.exports);
const { parseWhatsAppOrder } = parserModule.exports;

const customers = [
  { name: "Veg Sagar" },
  { name: "BBC" },
  { name: "Zaika" },
  { name: "Royal Foods" },
  { name: "Royal Foods Pune" },
];

test("customer-first quantity-first message", () => {
  const draft = parseWhatsAppOrder("Veg Sagar 20 kg SSP2", customers);
  assert.equal(draft.customerName, "Veg Sagar");
  assert.deepEqual(draft.products, [{ productName: "SSP2", quantity: 20, unit: "kg" }]);
});

test("multiple products and decimal quantity", () => {
  const draft = parseWhatsAppOrder("BBC 5.5 kg SSP1 and 10 kg DP", customers);
  assert.equal(draft.customerName, "BBC");
  assert.deepEqual(draft.products.map(({ productName, quantity }) => ({ productName, quantity })), [
    { productName: "SSP1", quantity: 5.5 },
    { productName: "DP", quantity: 10 },
  ]);
});

test("product-first comma-separated grades remain distinct", () => {
  const draft = parseWhatsAppOrder("SSP1 10 kg, SSP2 5 kg", customers);
  assert.deepEqual(draft.products.map(({ productName, quantity }) => ({ productName, quantity })), [
    { productName: "SSP1", quantity: 10 },
    { productName: "SSP2", quantity: 5 },
  ]);
  assert.equal(draft.customerName, undefined);
});

test("clearly attached rate is extracted and missing selling price stays blank", () => {
  const draft = parseWhatsAppOrder("Zaika 20 kg BB @ 550", customers);
  assert.equal(draft.products[0].purchasePrice, 550);
  assert.equal(draft.products[0].sellingPrice, undefined);
  assert.match(draft.warnings.join(" "), /unlabelled rate 550.*Purchase Price, not Selling Price/i);
});

test("action text is not guessed as a customer and remaining text is flagged", () => {
  const draft = parseWhatsAppOrder("Send 10 kg LWP tomorrow", customers);
  assert.equal(draft.customerName, undefined);
  assert.equal(draft.products[0].productName, "LWP");
  assert.match(draft.warnings.join(" "), /tomorrow/i);
});

test("multiline labels, aliases and explicit prices", () => {
  const draft = parseWhatsAppOrder(
    "Customer: Veg Sagar\nSSP 1 0.25 kg purchase 450 selling 520\n2 kg Kaju Kani\nPriority: Very urgent",
    customers,
  );
  assert.equal(draft.customerName, "Veg Sagar");
  assert.equal(draft.priority, "very_urgent");
  assert.deepEqual(draft.products.map(({ productName, quantity }) => ({ productName, quantity })), [
    { productName: "SSP1", quantity: 0.25 },
    { productName: "KANI", quantity: 2 },
  ]);
  assert.equal(draft.products[0].purchasePrice, 450);
  assert.equal(draft.products[0].sellingPrice, 520);
});

test("all controlled grades and spacing aliases resolve exactly", () => {
  const message =
    "1 kg SSP, 1 kg ssp-1, 1 kg SSP 2, 1 kg SSP3, 1 kg DP, 1 kg DP 1, " +
    "1 kg BB, 1 kg BB1, 1 kg BB 2, 1 kg BB3, 1 kg BB4, 1 kg LWP, " +
    "1 kg SWP, 1 kg SWP1, 1 kg SWP 2, 1 kg KANI, 1 kg RAVA KANI, " +
    "1 kg W180, 1 kg W 210, 1 kg W-240, 1 kg W320";
  const draft = parseWhatsAppOrder(message, customers);
  assert.deepEqual(draft.products.map((product) => product.productName), [
    "SSP", "SSP1", "SSP2", "SSP3", "DP", "DP1", "BB", "BB1", "BB2", "BB3", "BB4",
    "LWP", "SWP", "SWP1", "SWP2", "KANI", "RAVA KANI", "W180", "W210", "W240", "W320",
  ]);
});

test("unknown grades are not mapped or discarded", () => {
  const draft = parseWhatsAppOrder("10 kg SSP4", customers);
  assert.equal(draft.products.length, 0);
  assert.match(draft.warnings.join(" "), /unknown product or grade/i);
  assert.match(draft.notes, /SSP4/);
});

test("ambiguous and unknown customer names require manual selection", () => {
  const ambiguous = parseWhatsAppOrder("Royal 2 kg DP", customers);
  const unknown = parseWhatsAppOrder("New Buyer 2 kg DP", customers);
  assert.equal(ambiguous.customerName, undefined);
  assert.match(ambiguous.warnings.join(" "), /ambiguous/i);
  assert.equal(unknown.customerName, undefined);
  assert.match(unknown.warnings.join(" "), /not matched/i);
});

test("parsing is pure draft extraction and exposes no create-order operation", () => {
  const draft = parseWhatsAppOrder("Veg Sagar 1 kg DP", customers);
  assert.equal(typeof parserModule.exports.createOrder, "undefined");
  assert.equal(draft.products.length, 1);
});

test("manual Create order workflow remains the only persistence path", () => {
  const ordersPage = fs.readFileSync(path.join(process.cwd(), "src/app/orders/page.tsx"), "utf8");
  assert.match(ordersPage, /<form className="grid gap-5" onSubmit=\{handleSubmit\}>/);
  assert.match(ordersPage, /const order = await createOrder\(/);
  assert.match(ordersPage, /type="button"[\s\S]*?onClick=\{prepareWhatsAppDraft\}/);
  assert.match(ordersPage, /Nothing is saved until you review the[\s\S]*?Create order/);
});
