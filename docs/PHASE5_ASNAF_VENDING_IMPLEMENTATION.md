# PERKD — Phase 5 implementation handoff

21 September 2026. Code is prepared for review; vending deployment and machine acceptance remain pending. Corporate and voucher handlers are unchanged.

The implementation/contract and rollout order are documented in [Foodio Kitchen Phase 5](https://github.com/peteroleeman/foodio_kitchen/blob/codex/phase5-asnaf-vending/docs/PHASE5_ASNAF_VENDING_IMPLEMENTATION.md).

- `asnafrouter.js` adds the five `/asnaf/*` POST endpoints.
- `util/asnaf_service_client.js` forwards to a fixed HTTPS Kitchen origin, supplies a separate service credential, forwards device credentials and rejects redirects. Missing config fails closed. Timeouts return an unknown result, never a paid result.
- `server.js` mounts the new router without editing corporate/voucher handlers.
- `test/asnaf.test.js`: four focused adapter tests passed. Full PERKD boot and live proxy behavior remain unverified.
- `docs/asnaf_vending.postman_collection.json`: import, fill placeholder variables only for the intended test environment, then use a fresh member-authorized QR.
- `scripts/asnaf_simulator.js`: Node 18+; set `ASNAF_TEST_API_ORIGIN`, `ASNAF_DEVICE_ID`, `ASNAF_DEVICE_TOKEN`, `ASNAF_TEST_CONFIRMED=true`, then run `node scripts/asnaf_simulator.js ACTION request.json`. It sends one explicit test request and performs no motor action. Never replace a receipt after an uncertain outcome.

Server environment: `SMART_KOTAK_VENDING_URL` and secret `SMART_KOTAK_VENDING_SERVICE_TOKEN`. The matching SHA-256 hash is configured on Kitchen. Never use a member session or the Kitchen QR/session secret here.

Deploy Kitchen with vending disabled first, then PERKD, then frontends. Configure one reviewed synthetic test scope. Firmware must authenticate, persist receipts, recover status and dispense at most once. Headers and identifier semantics still need supplier confirmation. Do not proceed to POS or pilot based solely on API test success.
