# Central capture contract v1 — disabled adapter draft

Dependency: [tools hub PR11](https://github.com/MeanGreen256/whitness_tools_page/pull/11), register head `10cdcc072abeb90d91df6c96e4b82e02a365b4cf`. The shared `server/contact-register.mjs` adapter is byte-identical across the Plate, Gut Check and Diabetes Assessment drafts. Change its contract and tests together. No live register, credentials or owner sessions are configured by these drafts.

The owner approved a dedicated Postgres database, preferably Neon through Vercel, a private tools-hub owner dashboard, access-only capture without new newsletter enrollment, and contacts retained until deletion independently of session expiry. The two intended owners are confirmed privately. Actual verified provider user IDs and organization still need secure resolution/pinning; an email string alone never grants access. Provider legal terms, security/credentials setup and any paid commitment remain separate held steps. Aim for an approved free-tier configuration; do not create one or accept terms from this document.

## Disabled and enabled behavior

Missing approval or any incomplete/invalid configuration means the new integration is **off**. Public Plate and existing quiz flows remain usable. A POST to a disabled capture API returns 503, never `{captured:true}`. A stale enabled page can reload to recover the public flow. This intentional rollout switch is not an authentication boundary or an assurance that disabled visitors were captured.

Once complete, approved configuration enables capture, an actual network/store failure does **not** downgrade that visitor to a false success. The UI reports failure and permits retry. The same request ID survives an uncertain response while the email and notice remain unchanged. Changing input/notice or beginning a new intentional submission after success uses a new ID. No email or request ID is persisted in browser storage, URLs or analytics.

Plate confirms the central write before creating a visitor session. Redis stores opaque session markers and short-lived abuse counters only; there are no Redis email records or contact retention TTLs. Session deletion/expiry does not delete the central contact. Existing sessions do not look up the contact on every visit, so deleting a contact does not revoke an anonymous visitor session; this public educational tool is not account authentication. Policy-version changes invalidate the session namespace. No old v1 session is accepted by the v2 implementation.

Gut and Diabetes reuse the existing email form, then continue the existing results flow only after confirmed capture when enabled. Gut's optional newsletter checkbox remains unchecked by default and solely controls its existing subscription request. Diabetes's existing subscription/status/retry flow remains separate and unchanged. Central capture sends neither newsletter consent nor health tags. No existing Kit records are imported or synchronized. Gut's public dev-results shortcut is disabled only when central capture is enabled.

Label is already account-based for own scans and must not get another email gate. This batch does not edit Label or Meals. A separately coordinated Label adapter can reuse the approved existing account identity without changing sign-in/sample access. Meals synchronization remains outside scope pending a specific decision.

## Wire format and security

The source app's server POSTs to the central `/api/contact-register/capture` endpoint:

```json
{"email":"synthetic@example.test","requestId":"c7cd8eb7-c4ad-41da-9918-2eae721824de","noticeVersion":"approved-version"}
```

Only these fields are accepted. No name, answer, score, result type, health data, IP, source override, tenant, verification claim or marketing choice is forwarded. Domain lowercase/trim matches the hub; local-part case, dots and plus aliases are preserved. Syntax validation does not establish ownership. The hub records new entries as unverified / marketing not requested.

The server adds a per-app bearer credential. The register binds its digest to `plate`, `gut-check` or `diabetes-assessment` and the approved notice version. It selects the tenant on the server. Tokens stay out of the browser and are never accepted as owner-list credentials. Redirects are prohibited and upstream requests time out. Public app endpoints validate the exact configured origin, content type, body size, notice, UUID and email before forwarding. Plate uses its isolated Redis rate counter; quiz limiters are bounded per-process defenses, supplemented by the central per-app database cap, not a distributed visitor quota.

Only HTTP success with `captured:true` confirms central storage. Unknown/false success, auth rejection, malformed response or network failure becomes a retryable generic 503; upstream private messages are not exposed. Central 409 conflict/stale notice and 429 rate limit are retained. The hub transaction deduplicates `(tenant, source, requestId)` and rejects changed payload reuse. A lost response after commit is safe to retry. Contact rows and source/notice history have no automatic expiry.

## Held configuration

All are server-only; only notice version, disclosure and privacy URL reach the quiz page/Plate gate:

| Environment key | Required value |
| --- | --- |
| `CONTACT_CAPTURE_APPROVED` | Exact `true` after notice and secure setup acceptance |
| `CONTACT_REGISTER_URL` | Approved HTTPS endpoint ending exactly `/api/contact-register/capture`, no query or fragment |
| `CONTACT_REGISTER_TOKEN` | This app's approved write-only secret, at least 32 random bytes encoded base64url; never reuse another app token |
| `CONTACT_CAPTURE_ORIGIN` | Exact HTTPS public app origin |
| `CONTACT_CAPTURE_NOTICE_VERSION` | Must match the notice version registered for this app credential |
| `CONTACT_CAPTURE_DISCLOSURE` | Accurate approved use/retention/deletion text, 1–2000 characters |
| `CONTACT_CAPTURE_PRIVACY_URL` | Published owner-approved HTTPS privacy/deletion information |
| `CONTACT_CAPTURE_ISOLATED_PREVIEW` | Additional exact `true` only after verifying nonproduction isolation |

Plate additionally needs `PLATE_KV_REST_API_URL`, `PLATE_KV_REST_API_TOKEN` for a dedicated approved session/rate store, and `PLATE_ACCESS_SESSION_SECONDS` (60–31,536,000 seconds; choose the owner-approved duration). These have no effect on contact retention. `PLATE_EMAIL_RETENTION_SECONDS` and the former `PLATE_ACCESS_APPROVED` configuration do not enable this adapter.

Configure the register first with an approved dedicated database, restricted runtime role, verified owner IDs/org, app-specific credential digests and matching notice versions. Then test adapters against an empty isolated nonproduction register with synthetic addresses and separately approved test identities. Never inherit Meals credentials or copy production contacts into a preview. Automatic Git deployment is disabled on the adapter draft branches. No merge, deployment, environment mutation or migration is authorized by green tests.

## Use/deletion notice draft — not yet published

> Whitness Nutrition records your email address, the free tool you use, and when you submit it in our shared contact register. We use this record to record access to our free tools. We keep it until it is deleted; the expiration of a browser session does not delete it. This access record does not subscribe you to a newsletter or verify that you own the address. Any existing newsletter choice is handled separately. To request access to or deletion of your contact record, use **[owner-approved request channel]**. See **[published privacy information]** for details.

The approved direction is reflected above without inventing a 90-day expiry, a response deadline, or a backup-deletion promise. Before publication, confirm the request channel, actual responsible organization wording, backup/export handling and privacy URL. Do not enable the adapter with placeholders. No newsletter consent policy is created by this draft.

## Evidence limits and remaining gates

Contract tests call real adapter functions with synthetic transport responses. UI tests use mocked responses and verify timing, retry IDs, checkbox/subscription separation, timeout and stale completion. Browser tests run the actual production-mode Next build on temporary **local loopback servers**, with an isolated headless browser and mocked capture/AI/newsletter routes; they are not hosted-production tests. Plate browser tests use its built static application and real handler with synthetic upstream fixtures. Actual local Redis validates session/Lua TTL behavior, not contact durability.

The separate cross-repository harness connects all three real adapters to the real hub handler, schema and local PGlite PostgreSQL store. It verifies credential-bound source attribution, one deduplicated contact, notice events, conflict rejection, tenant isolation, and contact survival after Plate session removal. PGlite is real local PostgreSQL SQL but serializes its transactions. It does not establish hosted durability, actual parallel database connections, TLS/role provisioning, backups, or real owner authentication.

Still required before activation: secure provider/identity setup; approved published notice/request channel; exact deployed-origin integration; real hosted PostgreSQL contention/outage/retry/deletion/restore tests; actual owner sessions; manual device/screen-reader acceptance; explicit merge/deployment approval. Existing framework dependency advisories, where reported by each repository's audit, are separate unresolved release concerns, not fixed by these adapters. Clinical models, scoring, question text and existing newsletter API code are unchanged.
