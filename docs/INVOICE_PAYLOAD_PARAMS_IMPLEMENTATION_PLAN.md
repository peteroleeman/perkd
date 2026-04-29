# Plan: Add Invoice Payload Parameters (Line Discount, Receipt Discount, Project)

Use this plan to add the same parameters to `buildInvoicePayloadFromOrder` (or equivalent invoice-builder) in another project.

---

## 1. Order / Order-item model requirements

Ensure your order model (or equivalent) exposes:

| Source | Field(s) | Type | Purpose |
|--------|----------|------|---------|
| **Order item** | `discount` (or `discountAmount`) | number or string | Per-line discount |
| **Order** | `receiptDiscount` or `receiptdiscount` | number or string | Receipt-level discount amount |
| **Order** | `storeTitle` or `storetitle` | string | Store name → payload `project` |

If names differ, map them when building the payload (see below).

---

## 2. Add line-level discount (`disc`) on each detail line

**Where:** In the loop that builds invoice detail lines from order items.

**Change:** Add a `disc` property to each line object.

- **Name:** `disc`
- **Value:** Discount from the order item, as a **string** with 2 decimal places.
- **Default:** `"0.00"` when discount is missing or invalid.

**Pattern:**

```javascript
// When building each lineItem from an order item:
const lineItem = {
  itemcode: sku,
  qty: parseFloat(item.qty || item.quantity || 1).toFixed(2),
  disc: (parseFloat(item.discount ?? 0) || 0).toFixed(2),   // add this
  // ... other fields (tax, etc.)
};
```

**Notes:**

- Use `item.discount` (or your project's field, e.g. `item.discountAmount`).
- `disc` must be a string (e.g. `"0.00"`, `"5.50"`).

---

## 3. Add receipt discount as a separate line item

**Where:** After the loop that adds order-item lines and after the "service charge" line (if any), before building the final payload.

**Logic:**

- Read receipt-level discount from the order (e.g. `receiptDiscount` / `receiptdiscount`).
- If the value is not zero, append **one** detail line with:
  - **Description:** `"Discount/Cash Voucher"`
  - **Amount:** **negative** (so it reduces the total).

**Pattern:**

```javascript
// After service charge (or after the order-items loop if no service charge)

// Discount/Cash Voucher: separate line item, negative amount
let receiptDiscountAmount = 0.0;
try {
  const receiptDiscountStr = order.receiptDiscount || order.receiptdiscount || '0';
  receiptDiscountAmount = parseFloat(receiptDiscountStr) || 0.0;
} catch (e) {
  // keep 0
}

if (receiptDiscountAmount !== 0) {
  sdsDocDetail.push({   // or your array name, e.g. docDetail / lineItems
    description: 'Discount/Cash Voucher',
    qty: '1',
    unitprice: (-receiptDiscountAmount).toFixed(2),
  });
}
```

**Notes:**

- Use the same structure as your "service charge" line (description, qty, unitprice) so the backend treats it the same way.
- Store the discount as a positive number on the order; negate it only when setting `unitprice`.

---

## 4. Add `project` to the top-level payload

**Where:** In the object that becomes the final invoice payload (e.g. `payload` or `invoicePayload`).

**Change:** Add a top-level property:

- **Name:** `project`
- **Value:** Order's store title (string). Use empty string if missing.

**Pattern:**

```javascript
const payload = {
  docno: order.orderId || order.orderid || '...',
  docdate: dateStr,
  // ... other existing fields ...
  project: order.storeTitle || order.storetitle || '',
};
```

**Notes:**

- Use the same field names your order model uses (`storeTitle` / `storetitle`).

---

## 5. Checklist for the other project

- [ ] **Order model** has (or is mapped to) `discount` per item, `receiptDiscount`/`receiptdiscount` and `storeTitle`/`storetitle` on the order.
- [ ] **Line items:** Each detail line has `disc` as a string, 2 decimals, default `"0.00"`.
- [ ] **Receipt discount:** One extra line when receipt discount ≠ 0, with `description: 'Discount/Cash Voucher'` and negative `unitprice`.
- [ ] **Payload:** Top-level `project` set from store title.
- [ ] **Naming:** If your API uses different keys (e.g. `lineItems` instead of `sdsdocdetail`, or `invoiceLines` instead of `sdsDocDetail`), keep the same logic but use your key names.

---

## 6. Quick reference: data flow

```
Order
├── orderItems[]
│   └── each item: sku, qty, quantity, discount → lineItem.disc
├── receiptDiscount / receiptdiscount → one line "Discount/Cash Voucher", negative unitprice
└── storeTitle / storetitle → payload.project

Detail lines array (e.g. sdsDocDetail):
  [ ...order item lines (with disc), service charge line?, receipt discount line? ]
```

Use this plan in the other project and adjust only the variable/array names and order model field names to match that codebase.
