# Cursor — Phase 5: Asnaf vending payment API before POS

Updated: 20 September 2026. **Planning only: the endpoints and new functions below are proposed, not implemented or deployed.**

## Order and repository ownership

Complete the outstanding hosted Phase 3/4 acceptance, then implement **Phase 5 — Asnaf vending integration**. **Phase 6 — POS integration, BM and pilot readiness** follows vending acceptance. Vending and POS are separate integrations.

| Repository | Responsibility in this phase |
| --- | --- |
| **PERKD** — `peteroleeman/perkd`, branch `main` | New Asnaf machine API at `api.foodio.online`; validate machine context, adapt requests/results, call Smart Kotak |
| **FOODIO KITCHEN** — `peteroleeman/foodio_kitchen`, branch `master` | Smart Kotak service: scan authorisation, authoritative payment/refund ledger, receipt recovery, device/store setup and reporting |
| **FOODIO ONLINE** — `peteroleeman/foodio_online`, branch `master` | Member QR/payment authorisation UI, selected benefit plan/personal spending consent, payment result/history |
| Vending supplier/firmware | Recognise the Asnaf QR, call the new APIs, persist receipts, dispense once, report failed/partial dispensing |

Open the correct repository in Cursor for each task. Start with `git pull --ff-only`; preserve newer work. All Smart Kotak data remains in **foodio-ab3b2**. Kitchen manual self-top-up remains hidden/disabled; Online personal top-ups continue.

**Firestore constraint:** do not overwrite rules or indexes. Preserve unrelated entries; append or modify only an explicitly required Smart Kotak entry after reviewing the diff. No whole-file replacement, balance migration or rewrite of corporate records.

## What the supplied corporate document establishes

Source: **Corporate Card - Foodio API.docx**, supplied snapshot, headed “Ceria Corporate Wallet API”.

1. Corporate identification formats `CERIA:{employee_id}`, then uses CryptoJS AES with `company_id` as passphrase. The encrypted value travels as `encrypted_employee_id`.
2. `POST /ceria/get-balance` returns corporate/personal balances, daily availability and total available.
3. `POST /ceria/deduct-balance` receives a unique `receipt_id`, company/employee identity, RM amount, currency, merchant, machine and item list. It returns the order ID, deducted split and balances.
4. The vendor checks availability, confirms the purchase, requests deduction and retains the returned references. Item totals must match the amount. Randomised encryption means an encrypted string is not a stable transaction identity.
5. `/ceria/encrypt-employee-id` and `/ceria/decrypt-employee-id` are developer helpers. They are not needed for the server-issued Asnaf QR.
6. The document also describes `/vending/disableeventvoucherfromqr` and `/vending/grantvmvoucher`. These are a separate voucher flow, not an Asnaf wallet payment. Its `VC_` and `EV_` identifiers must not be interchanged.
7. The document does **not** specify corporate payment retry guarantees, payment-status recovery, failed-dispense refunds or a machine-authentication contract. Do not claim these are verified merely because receipts are unique. Its explicit HTTP-200-for-business-errors note is in the voucher section.

The same scan → balance → deduct → result concept is appropriate for Asnaf. Corporate company credit is replaced by the member's eligible **benefit-plan allowance**, with personal money kept separate. Do not copy corporate balances, encryption keys or employee records into Asnaf.

## Source review and missing source

Reviewed repository heads:

| Repository | Revision |
| --- | --- |
| PERKD | `d04e0e92d3a48b8caa14053e2b58fb1ce01a6653` |
| FOODIO KITCHEN | `3da486e9c1b05861f1d0d06761d837b55d3bd874` |
| FOODIO ONLINE | `edf5e5825c8639544db31e7497ce524ea02526c9` |

Verified source:
- PERKD `server.js` requires `./ceriarouter` and mounts it at `/ceria`. **`ceriarouter.js` is absent from this GitHub revision (404)**; no Ceria implementation appeared in its complete tree. Root `ceria_employee_crypto.js` is also absent. Therefore the corporate deduction implementation and its dependencies remain unverified.
- PERKD `vendingrouter.js` implements voucher routes and proxies vending purchase calls to an upstream service with a token. That outbound token is not evidence that callers of a new Asnaf route are authenticated or bound to a store.
- Kitchen `services/smart_kotak/src/member_qr.mjs` issues signed, 90-second `ASNAF:1:` codes. Its resolver requires a manager and returns `paymentAuthorized:false`: **identification only**.
- Kitchen `member_payments.mjs` has atomic selected-plan/personal payment and original-source refunds. `member_payment_routes.mjs` exposes member-confirmed payments and manager-created requests, not machine payment endpoints.
- Kitchen `merchant_stores.mjs` derives stores from the linked company using `store.companyid`, then enforces explicit manager-group approval.
- Online `lib/asnaf/asnaf_qr_dialog.dart` accepts only `ASNAF:1:` and explicitly says showing the code does not confirm payment.

Before implementation, upload the existing **PERKD** `ceriarouter.js` and its actual local dependencies from the working API source. Do not invent replacements or add credential files. For example, from the PERKD repository root, after verifying that this is the correct existing file:

```powershell
git status --short
git add -- ceriarouter.js
# Add only its missing local source dependencies by their actual paths.
git diff --cached --stat
git diff --cached
git commit -m "Add corporate wallet API source for Asnaf vending integration review"
git push origin main
```

Re-read that source before finalising compatibility and receipt/store mappings. Planning and isolated Smart Kotak tests can proceed meanwhile. Full PERKD boot/integration verification needs the missing runtime modules.

## Proposed external functions — PERKD

Add `asnafrouter.js`, mount it at `/asnaf` in `server.js`, and keep the corporate/voucher routers intact. Add a dedicated Smart Kotak service client; never directly update Asnaf balances from PERKD.

| Proposed POST endpoint under https://api.foodio.online | Suggested function | Purpose |
| --- | --- | --- |
| `/asnaf/get-balance` | `getAsnafBalance` | Validate scanned credential and machine/store; return selected-plan allowance, personal balance and usable total |
| `/asnaf/deduct-balance` | `deductAsnafBalance` | Commit one receipt payment through Smart Kotak and return its funding split |
| `/asnaf/payment-status` | `getAsnafPaymentStatus` | Recover an authoritative result by the original receipt after timeout/restart |
| `/asnaf/refund-payment` | `refundAsnafPayment` | Reverse confirmed undispensed value once, linked to the original payment and failed items |
| `/asnaf/dispense-result` | `recordAsnafDispenseResult` | Record machine evidence of full/partial/failed dispensing independently of payment status |

Use `Content-Type: application/json`. For familiar vendor fields, retain `receipt_id`, `company_id`, `merchant_id`, `device_number`, `amount`, `currency:"RM"` and `list`. Replace corporate identity with **`qr_payload`**. Never accept an employee ID or bare IC as Asnaf payment authority.

Example proposed deduction body (placeholders, not live credentials):

```json
{
  "receipt_id": "VM-001-20260920-000001",
  "company_id": "<linked Foodio company>",
  "merchant_id": "<vendor merchant identifier>",
  "device_number": "<registered machine>",
  "qr_payload": "<server-issued Asnaf payment QR>",
  "amount": 3.50,
  "currency": "RM",
  "list": [
    {"goods_id": "ITEM-01", "goods_sku": "SKU-01", "goods_name": "Drink", "goods_count": 1, "goods_price": 3.50}
  ]
}
```

Balance takes the same machine/company context and QR; it does not reserve or debit funds. If supplied, purchase amount/items allow an exact affordability quote. A balance check is not a guarantee that a later payment will succeed.

Successful deduction returns `success:true`, `ok:true`, receipt, stable Smart Kotak `orderId`/`paymentId`, explicit `paymentStatus:"Paid"`, RM total, `deducted.fromSponsored`, `deducted.fromPersonal`, selected plan and remaining allowance/personal balance. Also return separate dispense state; a repeated paid response must not trigger a second dispense.

Amounts are integer sen internally. Validate decimal RM exactly (at most two decimals), positive counts/prices, bounded item lists, sum = amount, supported currency and safe-integer limits. Do not trust an item description to prove catalogue price; verify against the trusted machine catalogue where available. Set and test explicit field/size limits.

Use one documented error body: `{"success":false,"ok":false,"code":"...","message":"..."}`. Specify HTTP 400 malformed, 401 missing/invalid machine credentials, 403 wrong scope, 404 unknown receipt, 409 business conflict/expired credential/insufficient credit, and 503 temporarily unavailable. Success is HTTP 200. If actual firmware requires HTTP 200 for business errors, agree and test that adapter change explicitly; never infer payment success from HTTP status alone.

Status/refund/dispense requests use the original company/merchant/device/receipt context; refunds add a unique `refund_request_id`, original payment reference, failed item quantities, amount and reason. They must not require a still-valid member QR after payment.

## Scan authorisation and machine identity

**Do not silently make the existing identity QR debit-capable.** Introduce a versioned, short-lived, single-purchase authorisation (proposed `ASNAF:2:`) issued by Smart Kotak after the signed-in member enables payment in the QR dialog. Keep v1 identification semantics intact.

Proposed initial product behaviour:
- Member chooses one eligible benefit plan, or personal-only. Do not aggregate multiple plan allowances. Show the selected plan and whether personal money can cover a shortfall.
- Member sees and confirms a spending cap and personal-use choice before showing a payment QR. This preserves scan-at-machine checkout without requiring a second phone confirmation at the machine. Finalise the cap UX with the product owner before enabling debit.
- QR has a server-stored authorisation ID/nonce, 90-second expiry, member/card/group, selected plan, maximum total and maximum personal draw. No IC, password, company encryption key or service credential is exposed.
- Balance lookup does not consume the authorisation. The first successful payment atomically binds it to one receipt. Another receipt cannot reuse it. Failed insufficient-funds checks create no charge.
- Recheck active member/card, card replacement, plan membership, date, daily usage, plan reserves, policy, company/store approval and authorisation limits **inside the payment transaction**.
- If allowance changes, never exceed the personal-use consent or cap. Reject and refresh when no permitted split can pay the order.
- An exact already-committed receipt retry/status lookup returns the original result even if the QR has since expired. A new payment requires a valid authorisation; revoked machine access still blocks callers.

Existing document headers do not establish machine authentication. Before enabling debit, identify the supplier's supported authenticated connection and bind it server-side to permitted devices/stores. Reuse an existing verified mechanism if present; otherwise configure a scoped machine/provider credential (or signed requests) outside source control. Public `company_id`/`merchant_id`/`device_number` values alone are not credentials. Do not use Lighthouse passwords or manager portal sessions on machines.

PERKD → Smart Kotak needs a narrow service identity for vending operations, validated on the Smart Kotak service. Keep credentials server-side; no fake member/manager session. Do not disable portal authentication or copy the session/QR signing secret into PERKD. Avoid logging raw QR payloads, credentials or full ICs.

## Company, store and machine setup — FOODIO KITCHEN

Keep the existing Lighthouse → Company & top-ups company link. Populate stores from Firestore, retaining the manager-group approved-store selection; **no manually typed merchant-store IDs**.

Distinguish:
- Foodio `store` document ID used by Smart Kotak payment policy.
- Vendor `merchant_id` and `device_number` used by the machine protocol.
- Default/only company store used to resolve **GKash top-up** settings.

These identifiers are not assumed equal. Inspect the existing corporate/vendor mapping before adding a new mapping. If absent, add a small Lighthouse machine setup: select a company-derived store, register the supplier merchant/device identifiers, enable/disable it and show readiness. The default top-up store does not authorise spending at every machine.

At every new charge, the server verifies the registered device mapping, current linked company and group-approved store. Add a vending-enabled control/readiness indicator; turning on “Show member payment QR” alone must not claim the machine is integrated. Keep integration disabled until its credentials/mapping and acceptance are ready.

## Authoritative execution — FOODIO KITCHEN service

Add a narrowly authenticated machine route/service layer, reusing/refactoring the existing payment and refund domain functions. Do not call manager routes using a fabricated actor or build a second ledger.

Atomic deduction must include receipt claim, authorisation consumption, order/payment record, chosen plan/sponsor funding, personal wallet, daily usage and balanced ledger entries. Preserve existing portal confirmation checks. Validate expiry at transaction execution/retry, not only at the start of a request.

Receipt uniqueness: scope by the verified provider/company/merchant/device tuple plus `receipt_id`. Store a canonical request fingerprint covering identity/authorisation, amount, currency, plan and item list. Identical retries return the same operation; changed input under the same receipt is `RECEIPT_CONFLICT`. Concurrent identical requests commit once. A timed-out response must never cause a fresh receipt or another charge.

Keep payment and dispense status separate. Use `channel:"vending"` for new records and preserve original receipt/device/item metadata. Inspect and extend the current `channel === 'ceria'` checks in `member_payments.mjs` (including refund related-record loading), reconciliation, projections and history; simply changing the stored channel would currently break refunds. Corporate CRM balances and existing `ceria` history stay compatible.

No merchant payout/cash-out is introduced by this phase. A ledger merchant payable is not proof of external settlement. If the supplier requires a secondary order, write a durable retryable task in the same canonical transaction; do not debit first and make an unrecoverable independent order call.

## Dispensing, uncertain outcomes and refunds

1. Machine persists its receipt before deduction.
2. On confirmed paid result, machine dispenses at most once for that receipt and persists the outcome locally; retries/restarts cannot trigger another motor action.
3. On deduction timeout, query status or retry the exact same request. Do not dispense while payment is unknown and do not create a replacement charge.
4. Report full/partial/failed dispensing with a stable event ID. Validate event transitions and item counts against the stored order; duplicate or out-of-order reports cannot overwrite a final outcome incorrectly.
5. Confirmed failure/partial failure permits refund only for the undispensed value. The backend derives the refundable amount from the recorded items and checks it against the original net paid amount.
6. Unknown dispense outcome is **Review required**, not an automatic refund based solely on elapsed time. Persist unresolved attempts for operator recovery and reconcile them.
7. Refund requests use their own idempotency key, scoped to the original payment. Automatic failure reversal and manual refunds share one cumulative limit and original-source accounting.
8. Personal money returns to the personal wallet; sponsored money returns to its active plan or to the manager shared fund after closure/expiry, retaining sponsor attribution. Preserve existing proportional cumulative split/rounding and same-Malaysia-day daily-usage restoration.

Persist failure evidence before refund. On retry after a refund commit but lost response, return the stored refund. Resolve conflicting “dispensed” versus “failed” reports through review; do not silently undo posted history. Default to online-only payment; no offline shared-fund spending.

## Member UI and reports — FOODIO ONLINE / FOODIO KITCHEN

**FOODIO ONLINE:** update the QR dialog/API client for the separate payment-authorisation contract, plan/personal-use choice, expiry and consumed status. Refresh balances/history after purchase/refund. Show “Tap here when the machine asks for your QR code” only when vending readiness permits it. Clearly distinguish identification QR from payment QR. Corporate QR/top-up/employee screens stay unchanged.

**FOODIO KITCHEN:** display machine/store, receipt, item detail, payment and dispense statuses, funding split, refund reference and unresolved outcomes in admin reports/reconciliation. Exports must include actual source records, never demo substitutes. Expose only the signed-in member's appropriate vending history to Online.

## Cursor implementation sequence and acceptance gate

1. **PERKD:** obtain missing corporate source/dependencies; map the exact machine protocol, receipt recovery, merchant/device identity and firmware constraints. Document verified findings, not inferred compatibility.
2. **KITCHEN:** implement/test narrow machine identity, authorisation, atomic debit, idempotent status/refund and machine/store setup behind a disabled vending gate.
3. **PERKD:** implement the new Asnaf router/service client, contract validation and error mapping. Add Postman examples with placeholders and a simulated-machine runner.
4. **ONLINE:** add the payment QR authorisation/result flow. Preserve corporate and v1 identity-only paths.
5. **All three:** update API docs and run focused tests. Record commits, test evidence and any required targeted indexes/rules changes.
6. **Cursor/operator deployment:** deploy Kitchen API first with vending disabled, then PERKD, then Online/admin frontends. Configure one test device/store/group; enable only that test scope and verify real machine acceptance.
7. Only after hosted Phase 3/4 and vending acceptance proceed to **Phase 6 POS**, reusing the tested financial contracts. BM/pilot remain in the final phase.

Required cases:
- Sponsored-only, personal-only and mixed purchase; multiple active plans use exactly the selected one.
- Insufficient balance, expired plan/QR, frozen/replaced card, wrong company/device/store/group, disabled policy and rejected v1-as-payment.
- Duplicate balance check, duplicate scan, concurrent identical deduction, different receipt with consumed QR and same receipt with altered items/amount.
- Concurrent purchases/plan expiry; no negative balances, over-budget spending or daily-limit bypass.
- Timeout before/after commit, service restart and lost machine response; recover the same receipt with no extra charge or dispense.
- Full/partial failed dispensing, repeated/conflicting events, partial/full refund, refund after plan expiry and Malaysia midnight; exact original-source totals.
- Admin reconciliation and member history agree, with no cross-group exposure.
- Existing corporate `/ceria/*`, voucher `/vending/*`, personal top-up and member-confirmed payment regression checks.
- Real scanner reads the new QR on a phone, firmware routes it to `/asnaf/*`, pays, dispenses once and handles failure recovery. A displayed QR or Postman success alone is not machine acceptance.

**Exit evidence:** exact API/frontend/firmware revisions, synthetic test receipts, payment/refund IDs, observed dispense outcomes and reconciled balances. No credentials or full ICs in committed evidence. This plan does not itself implement, deploy or certify any new payment endpoint.
