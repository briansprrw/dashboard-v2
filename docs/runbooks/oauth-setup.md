# Dash2 Google OAuth Setup

Scope: creating and configuring the Google OAuth client that Dash2 uses for sign-in, and wiring it
to an environment. Written for the **preview** environment, which is where M2.3 authentication was
first configured (Brian's decision, 2026-07-25: use the existing preview environment rather than
creating a staging one — see `docs/runbooks/environments.md`).

**No secret value appears in this document, and none ever should.** Only variable names, hostnames,
and the location where each secret lives.

## What Dash2 needs from Google

Dash2 uses Google solely to establish _identity_ at sign-in. It requests `openid email profile`,
uses the resulting ID token once, and never calls Google again on the user's behalf — no refresh
token is requested and none is stored. V2 supports only users migrated from V1 (M0 §2), so a
successful Google authentication for an unknown email is a **denial**, not a sign-up.

## Environment values

| Environment | Redirect URI                                                   | Where secrets live                             |
| ----------- | -------------------------------------------------------------- | ---------------------------------------------- |
| preview     | `https://dash2-preview.b-f75.workers.dev/api/v1/auth/callback` | Wrangler secrets on the `dash2-preview` Worker |
| local       | `http://localhost:8787/api/v1/auth/callback`                   | `.dev.vars` (gitignored), optional             |
| production  | Not yet defined — M8                                           | Not yet defined                                |

## One-time: create the Google OAuth client

Performed by Brian in the Google Cloud Console. Claude cannot do this step and never sees the
resulting values.

1. **APIs & Services → OAuth consent screen**
   - User type: **External**.
   - Publishing status may remain **Testing**. Add each intended Dash2 user as a **Test user** —
     in Testing mode Google refuses sign-in for anyone not on that list, which is a useful second
     gate on top of Dash2's own migrated-users-only rule.
   - Scopes: the default `openid`, `email`, `profile` are sufficient. Add nothing else.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**.
   - Name: something identifying, e.g. `Dash2 Preview`.
   - **Authorized redirect URIs:** add the exact URI from the table above.
     Google compares this **byte for byte** — scheme, host, path, and the absence of a trailing
     slash all matter. A mismatch produces `redirect_uri_mismatch` at sign-in.
   - Authorized JavaScript origins: not required. Dash2's flow is a server-side redirect; the
     browser never calls Google directly.
3. Copy the **Client ID** and **Client secret**.

## Wire the client to preview

### Secrets

Set from a shell with access to the Cloudflare account. The values are prompted for and are never
written to disk, source, logs, or milestone evidence:

```sh
npx wrangler secret put GOOGLE_CLIENT_ID --env preview
npx wrangler secret put GOOGLE_CLIENT_SECRET --env preview
```

Confirm they exist without revealing them:

```sh
npx wrangler secret list --env preview
```

### Non-secret vars

Already committed in `wrangler.jsonc` under `env.preview.vars`:

- `OAUTH_REDIRECT_URI` — must equal the URI registered on the Google client.
- `ALLOWED_ORIGINS` — origins permitted to make state-changing requests.
- `COOKIE_SECURE` — deliberately **unset**. Anything other than the literal string `"false"`
  produces `Secure` cookies, so HTTPS environments get them by default and the insecure setting
  must be chosen explicitly. Only plain-HTTP local development sets it to `"false"`.

Changing a var requires a redeploy; changing a secret does not.

### Database schema

Authentication reads and writes the M2 domain tables, including `user_identities.subject_pending`
(added by `0004_identity_subject_pending.sql`, M2-FQA-RR-01), so the environment's D1 must be at
**exactly schema version 3** — `/api/v1/health` compares the stored version against
`EXPECTED_SCHEMA_VERSION` for equality, not "at least." Check before expecting sign-in to work:

```sh
npx wrangler d1 execute DASH2_DB --env preview --remote \
  --command "SELECT MAX(version) AS v FROM schema_version"
```

If it reports anything other than `3` — including `1` (no domain schema) or `2` (the current known
`dash2-preview` state: `0002`/`0003` applied, `0004` not yet applied) — apply the migrations (a gated
production mutation — see `docs/runbooks/preview-deployment.md`):

```sh
npx wrangler d1 migrations apply DASH2_DB --env preview --remote
```

`/api/v1/health` reports `503 degraded` while the applied version does not match what the deployed
code expects, which is the intended safe-degrade behaviour rather than a crash.

## Local development (optional)

Local sign-in needs its own redirect URI registered on the same Google client (or a separate one),
plus a gitignored `.dev.vars` at the repository root:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
OAUTH_REDIRECT_URI=http://localhost:8787/api/v1/auth/callback
ALLOWED_ORIGINS=http://localhost:8787
COOKIE_SECURE=false
```

`COOKIE_SECURE=false` is required locally: a `Secure` cookie is not stored over plain HTTP, so
sign-in would appear to succeed and then immediately fail to authenticate.

`.dev.vars` is gitignored. Never commit it, and never paste its contents into a prompt, log,
handoff, or milestone document.

## Verifying a real sign-in

Dash2's authentication is fully tested against real Miniflare KV and D1, but the **live Google
exchange has never been exercised** (M2-R7): the endpoints, parameter names, and claim names in
`src/server/auth/google-provider.ts` follow Google's published contract but are unverified
assumptions until one real sign-in happens. That first sign-in is therefore a genuine test, not a
formality.

1. Visit `https://dash2-preview.b-f75.workers.dev/api/v1/auth/start` in a browser.
2. Expect a redirect to Google's consent screen.
3. Sign in as a user who **exists in the Dash2 database** and is `active`.
4. Expect a redirect back to `/` with a `dash2_session` cookie set.
5. Confirm the session resolves:
   `curl -b "dash2_session=..." https://dash2-preview.b-f75.workers.dev/api/v1/auth/session`

### If it fails

Every user-facing authentication failure is deliberately identical — a redirect to
`/signed-out?error=1` with no detail — so that an unauthenticated caller cannot probe which email
addresses have accounts. The specific reason is in the Worker logs:

```sh
npx wrangler tail --env preview
```

Look for `{"code":"AUTH_FAILED","detail":{"reason":"..."}}`. Reasons and their meanings:

| Reason               | Meaning                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_state`      | State missing, expired (>10 min), or replayed. Also produced by a stale browser tab.                                              |
| `exchange_failed`    | Google rejected the code exchange. Usually a client ID/secret or redirect-URI mismatch.                                           |
| `unverified_email`   | The Google account's email is not verified.                                                                                       |
| `no_account`         | Authentication succeeded but no Dash2 account exists for that email. **Expected** for a non-migrated user — V2 has no onboarding. |
| `account_ineligible` | The account exists but is `disabled` or `recycled`.                                                                               |

`redirect_uri_mismatch` appears on Google's own error page rather than in Dash2's logs, and means
`OAUTH_REDIRECT_URI` and the value registered on the Google client differ.

## Rotating or revoking

- **Rotate the secret:** create a new secret on the same Google client, run `wrangler secret put
GOOGLE_CLIENT_SECRET --env preview` with the new value, verify a sign-in, then delete the old
  secret in the Google console. No redeploy is needed.
- **Revoke all Dash2 sessions:** rotating the Google secret does **not** invalidate existing Dash2
  sessions — they are opaque server-side records independent of Google. Use the administrative
  per-user revocation (`POST /api/v1/admin/users/:userId/revoke-sessions`), which bumps
  `users.auth_version` and invalidates that user's sessions on their next request.

## Related

- `docs/runbooks/environments.md` — the environment matrix and resource ownership.
- `docs/runbooks/preview-deployment.md` — deploying and migrating preview.
- `docs/milestones/M2-domain-auth-and-authorization.md` — M2-R4, M2-R7, and decisions M2-D11..M2-D13.
