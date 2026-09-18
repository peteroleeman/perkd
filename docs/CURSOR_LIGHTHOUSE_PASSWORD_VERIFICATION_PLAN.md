# Cursor plan: simple Lighthouse password check in UserRouter

Status: plan only. The endpoint and Smart Kotak integration are not implemented or deployed by this document.

## Requested result

Add one function to the existing `perkd/userrouter.js`. It receives the supplied password, checks it against the Lighthouse merchant in **`foodio-ab3b2`**, and returns whether it matches.

Use the existing `firebase` and `fireStore` variables in that file. No new router, new authentication framework, password migration or copied Lighthouse account is needed.

Proposed endpoint:

```http
POST https://api.foodio.online/user/verifylighthousepassword
Authorization: Bearer <server-only-service-key>
Content-Type: application/json
```

```json
{"password":"<password entered by the user>"}
```

For a completed credential check, return HTTP 200 and exactly one boolean:

```json
{"ok":true}
```

or:

```json
{"ok":false}
```

The service key is separate from the human Lighthouse password. Store it only in the Foodio API and Smart Kotak backend environments/Secret Manager, never in Flutter. It keeps this simple password-check function from becoming a public password-guessing endpoint.

## What was checked in GitHub

Reviewed `perkd/main` at `8b82b58cc54c0f239b581963934d54d002624328` and `foodio_kitchen/master` at `ef448b477bc28972a86f9f19bb3437c5659ab29b`.

- `server.js` already mounts `UserRouter` at `/user`, so no new server mount is required.
- `userrouter.js` already imports `const firebase = require('./db')` and creates `const fireStore = firebase.firestore()`.
- `db.js` uses the existing Firebase client SDK; `config.js` supplies its project from the environment. Confirm the deployed API uses `foodio-ab3b2`.
- `/user/checkuser` handles loyalty points. Leave it unchanged.
- Foodio Kitchen login queries `merchant` by `username`, compares the stored `password`, and recognizes Lighthouse using `storeid` `123456`.
- Smart Kotak currently checks a merchant in its own project. It will need to call this new endpoint instead.

Refresh the repositories before editing and preserve subsequent changes.

## Cursor implementation steps

### 1. Register one route

In `userrouter.js`, add this to `initializeRoutes()` alongside the existing routes:

```js
this.router.post('/verifylighthousepassword', this.verifyLighthousePassword.bind(this));
```

### 2. Add one method to UserRouter

Add a Node crypto import at the top of the file, using a distinct name to avoid the existing `crypto-js` variables:

```js
const nodeCrypto = require('crypto');
```

Suggested method:

```js
async verifyLighthousePassword(req, res) {
  res.set('Cache-Control', 'no-store');

  // Keep this key in the two backends only; never put it in Flutter.
  const expectedKey = process.env.LIGHTHOUSE_VERIFY_API_KEY;
  if (typeof expectedKey !== 'string' || expectedKey.length < 32) {
    return res.status(503).json({ ok: false, error: 'Verification unavailable' });
  }

  const same = (a, b) => nodeCrypto.timingSafeEqual(
    nodeCrypto.createHash('sha256').update(a).digest(),
    nodeCrypto.createHash('sha256').update(b).digest()
  );
  const header = req.get('Authorization') || '';
  const suppliedKey = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!suppliedKey || !same(suppliedKey, expectedKey)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized caller' });
  }

  const password = req.body && req.body.password;
  if (!req.is('application/json') || typeof password !== 'string' ||
      password.length === 0 || password.length > 256) {
    return res.status(400).json({ ok: false, error: 'Password is required' });
  }

  // Use the existing Foodio connection, never a caller-supplied project.
  if (firebase.options.projectId !== 'foodio-ab3b2') {
    return res.status(503).json({ ok: false, error: 'Verification unavailable' });
  }

  try {
    const snapshot = await fireStore.collection('merchant')
      .where('username', '==', '123456').limit(2).get();

    if (snapshot.empty) return res.json({ ok: false });
    if (snapshot.size !== 1) {
      return res.status(503).json({ ok: false, error: 'Verification unavailable' });
    }

    const merchant = snapshot.docs[0].data();
    const valid = String(merchant.storeid) === '123456' &&
      merchant.locked !== true && merchant.disabled !== true &&
      typeof merchant.password === 'string' && merchant.password.length > 0 &&
      same(password, merchant.password);

    return res.json({ ok: valid });
  } catch (_) {
    // Do not log passwords, bodies, merchant records or Authorization headers.
    console.error('Lighthouse password verification failed');
    return res.status(503).json({ ok: false, error: 'Verification unavailable' });
  }
}
```

Preserve the exact password string, including whitespace. Do not trim it, convert numbers to strings or impose a new eight-character requirement on the existing password. The SHA-256 buffers above are used only for an in-memory timing-safe comparison; they are not a change to stored passwords.

Do not return the merchant document or stored password. Do not write to Firestore. If the existing Firebase connection cannot read `merchant`, report that deployment permission issue; do not loosen existing Firestore rules or replace the shared Firebase connection to make it work.

### 3. Configure and test the Foodio API

- Generate a dedicated random service key with at least 32 random bytes, encoded as a string. Configure `LIGHTHOUSE_VERIFY_API_KEY` securely in the Foodio API deployment and the matching value in Smart Kotak's backend.
- Do not reuse the existing phone/store-derived token or put the real password/key into test fixtures, URLs, source files, screenshots, request logs or committed configuration.
- Keep the existing HTTP request-size limit. Keep login attempt throttling in the Smart Kotak backend before it calls this function; do not rely on CORS as authentication.
- Test with a mocked Firestore lookup: correct/wrong password, short legacy password, empty/non-string input, missing/wrong service key, wrong project, missing/duplicate merchant, wrong store ID, locked/disabled account and Firestore failure. Verify no credential contents reach logs/responses.
- Confirm unauthorized callers never trigger a Firestore read and that existing UserRouter routes are unchanged.

Deploy the endpoint first. An authorized operator should supply the actual Lighthouse password privately for a controlled live check; the plan deliberately contains no real password.

## Subsequent Smart Kotak integration

The Flutter login screen should continue calling its own Smart Kotak `/smart-kotak/login`. Only the Smart Kotak backend calls the new Foodio endpoint when the normalized username is `123456`:

```text
Flutter login → Smart Kotak backend → Foodio /user/verifylighthousepassword
```

Backend settings:

```text
SMART_KOTAK_LIGHTHOUSE_VERIFY_URL=https://api.foodio.online/user/verifylighthousepassword
SMART_KOTAK_LIGHTHOUSE_SERVICE_TOKEN=<same dedicated service key>
```

Keep `SMART_KOTAK_FIREBASE_PROJECT_ID` pointing to the selected Smart Kotak project. Accounts, funds, sessions and schedules stay there. Only password verification reads Foodio.

Backend handling:

1. Apply login attempt limits, then POST `{ password }` with the service key in the Authorization header. Use the exact configured HTTPS URL, a five-second timeout and no redirects or automatic credential retries.
2. HTTP 200 with JSON `ok === true`: create a normal signed Smart Kotak session with the system-administrator role.
3. HTTP 200 with JSON `ok === false`: reject the login as invalid credentials.
4. Non-200, malformed response, string `"true"`, timeout or network error: grant no access. Show verification unavailable. A Foodio 401 means the backend service key is wrong/missing, not that the human password is wrong.
5. Never accept a browser-supplied verification result or send the service key to Flutter. Do not save the supplied password or its digest in Smart Kotak.

**Change both `PortalService.login()` and `checkActor()` in `services/smart_kotak/src/portal.mjs`.** The current implementation repeats a local merchant lookup during session validation, so changing only login is insufficient.

For this simple one-endpoint design, issue a 15-minute, non-renewing system session after remote verification. Store only the normal token hash, subject `lighthouse:123456`, provider `foodio-lighthouse-v1`, verified timestamp, expiry and revoked flag in Smart Kotak. Validate its signature, trusted server-side session, fixed subject, provider, expiry and revocation on subsequent requests. Derive `system_admin` and empty programme IDs server-side; an ordinary portal row or browser-supplied role must not grant this access.

Remote verification happens before the session-writing transaction, never inside a retryable Firestore transaction. In this mode do not query a local Lighthouse merchant, require local password fingerprints, or fall back to a copied password. Reject old local-Lighthouse sessions and require fresh sign-in. Keep all existing system-route guards and normal account authentication intact.

Trade-off: changing/locking the Foodio Lighthouse credential blocks new sign-ins immediately; existing Smart Kotak system sessions can remain valid for up to 15 minutes. This simple endpoint does not provide immediate central session revocation. Local sign-out/revocation still works.

Update Smart Kotak's deployment helper to preserve the verifier URL and secret reference on redeployment. Replace the previous local-Lighthouse bootstrap instructions for this flow. The two administration options, environment badge and project destination remain as implemented.

## Deployment prerequisite found in GitHub

The reviewed `perkd/server.js` imports six files absent from its GitHub tree:

- `vendingplusrouter.js`
- `ceriainsightrouter.js`
- `airwallexrouter.js`
- `kdsrouter.js`
- `lalamoverouter.js`
- `ceriarouter.js`

Check the complete laptop/deployment checkout before redeploying the whole Foodio API. Restore the real files where needed; do not remove or stub unrelated routes. This does not prevent preparing or testing the password-check function with injected/mocked dependencies, but a full deployment needs a working complete source tree.

## Done when

- [ ] The one UserRouter function and route are implemented and tested.
- [ ] Foodio endpoint is deployed and returns the correct boolean with a valid service key.
- [ ] Smart Kotak uses it for `123456`, including subsequent local session validation.
- [ ] No Lighthouse credential copy is required in Smart Kotak.
- [ ] Normal logins work and system administration writes stay in the selected Smart Kotak project.
- [ ] Changes and deployment instructions are committed in the respective repositories.
