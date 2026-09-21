# Cursor — Phase 5: Asnaf vending payment API before POS

## Updated execution order — refunds after POS

User revision: complete Phase 5 vending payment/recovery work, then Phase 6 POS integration, then Phase 7 refunds across portal, vending and POS. Phase 8 covers BM localization and final pilot readiness. This order supersedes earlier instructions that put refund completion before POS or include BM/pilot in Phase 6.

Preserve the refund code, API contracts, history and regression tests already implemented. Defer new refund work, workflow review and hosted/machine/POS refund acceptance to Phase 7; these are not prerequisites for starting or completing POS integration. Continue recording payment IDs, funding attribution and dispense failure evidence now so later refunds remain traceable. This is a planning change, not a runtime enable/disable change or a deployment authorization. Final pilot acceptance follows Phase 7.


Updated: 21 September 2026. **Implementation update:** the review branches now contain the Phase 5 backend, adapter and frontend source. See [current handoff and verification](PHASE5_ASNAF_VENDING_IMPLEMENTATION.md). Vending remains disabled by default; frontend validation, deployment and real machine acceptance are pending. The original design and acceptance requirements below remain the reference, with their planning-only status superseded by this update.

## Order and repository ownership

Complete the outstanding hosted Phase 3/4 acceptance, then implement **Phase 5 — Asnaf vending integration**. **Phase 6 — POS integration** follows payment-focused vending acceptance; **Phase 7 — refunds** follows POS, then **Phase 8 — BM and pilot readiness**. Vending and POS are separate integrations.

| Repository | Responsibility in this phase |
| --- | --- |
| **PERKD** — `peteroleeman/perkd`, branch `main` | New Asnaf machine API at `api.foodio.online`; validate machine context, adapt requests/results, call Smart Kotak |
| **FOODIO KITCHEN** — `peteroleeman/foodio_kitchen`, branch `master` | Smart Kotak service: scan authorisation, authoritative payment/refund ledger, receipt recovery, device/store setup and reporting |
| **FOODIO ONLINE** — `peteroleeman/foodio_online`, branch `master` | Member QR/payment authorisation UI, automatically assigned benefit plan/personal spending consent, payment result/history |
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

## Source review — corporate source uploaded and reviewed

Reviewed repository heads:

| Repository | Revision |
| --- | --- |
| PERKD | `b82ccc5b865735008126e511f842ec0faa4e5e94` |
| FOODIO KITCHEN | `9ef095bd5a0cf74e8f41746b01fabfb1733ba805` |
| FOODIO ONLINE | `d4e1ce1d963e58482933d84d7e687a8a1427ca56` |

Verified source:
- PERKD `ceriarouter.js`, `util/ceria_employee_crypto.js`, `util/build_einvoice_order.js`, `models/ceria/CeriaCompanySettingsModel.js` and `models/ceria/CeriaSubsidyPolicy.js` are now present and source-reviewed. `server.js` mounts the router at `/ceria`. Its direct local imports and the settings model’s policy dependency are present; this is not a full application boot or deployment test.
- PERKD `vendingrouter.js` implements voucher routes and proxies vending purchase calls to an upstream service with a token. That outbound token is not evidence that callers of a new Asnaf route are authenticated or bound to a store.
- Kitchen `services/smart_kotak/src/member_qr.mjs` issues signed, 90-second `ASNAF:1:` codes. Its resolver requires a manager and returns `paymentAuthorized:false`: **identification only**.
- Kitchen `member_payments.mjs` has atomic selected-plan/personal payment and original-source refunds. `member_payment_routes.mjs` exposes member-confirmed payments and manager-created requests, not machine payment endpoints.
- Kitchen `merchant_stores.mjs` derives stores from the linked company using `store.companyid`, then enforces explicit manager-group approval.
- Online `lib/asnaf/asnaf_qr_dialog.dart` accepts only `ASNAF:1:` and explicitly says showing the code does not confirm payment.

### Verified corporate implementation and Asnaf implications

- **Identity:** the helper decrypts `CERIA:{employeeId}` with company ID, then resolves `ceria_hub/{companyId}/employee/CORP_{id}` (with an employee-ID query fallback). Asnaf retains its own identity/QR.
- **Availability:** corporate credit respects usage-day policy and daily remaining allowance; the personal wallet supplies the remainder. Settings come from `ceria_hub/{companyId}/company_data/settings`.
- **Deduction:** `ceriaDeductBalanceCore` checks active employee status and updates both the employee and `user/{userDocId}` wallet projections in a Firestore transaction. Asnaf instead uses its existing canonical plan/personal ledger and group scope.
- **Receipt/retry gap:** the reviewed deduction path does not claim or look up `receipt_id` before charging. The builder creates a fresh random `O_...` ID for every call; receipt is just the stored `orderid`. Repeating a receipt can therefore charge again if funds remain. Asnaf must add the atomic receipt claim/fingerprint described below.
- **Order-save gap:** the wallet transaction commits before a separate batch writes `myinvois/{storeId}/order` and `user/{userDocId}/order`. `myreport/{storeId}/order` is then best-effort. `ORDER_SAVE_FAILED` can mean money was deducted without those order records. The HTTP handler also drops the core failure's order ID/deducted detail. Asnaf must commit its authoritative order with the debit and use a durable outbox for any required external projections.
- **Store mapping:** `vending_merchant/{merchant_id}.storeid` supplies the Foodio store. The builder optionally queries `merchant_device` by `fridgemid == device_number` and reads `vendingdevicenumber` / `vendingmerchantid`. It uses a hard-coded fallback store for an unknown merchant and tolerates missing device mapping. Asnaf must reject unknown/ambiguous/mismatched mappings and enforce company membership plus group-approved stores.
- **Validation:** the builder checks required field presence but does not enforce item-total equality, positive integral counts or the RM currency contract. It uses `amount` when supplied, otherwise the calculated subtotal. Asnaf needs strict sen-based validation.
- **HTTP contract:** success is 200; employee-not-found is 404; inactive/insufficient funds are 409; order-save failure is 500; other business validation errors are 400. Do not copy the voucher API's HTTP-200 error convention.
- **Authentication/recovery:** no machine-auth middleware, payment-status route or purchase-refund route appears in the uploaded Ceria router. The public company-ID AES convention is not proof of machine identity. Deployment/upstream controls and firmware recovery still require verification.

The missing corporate-source blocker is resolved. Remaining inputs are the actual machine identifier/firmware behaviour and the proposed member payment-authorisation UX. No live deduction, refund or production-data test was performed for this review.

## Confirmed rule — one active plan per Asnaf

Each Asnaf can have **at most one active benefit-plan assignment at a time**. A manager can manage many plans, but a member cannot have overlapping assignments. Previous expired/closed assignments remain in history; later non-overlapping enrolment is allowed. This replaces the earlier member plan-selection proposal.

- **FOODIO KITCHEN:** enforce the rule on assignment, activation/reactivation, date extensions and reassignment. Use a transaction with a shared per-beneficiary assignment guard so concurrent changes to different plans cannot both succeed; a UI check or two independent plan writes is insufficient. Reject overlapping effective dates using the existing Malaysia date convention. Do not silently remove a member from an existing plan.
- **All payment paths:** the server resolves the one current assigned plan automatically for portal, vending and later POS. Clients cannot select another plan. If legacy input still includes `planId`, it must match the server assignment (or an explicitly supported personal-only payment); never trust it to choose entitlement. Recheck the assignment/version when authorising and charging. A stale QR cannot silently charge a replacement plan.
- **FOODIO ONLINE:** show a single current Benefit plan; remove plan pickers. Keep previous plans in history. Display no active plan when appropriate. The separate personal wallet and existing personal-only eligibility remain unchanged; no plan must never create sponsored entitlement.
- **Conflict handling:** if development data contains multiple active assignments, report an assignment conflict and block sponsored authorisation until the manager resolves it. Do not pick the first plan, sum allowances, delete history or rewrite balances.
- **Reassignment/refunds:** do not allow a mid-day reassignment to reset spent allowance or create a second daily entitlement; reject it until a defined safe effective date. Old purchases/refunds retain their original plan and sponsor allocation, even after the member moves to another plan. Never refund an old purchase into the newly assigned plan.
- **Acceptance:** concurrent duplicate assignments, overlapping future dates, plan date extension/reactivation, automatic expiry/new assignment, stale QR/quote after reassignment and refund of an old-plan purchase. Plans may serve many members; a member must never have two active plan assignments.

This is a required implementation change, not a claim that current runtime code already enforces it.

## Proposed external functions — PERKD

Add `asnafrouter.js`, mount it at `/asnaf` in `server.js`, and keep the corporate/voucher routers intact. Add a dedicated Smart Kotak service client; never directly update Asnaf balances from PERKD.

| Proposed POST endpoint under https://api.foodio.online | Suggested function | Purpose |
| --- | --- | --- |
| `/asnaf/get-balance` | `getAsnafBalance` | Validate scanned credential and machine/store; return assigned-plan allowance, personal balance and usable total |
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
    {"goods_id": "ITEM-01", "goods_sku": "SKU-01", "goods_name": "Drink", "goods_description": "", "goods_photo": "", "goods_count": 1, "goods_price": 3.50}
  ]
}
```

Balance takes the same machine/company context and QR; it does not reserve or debit funds. If supplied, purchase amount/items allow an exact affordability quote. A balance check is not a guarantee that a later payment will succeed.

Successful deduction returns `success:true`, `ok:true`, receipt, stable Smart Kotak `orderId`/`paymentId`, explicit `paymentStatus:"Paid"`, RM total, `deducted.fromSponsored`, `deducted.fromPersonal`, assigned plan and remaining allowance/personal balance. Also return separate dispense state; a repeated paid response must not trigger a second dispense.

Amounts are integer sen internally. Validate decimal RM exactly (at most two decimals), positive counts/prices, bounded item lists, sum = amount, supported currency and safe-integer limits. Do not trust an item description to prove catalogue price; verify against the trusted machine catalogue where available. Set and test explicit field/size limits.

Use one documented error body: `{"success":false,"ok":false,"code":"...","message":"..."}`. Specify HTTP 400 malformed, 401 invalid payment authorisation, 403 wrong scope, 404 unknown receipt, 409 business conflict/expired credential/insufficient credit, and 503 temporarily unavailable. Success is HTTP 200. If actual firmware requires HTTP 200 for business errors, agree and test that adapter change explicitly; never infer payment success from HTTP status alone.

Status/refund/dispense requests use the original company/merchant/device/receipt context; refunds add a unique `refund_request_id`, original payment reference, failed item quantities, amount and reason. They must not require a still-valid member QR after payment.

## Scan authorisation and machine identity

**Do not silently make the existing identity QR debit-capable.** Introduce a versioned, short-lived, single-purchase authorisation (proposed `ASNAF:2:`) issued by Smart Kotak after the signed-in member enables payment in the QR dialog. Keep v1 identification semantics intact.

Proposed initial product behaviour:
- The server uses the member’s single active assigned plan automatically. There is no plan-selection step. Show that plan and whether personal money can cover a shortfall; personal-only use follows the existing eligibility and consent rules.
- Member sees and confirms a spending cap and personal-use choice before showing a payment QR. This preserves scan-at-machine checkout without requiring a second phone confirmation at the machine. Finalise the cap UX with the product owner before enabling debit.
- QR has a server-stored authorisation ID/nonce, 90-second expiry, member/card/group, assigned plan and assignment version, maximum total and maximum personal draw. No IC, password, company encryption key or service credential is exposed.
- Balance lookup does not consume the authorisation. The first successful payment atomically binds it to one receipt. Another receipt cannot reuse it. Failed insufficient-funds checks create no charge.
- Recheck active member/card, card replacement, plan membership, date, daily usage, plan reserves, policy, company/store approval and authorisation limits **inside the payment transaction**.
- If allowance changes, never exceed the personal-use consent or cap. Reject and refresh when no permitted split can pay the order.
- An exact already-committed receipt retry/status lookup returns the original result even if the QR has since expired. A new payment requires a valid authorisation; revoked machine access still blocks callers.

**21 September user revision — simple CERIA-style API:** use JSON requests with the existing company, merchant and device identifiers. Do not require additional service/device keys, custom authentication headers or provisioning. This supersedes the earlier machine/service credential requirement. Identifiers select the configured machine and approved store/group; they do not authenticate callers. New debits still require member-issued payment authorisation. Recovery and dispense/refund reporting retain receipt/payment checks but do not independently authenticate the reporting machine. Keep portal login authentication unchanged and do not fabricate portal actors or log raw QR payloads/full ICs.

## Company, store and machine setup — FOODIO KITCHEN

Keep the existing Lighthouse → Company & top-ups company link. Populate stores from Firestore, retaining the manager-group approved-store selection; **no manually typed merchant-store IDs**.

Distinguish:
- Foodio `store` document ID used by Smart Kotak payment policy.
- Vendor `merchant_id` and `device_number` used by the machine protocol.
- Default/only company store used to resolve **GKash top-up** settings.

Reuse the verified `vending_merchant/{merchant_id}.storeid` relationship and inspect `merchant_device` records for the machine binding. Require a unique, consistent device/merchant/store mapping; the legacy builder’s optional lookup is not sufficient authorisation. Do not create a parallel registry unless required fields are genuinely absent. In Lighthouse, select a company-derived store and existing machine, show readiness and enable/disable Asnaf use. Any necessary registration fields are supplier device/merchant identifiers, not manually entered Foodio store IDs. Reject missing mappings; never use the corporate builder’s default-store fallback. The default top-up store does not authorise spending at every machine.

At every new charge, the server verifies the registered device mapping, current linked company and group-approved store. Add a vending-enabled control/readiness indicator; turning on “Show member payment QR” alone must not claim the machine is integrated. Keep integration disabled until its mapping and acceptance are ready.

## Authoritative execution — FOODIO KITCHEN service

Add a dedicated CERIA-style machine route/service layer, reusing/refactoring the existing payment and refund domain functions. Do not call manager routes using a fabricated actor or build a second ledger.

Atomic deduction must include receipt claim, authorisation consumption, order/payment record, assigned plan/sponsor funding, personal wallet, daily usage and balanced ledger entries. Preserve existing portal confirmation checks. Validate expiry at transaction execution/retry, not only at the start of a request.

Receipt uniqueness: scope by the verified provider/company/merchant/device tuple plus `receipt_id`. Store a canonical request fingerprint covering identity/authorisation, amount, currency, plan and item list. Identical retries return the same operation; changed input under the same receipt is `RECEIPT_CONFLICT`. Concurrent identical requests commit once. A timed-out response must never cause a fresh receipt or another charge.

Keep payment and dispense status separate. Use `channel:"vending"` for new records and preserve original receipt/device/item metadata. Inspect and extend the current `channel === 'ceria'` checks in `member_payments.mjs` (including refund related-record loading), reconciliation, projections and history; simply changing the stored channel would currently break refunds. Corporate CRM balances and existing `ceria` history stay compatible.

No merchant payout/cash-out is introduced by this phase. A ledger merchant payable is not proof of external settlement. If the supplier requires a secondary order, write a durable retryable task in the same canonical transaction; do not debit first and make an unrecoverable independent order call.

## Dispensing and uncertain outcomes (refund completion in Phase 7)

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

**FOODIO ONLINE:** update the QR dialog/API client for the separate payment-authorisation contract, automatic assigned-plan display and personal-use consent, expiry and consumed status. Refresh balances/history after purchase/refund. Show “Tap here when the machine asks for your QR code” only when vending readiness permits it. Clearly distinguish identification QR from payment QR. Corporate QR/top-up/employee screens stay unchanged.

**FOODIO KITCHEN:** display machine/store, receipt, item detail, payment and dispense statuses, funding split, refund reference and unresolved outcomes in admin reports/reconciliation. Exports must include actual source records, never demo substitutes. Expose only the signed-in member's appropriate vending history to Online.

## Cursor implementation sequence and acceptance gate

Apply these steps to payment, dispense reporting and recovery now. Existing refund contracts/code/tests are retained for compatibility; new refund implementation, UX review and hosted/machine/POS acceptance below are Phase 7 work and do not block POS integration.

1. **PERKD:** corporate source/dependency review is complete at the revision above. Confirm the actual machine protocol, receipt recovery, configured merchant/device mapping and firmware constraints; reuse the verified Firestore mappings with strict scope checks. Do not copy the existing duplicate-charge/order-save/default-store gaps.
2. **KITCHEN:** verify machine mapping, member authorisation, atomic debit and idempotent status recovery and machine/store setup behind a disabled vending gate.
3. **PERKD:** implement the new Asnaf router/service client, contract validation and error mapping. Add Postman examples with placeholders and a simulated-machine runner.
4. **ONLINE:** add the payment QR authorisation/result flow. Preserve corporate and v1 identity-only paths.
5. **All three:** update API docs and run focused tests. Record commits, test evidence and any required targeted indexes/rules changes.
6. **Cursor/operator deployment:** deploy Kitchen API first with vending disabled, then PERKD, then Online/admin frontends. Configure one test device/store/group; enable only that test scope and verify real machine acceptance.
7. After payment-focused hosted Phase 3/4 and vending acceptance, proceed to **Phase 6 POS** using the shared payment contracts. Refund-specific acceptance is not a prerequisite.
8. After POS integration, complete **Phase 7 refunds** across Kitchen, PERKD, Online and the actual POS source, including hosted and machine acceptance.
9. Complete **Phase 8 BM/localization and pilot readiness**, including end-to-end refund evidence.

Required cases:
- Sponsored-only, personal-only and mixed purchase; the server uses only the single assigned plan. A second overlapping assignment is rejected, including concurrent requests.
- Insufficient balance, expired plan/QR, frozen/replaced card, wrong company/device/store/group, disabled policy and rejected v1-as-payment.
- Duplicate balance check, duplicate scan, concurrent identical deduction, different receipt with consumed QR and same receipt with altered items/amount.
- Concurrent purchases/plan expiry; no negative balances, over-budget spending or daily-limit bypass.
- Timeout before/after commit, service restart and lost machine response; recover the same receipt with no extra charge or dispense.
- Phase 5: full/partial/unknown dispense reporting and repeated/conflicting events.
- Phase 7 after POS: partial/full refunds, retry/concurrency, plan expiry/reassignment and Malaysia midnight; exact original-source totals.
- Admin reconciliation and member history agree, with no cross-group exposure.
- Existing corporate `/ceria/*`, voucher `/vending/*`, personal top-up and member-confirmed payment regression checks.
- Real scanner reads the new QR on a phone, firmware routes it to `/asnaf/*`, pays, dispenses once and handles failure recovery. A displayed QR or Postman success alone is not machine acceptance.

**Phase 5 exit evidence:** exact API/frontend/firmware revisions, synthetic test receipts, payment IDs, observed dispense outcomes and reconciled payment balances. Refund IDs and reconciled refund evidence are Phase 7 deliverables. No credentials or full ICs in committed evidence. This plan does not itself implement, deploy or certify any new payment endpoint.

