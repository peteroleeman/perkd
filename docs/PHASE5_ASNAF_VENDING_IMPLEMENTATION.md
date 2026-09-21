# PERKD — Phase 5 implementation handoff

## Updated execution order — refunds after POS

User revision: complete Phase 5 vending payment/recovery work, then Phase 6 POS integration, then Phase 7 refunds across portal, vending and POS. Phase 8 covers BM localization and final pilot readiness. This order supersedes earlier instructions that put refund completion before POS or include BM/pilot in Phase 6.

Preserve the refund code, API contracts, history and regression tests already implemented. Defer new refund work, workflow review and hosted/machine/POS refund acceptance to Phase 7; these are not prerequisites for starting or completing POS integration. Continue recording payment IDs, funding attribution and dispense failure evidence now so later refunds remain traceable. This is a planning change, not a runtime enable/disable change or a deployment authorization. Final pilot acceptance follows Phase 7.


21 September 2026. Code is prepared for review; vending deployment and machine acceptance remain pending. Corporate and voucher handlers are unchanged. Updated at user request to match CERIA-style JSON requests without additional keys.

The implementation/contract and rollout order are documented in [Foodio Kitchen Phase 5](https://github.com/peteroleeman/foodio_kitchen/blob/codex/phase5-asnaf-vending/docs/PHASE5_ASNAF_VENDING_IMPLEMENTATION.md).

- `asnafrouter.js` adds the five `/asnaf/*` POST endpoints.
- `util/asnaf_service_client.js` forwards to a fixed HTTPS Kitchen origin, requires no service/device credentials and rejects redirects. Missing config fails closed. Timeouts return an unknown result, never a paid result.
- `server.js` mounts the new router without editing corporate/voucher handlers.
- `test/asnaf.test.js`: four focused adapter tests passed. Full PERKD boot and live proxy behavior remain unverified.
- `docs/asnaf_vending.postman_collection.json`: import, fill placeholder variables only for the intended test environment, then use a fresh member-authorized QR.
- `scripts/asnaf_simulator.js`: Node 18+; set `ASNAF_TEST_API_ORIGIN`, `ASNAF_TEST_CONFIRMED=true`, then run `node scripts/asnaf_simulator.js ACTION request.json`. It sends one explicit test request and performs no motor action. Never replace a receipt after an uncertain outcome.

Server environment: only `SMART_KOTAK_VENDING_URL` (the Kitchen HTTPS origin). Requests need only `Content-Type: application/json` and the documented JSON body. No service token, device token or key provisioning. Kitchen resolves the configured machine from the company/merchant/device identifiers. Those identifiers are routing/scope fields, not authenticated caller identity; this follows the requested CERIA trust model. New debits still require the member-authorized payment QR; portal authentication is unchanged.

Deploy Kitchen with vending disabled first, then PERKD, then frontends. Configure one reviewed synthetic test scope. Firmware must send the correct identifiers, persist receipts, recover status and dispense at most once. Identifier semantics still need supplier confirmation. Do not proceed to POS or pilot based solely on API test success.
