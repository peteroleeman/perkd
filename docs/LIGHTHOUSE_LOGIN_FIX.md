# Restore Smart Kotak Lighthouse login

## Confirmed cause

On 21 September 2026, a password-free POST with `{}` to
`https://api.foodio.online/user/verifylighthousepassword` returned HTTP 404,
`Cannot POST /user/verifylighthousepassword`.

Smart Kotak already calls this endpoint for the verified `123456` login and
correctly refuses access when verification is unavailable. The PERKD main branch
and both reviewed development branches had no registered verification handler.

## Fix

`userrouter.js` now registers POST `/verifylighthousepassword` under the existing
`/user` mount. It reads the existing Foodio `merchant` record where username is
`123456`, verifies the Lighthouse store and locked/disabled flags, and compares
the exact supplied password in memory. No credential copies or Firestore writes
are made. The existing Foodio Firebase connection must target `foodio-ab3b2`.

The contract is unchanged: send JSON `{ "password": "<entered privately>" }`
without a bearer/API key. A completed check returns HTTP 200 with exactly
`{ "ok": true }` or `{ "ok": false }`. Invalid input is 400; a wrong project,
ambiguous account or database failure is 503. No passwords or account data are
returned or logged. Existing routes retain their authentication handlers.

## Verification

The isolated tests exercise the actual UserRouter with mocked cloud dependencies
and loopback HTTP. No actual Lighthouse password, live account, transaction or
Firebase write is used. Run with Node 22 and the repository's Express dependency:

```sh
node --test test/lighthouse_verification.test.js test/asnaf.test.js
```

The new GitHub Actions workflow runs these same tests without booting server.js.

## Deployment handoff — PERKD only

1. Review/merge the fix and update the complete PERKD deployment checkout.
   Preserve local files and unrelated commits, including work on
   `upload-ceriarouter`. Do not overwrite it with a partial repository snapshot.
2. Check that every module imported by server.js exists. The source checkout
   used for production may include routers absent from GitHub; do not remove or
   stub these to force a build.
3. Deploy the existing PERKD service behind `https://api.foodio.online` using its
   established deployment procedure. Preserve environment variables, including
   `SMART_KOTAK_VENDING_URL`, and existing routes. No new secret is required.
4. Repeat the empty-body POST: it must now return HTTP 400 JSON with `ok:false`,
   rather than a route-level 404. This verifies route presence, not credentials.
5. Sign in as `123456` through Smart Kotak using the existing password privately.
   Confirm normal system-administrator access and the PERKD test menu. If it
   still returns unavailable, inspect the PERKD revision, existing Firebase
   project/read permissions and duplicate merchant records. Do not loosen rules
   or bypass verification.
6. Record the deployed PERKD revision and login result. No Kitchen frontend
   rebuild is needed for this route fix. Keep production vending disabled.

This patch does not claim deployment or successful live login until these
operator checks are completed.
