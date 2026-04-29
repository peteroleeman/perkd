# How to Use: CheckUser API from Postman

This guide shows how to call the **CheckUser** endpoint from Postman. The API checks if a user exists by phone number and either adds loyalty points to the user or saves them as pending. A **verification token** is required; you can send it in the **Authorization** header or in the request body.

---

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Get the verification token](#step-1-get-the-verification-token)
3. [Call CheckUser](#step-2-call-checkuser)
4. [Responses](#step-3-understand-the-response)
5. [Troubleshooting](#troubleshooting)
6. [Quick reference](#quick-reference)

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Server** | Running on port **8080** (or your configured port). |
| **Postman** | [Download](https://www.postman.com/downloads/) if needed. |
| **Base URL** | Local: `http://localhost:8080` — or your deployed URL. |

Start the server:

```bash
cd "c:\Users\choonlee\myTestProject\perkd - Copy"
node server.js
```

Wait for: `Magic happens on port 8080`.

---

## Step 1: Get the verification token

The token is computed from `storeId` and `phoneNumber`. Use the **Generate Token** endpoint to get it.

1. In Postman, create a new request.
2. Set **Method** to `POST` and **URL** to:
   ```
   http://localhost:8080/user/generatetoken
   ```
3. Open **Body** → **raw** → **JSON**.
4. Use the same `storeId` and `phoneNumber` you will use for CheckUser:

```json
{
  "storeId": "STORE001",
  "phoneNumber": "60123456789"
}
```

5. Click **Send**.
6. From the response, copy the **token** value:

```json
{
  "success": true,
  "token": "a1b2c3d4e5f6..."
}
```

You will use this value either in the **Authorization** header or in the body as **verificationToken** when calling CheckUser.

---

## Step 2: Call CheckUser

### 2.1 Method and URL

| Field    | Value |
|----------|--------|
| **Method** | `POST` |
| **URL**    | `http://localhost:8080/user/checkuser` |

### 2.2 Headers

| Key           | Value             |
|---------------|-------------------|
| Content-Type  | application/json  |

If you send the token in the **header** (Option A below), also add:

| Key             | Value              |
|-----------------|--------------------|
| Authorization   | Bearer \<your-token\> |

Replace \<your-token\> with the token from Step 1 (no quotes, one space after `Bearer`).

### 2.3 Body parameters

| Parameter         | Type   | Required | Description |
|-------------------|--------|----------|-------------|
| phoneNumber       | string | Yes      | User phone number (e.g. `60123456789` or `+60123456789`). |
| points            | number | Yes      | Points to add or save as pending (positive number). |
| storeId           | string | Yes      | Store identifier. |
| orderId           | string | Yes      | Order identifier (used when saving pending points). |
| verificationToken | string | Yes*     | Token from Step 1. Use this **or** the Authorization header. |
| token             | string | Yes*     | Same as `verificationToken`; either name is accepted. |

\* **Token:** You must send the token in one of these ways:
- **Option A:** Header `Authorization: Bearer <token>` (then body does not need `verificationToken`).
- **Option B:** Body field `verificationToken` or `token` (then header is optional).

### 2.4 Example: Token in body (Option B)

**Headers:** Only `Content-Type: application/json`.

**Body (raw, JSON):**

```json
{
  "phoneNumber": "60123456789",
  "points": 10,
  "storeId": "STORE001",
  "orderId": "ORD123",
  "verificationToken": "a1b2c3d4e5f6..."
}
```

Replace `a1b2c3d4e5f6...` with the token from Step 1.

### 2.5 Example: Token in header (Option A)

**Headers:** `Content-Type: application/json` and `Authorization: Bearer a1b2c3d4e5f6...`

**Body (raw, JSON):**

```json
{
  "phoneNumber": "60123456789",
  "points": 10,
  "storeId": "STORE001",
  "orderId": "ORD123"
}
```

### 2.6 Send the request

Click **Send** in Postman.

---

## Step 3: Understand the response

### User exists — points added

**Status:** `200 OK`

```json
{
  "success": true,
  "userExists": true,
  "message": "User exists; points added",
  "phoneNumber": "60123456789",
  "userId": "FU_60123456789",
  "pointsAdded": 10,
  "storeId": "STORE001",
  "orderId": "ORD123",
  "loyaltyPoints": { "STORE001": 110 },
  "storeLoyaltyPoints": 110
}
```

### User does not exist — points saved as pending

**Status:** `200 OK`

```json
{
  "success": true,
  "userExists": false,
  "message": "User does not exist; points saved as pending",
  "phoneNumber": "60123456789",
  "pointsSavedAsPending": 10,
  "storeId": "STORE001",
  "orderId": "ORD123",
  "loyaltyPoints": {}
}
```

### Validation error (missing or invalid field)

**Status:** `400 Bad Request`

Example (missing `storeId`):

```json
{
  "success": false,
  "message": "storeId is required"
}
```

Other possible messages:
- `"Phone number is required"`
- `"Phone number cannot be empty"`
- `"points is required and must be a positive number"`
- `"storeId is required"`
- `"orderId is required"`
- `"Store ID and Phone Number are required in request body"` (token step runs first and needs both in body)

### Token missing or invalid

**Status:** `401 Unauthorized`

```json
{
  "success": false,
  "message": "Unauthorized: Invalid token for the given store and phone number"
}
```

Check:
- Token is sent via **Authorization: Bearer \<token\>** or **verificationToken** / **token** in the body.
- Token was generated with the **same** `storeId` and `phoneNumber` as in the CheckUser body.
- Regenerate the token with Generate Token and use the new value.

### Pending points save failed

**Status:** `500 Internal Server Error`

```json
{
  "success": false,
  "message": "Failed to save pending points"
}
```

Usually means the order was not found. Ensure `orderId` exists in Firestore under `store/{storeId}/order/{orderId}` or `myreport/{storeId}/order/{orderId}`.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Connection refused / no response | Server not running. Run `node server.js`. Confirm port (e.g. 8080) and base URL. |
| 404 Not Found | URL must be `http://localhost:8080/user/checkuser` (path is case-sensitive). |
| 400 – "storeId is required" | Include non-empty `storeId` in the JSON body. |
| 400 – "orderId is required" | Include non-empty `orderId` in the JSON body. |
| 400 – "points is required..." | Include `points` as a positive number in the body. |
| 400 – "Store ID and Phone Number are required" | Token validation runs first; ensure `storeId` and `phoneNumber` are both in the body. |
| 401 – "Unauthorized: Invalid token..." | Send token via **Authorization: Bearer \<token\>** header **or** **verificationToken** (or **token**) in body. Token must come from `POST /user/generatetoken` with the same `storeId` and `phoneNumber`. |
| 500 – "Failed to save pending points" | User does not exist and order not found. Ensure `orderId` exists for `storeId` in Firestore. |

---

## Quick reference

| Item | Value |
|------|--------|
| **Endpoint** | `POST /user/checkuser` |
| **Full URL (local)** | `http://localhost:8080/user/checkuser` |
| **Generate Token URL** | `POST http://localhost:8080/user/generatetoken` |
| **Headers** | `Content-Type: application/json`; if using header auth: `Authorization: Bearer <token>` |
| **Body** | `phoneNumber`, `points`, `storeId`, `orderId`; optionally `verificationToken` or `token` (required if not using Authorization header) |
| **Success** | `200` with `success: true`; `userExists: true` (points added) or `userExists: false` (points saved as pending) |
