# Cash Sales API – Postman Guide

How to call the Cash Sales endpoints from Postman. The server proxies requests to SQL Accounting (api.sql.my) using credentials from environment variables or `sqlAccountCredentials.json`.

---

## 1. Prerequisites

- **Server running** – e.g. `node server.js` or `npm start` (default port **8080**).
- **Base URL** – `http://localhost:8080` (or your host/port).
- **Path prefix** – All Cash Sales routes are under `/sqlaccount`.

**Full base for Postman:**  
`http://localhost:8080/sqlaccount`

---

## 2. Endpoints Overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cashsales` | List cash sales (paginated) |
| GET | `/cashsales/:dockey` | Get one cash sale by `dockey` |
| POST | `/cashsales` | Create a cash sale (raw payload) |
| PUT | `/cashsales/:dockey` | Update a cash sale |
| DELETE | `/cashsales/:dockey` | Delete a cash sale |
| POST | `/cashsales/preview` | Preview payload (no API call) |
| POST | `/cashsales/sync` | Sync payload to SQL Accounting |
| POST | `/cashsales/fromorder` | Create cash sale from order (creates customer + cash sale) |
| PUT | `/cashsales/fromorder` | Update cash sale from order |

---

## 3. Step-by-Step in Postman

### 3.1 List cash sales (GET)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/cashsales`
- **Query params (optional):**
  - `offset` – default `0`
  - `limit` – default `50`

**Example URL:**  
`http://localhost:8080/sqlaccount/cashsales?offset=0&limit=10`

**Postman:** Params tab → add `offset` = `0`, `limit` = `10` (or leave empty for defaults).

---

### 3.2 Get one cash sale by dockey (GET)

- **Method:** `GET`
- **URL:** `{{baseUrl}}/cashsales/:dockey`

Replace `:dockey` with the document key (e.g. from the list response).

**Example URL:**  
`http://localhost:8080/sqlaccount/cashsales/ABC123`

---

### 3.3 Create cash sale – raw payload (POST)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/cashsales`
- **Headers:**  
  `Content-Type: application/json`
- **Body:** Raw JSON payload.

**Minimal body example (lineno is optional; server adds 1, 2, 3... if missing):**

```json
{
  "docno": "CS-001",
  "docdate": "2025-02-27",
  "postdate": "2025-02-27",
  "taxdate": "2025-02-27",
  "code": "CUST001",
  "attention": "Customer Name",
  "dattention": "Customer Name",
  "dphone1": "0123456789",
  "docamt": "100.00",
  "irbm_status": 0,
  "project": "My Store",
  "sdsdocdetail": [
    {
      "lineno": 1,
      "itemcode": "SKU001",
      "qty": "2.00",
      "disc": "0.00"
    },
    {
      "lineno": 2,
      "description": "Service charge",
      "qty": "1",
      "unitprice": "5.00"
    }
  ]
}
```

**Note:** If you get `"Could not convert variant of type (Null) into type (Integer)"`, ensure each line in `sdsdocdetail` has a numeric `lineno` (1-based), or omit it and let the server add it. The server also strips null values and coerces `irbm_status` to an integer.

**Postman:** Body → **raw** → type **JSON** → paste the JSON above (adjust values as needed).

---

### 3.4 Create cash sale from order (POST) – recommended for orders

Creates/updates the customer and then creates the cash sale using the same structure as the invoice payload (including line `disc`, receipt discount line, `project`).

- **Method:** `POST`
- **URL:** `{{baseUrl}}/cashsales/fromorder`
- **Headers:**  
  `Content-Type: application/json`
- **Body:** Object with an `order` property.

**Body example:**

```json
{
  "order": {
    "orderId": "ORD-001",
    "orderDateTime": 1730102400000,
    "storeTitle": "My Store",
    "totalPrice": "105.00",
    "totalServiceCharge": "5.00",
    "receiptDiscount": "0",
    "name": "John Doe",
    "userPhoneNumber": "0123456789",
    "orderItems": [
      {
        "sku": "SKU001",
        "qty": 2,
        "quantity": 2,
        "price": 50,
        "discount": "0.00"
      }
    ]
  }
}
```

**Postman:** Body → **raw** → **JSON** → paste and adjust `order` to match your order model.

---

### 3.5 Update cash sale from order (PUT)

- **Method:** `PUT`
- **URL:** `{{baseUrl}}/cashsales/fromorder`
- **Headers:**  
  `Content-Type: application/json`
- **Body:** Same as create-from-order, with optional `cancelled`.

**Body example:**

```json
{
  "order": {
    "orderId": "ORD-001",
    "storeTitle": "My Store",
    "name": "John Doe",
    "userPhoneNumber": "0123456789",
    "orderItems": [ ... ]
  },
  "cancelled": false
}
```

Set `cancelled: true` to mark the cash sale as cancelled.

---

### 3.6 Update cash sale by dockey (PUT)

- **Method:** `PUT`
- **URL:** `{{baseUrl}}/cashsales/:dockey`
- **Headers:**  
  `Content-Type: application/json`
- **Body:** Fields to update (server merges with existing record and increments `updatecount`).

Use when you have the `dockey` from a previous GET and want to patch specific fields.

---

### 3.7 Delete cash sale (DELETE)

- **Method:** `DELETE`
- **URL:** `{{baseUrl}}/cashsales/:dockey`

Replace `:dockey` with the document key.

---

### 3.8 Preview payload (POST)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/cashsales/preview`
- **Body:** Same shape as used for sync (e.g. order-mapped payload).

Returns the transformed payload only; does **not** call SQL Accounting.

---

### 3.9 Sync cash sale (POST)

- **Method:** `POST`
- **URL:** `{{baseUrl}}/cashsales/sync`
- **Body:** Payload in SQL format (e.g. from `mapReportOrderToSqlInvoice`). Optional `__headers` for custom headers.

Sends the payload to SQL Accounting.

---

## 4. Postman environment (optional)

Create an environment with:

- **Variable:** `baseUrl`  
- **Value:** `http://localhost:8080/sqlaccount`

Then use `{{baseUrl}}/cashsales` in the request URL.

---

## 5. Server-side requirements

- **SQL Accounting credentials** – Set `ACCESS_KEY` and `SECRET_KEY` in `.env`, or configure `sqlAccountCredentials.json` for per-store credentials.
- **Store ID** – For create/update from order, the app may use a default store or credentials from the order/store configuration.

---

## 6. Response and errors

- **Success (create):** `201` with `{ status: "created", data }`.
- **Success (update/delete):** `200` with `{ status: "updated"|"deleted", data }`.
- **From-order:** `201`/`200` with `{ success: true, data, cashSalesPayload, ... }` or `400`/`500` with `{ success: false, message }`.
- **Validation:** Missing body or required fields → `400` with a `message` describing what’s required.
- **Backend errors:** SQL API errors are returned with the appropriate status and error body from the server.

---

## 7. Quick checklist

1. Server running (e.g. port 8080).
2. URL = `http://localhost:8080/sqlaccount` + endpoint path.
3. For POST/PUT: Body = **raw**, type **JSON**.
4. Create from order: body = `{ "order": { ... } }`.
5. Create raw: body = full cash sale payload including `sdsdocdetail`, `docno`, `docdate`, `code`, etc.
