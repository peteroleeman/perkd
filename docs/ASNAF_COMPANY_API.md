# Asnaf API — company-only business identity

This change supersedes earlier Asnaf merchant/device mapping requirements.

For new requests to every POST `/asnaf/*` endpoint, send `company_id` only for
business identity. No `merchant_id`, `device_number`, machine registration,
service key or device key is required. Other action-specific fields remain:

| Endpoint | Additional fields |
| --- | --- |
| `/asnaf/get-balance` | `qr_payload`; optionally amount/currency/list together |
| `/asnaf/deduct-balance` | `qr_payload`, `receipt_id`, `amount`, `currency`, `list` |
| `/asnaf/payment-status` | `receipt_id` |
| `/asnaf/dispense-result` | `receipt_id`, `payment_id`, `event_id`, `dispensed` or `outcome:"Unknown"` |
| `/asnaf/refund-payment` | `receipt_id`, `payment_id`, `refund_request_id`, `failed_items`, `amount`, `currency`, `reason` |

```json
{"company_id":"YOUR_COMPANY_ID","qr_payload":"COPY_FRESH_ASNAF_2_STRING"}
```

Kitchen validates the company, selects its only/default store, and applies the
Asnaf group's accepted-store policy. Multiple stores require exactly one default.
A valid company ID identifies the business; it does not replace the payment QR,
member/card checks, spending caps, financial-posting gate or group vending gate.

Receipts must now be unique across the company, including all machines/groups.
Persist one receipt and exact body before deduction. Recover or retry that same
receipt after a timeout. Status and exact committed retries retain the original
store even if the company's default changes. New requests with extra old fields
still use company scope, so those fields cannot create a second debit namespace.
Historical pre-upgrade payments retain recovery with their original identifiers
and mappings. Do not create a replacement payment to recover a historical one.

PERKD's existing adapter already forwards company-only JSON unchanged; no proxy
runtime change is needed. The Postman collection now uses the new request shape.
Kitchen backend must be updated first, then Kitchen's test-page frontend. The
PERKD URL and SMART_KOTAK_VENDING_URL stay unchanged. Production vending stays off.

See Foodio Kitchen's `docs/ASNAF_VENDING_DEVELOPER_GUIDE.md` for full examples,
response fields, recovery and simulated/physical acceptance. Refund acceptance
remains Phase 7, after POS integration.
