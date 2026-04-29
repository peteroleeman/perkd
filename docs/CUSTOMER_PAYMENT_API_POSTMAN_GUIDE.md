# Customer Payment API – Postman Guide

Call the Customer Payment endpoints through your server (e.g. perkd). The server forwards requests to SQL Accounting (api.sql.my) using credentials from `.env` or `sqlAccountCredentials.json`.

---

## Base URL

- **Server:** `http://localhost:8080` (or your host/port; default port **8080**)
- **Prefix:** `/sqlaccount`

**Full base:** `http://localhost:8080/sqlaccount`

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/customerpayment` | List customer payments (paginated) or get by docno |
| GET | `/customerpayment/:dockey` | Get one customer payment by dockey |
| POST | `/customerpayment` | Create a customer payment |
| PUT | `/customerpayment/:dockey` | Update a customer payment |
| DELETE | `/customerpayment/:dockey` | Delete a customer payment |

---

## How to call in Postman

### 1. List customer payments

- **Method:** `GET`
- **URL:** `http://localhost:8080/sqlaccount/customerpayment`
- **Query params (optional):**
  - `offset` – default `0`
  - `limit` – default `50`

Example:  
`http://localhost:8080/sqlaccount/customerpayment?offset=0&limit=10`

---

### 2. Get by docno

- **Method:** `GET`
- **URL:** `http://localhost:8080/sqlaccount/customerpayment`
- **Query params:** `docno=YOUR_DOCNO` or `docNo=YOUR_DOCNO`

Example:  
`http://localhost:8080/sqlaccount/customerpayment?docno=PMT-001`

---

### 3. Get by dockey

- **Method:** `GET`
- **URL:** `http://localhost:8080/sqlaccount/customerpayment/:dockey`

Replace `:dockey` with the document key (e.g. from a list response).

Example:  
`http://localhost:8080/sqlaccount/customerpayment/ABC123`

---

### 4. Create customer payment

- **Method:** `POST`
- **URL:** `http://localhost:8080/sqlaccount/customerpayment`
- **Headers:** `Content-Type: application/json`
- **Body:** Raw → JSON

Example body (adjust fields to match your SQL Accounting API):

```json
{
  "docno": "PMT-001",
  "docdate": "2025-02-27",
  "code": "CUST001",
  "docamt": "100.00",
  "description": "Payment against invoice"
}
```

---

### 5. Update customer payment

- **Method:** `PUT`
- **URL:** `http://localhost:8080/sqlaccount/customerpayment/:dockey`
- **Headers:** `Content-Type: application/json`
- **Body:** Raw → JSON (fields to update; server merges with existing record)

Use the `dockey` from a previous GET. The server will load the existing record and merge your body. The `code` field is removed on update.

---

### 6. Delete customer payment

- **Method:** `DELETE`
- **URL:** `http://localhost:8080/sqlaccount/customerpayment/:dockey`

Replace `:dockey` with the document key.

---

## Postman environment (optional)

- **Variable:** `baseUrl`
- **Value:** `http://localhost:8080/sqlaccount`

Then use `{{baseUrl}}/customerpayment` in the request URL.

---

## Checklist

1. Server is running (e.g. `node server.js`, default port 8080).
2. `.env` has `ACCESS_KEY` and `SECRET_KEY` (or use `sqlAccountCredentials.json`).
3. For POST/PUT: Body type = **raw**, format = **JSON**.
