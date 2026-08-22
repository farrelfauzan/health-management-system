# Feature Entitlements

Companion to [decisions.md](./decisions.md) (**D-025**) and [multi-tenancy.md](./multi-tenancy.md). Covers `IMP-6` … `IMP-10`: what a feature entitlement is, what each key actually gates, how to switch one, and how to onboard a client onto a package.

**Status:** shipped and in use. `IMP-6` … `IMP-9` are on `main`.

**Audience:** whoever operates a deployment. This is a vendor-side document — nothing in it describes something a clinic does, and per **D-025** nothing in it ever will.

---

## 1. What an entitlement is

A feature entitlement answers one question: **did this client buy this module?** It is commercial packaging, not security. Two consequences follow, and most confusion about this system comes from missing one of them.

- **RBAC is still the security boundary.** A feature nobody sold is still behind `PermissionsGuard`. Entitlements decide what a clinic *has*; permissions decide what a user *may do* with what the clinic has.
- **A disabled feature overrides any role permission.** The two compose in one direction only. A super admin with every grant in the catalog still gets `FEATURE_DISABLED` on a feature the clinic did not buy.

The keys are code-owned. `FEATURE_CATALOG` in `@hms/shared-types` is the definition; rows in `feature_entitlements` are only the on/off *state* for keys that appear there. A key nothing implements cannot be typed into existence through the API.

What is deliberately **absent** from the catalog matters as much as what is in it: `auth`, `health`, `rbac`, `admin-management`, patients, doctors and appointments are platform core. A clinic that switched off patients would not have a cheaper HMS, it would have a broken one.

---

## 2. The catalog

Nine keys, all defaulting to **enabled**. "Gates" means the controllers `FeatureGuard` silences when the key is off; "hides" means the nav routes the shell drops.

| Key | Name | Hides (nav) | Gates (API) |
| --- | --- | --- | --- |
| `ai-chatbot` | AI Assistant | `/admin/ai-assistant`, `/admin/ai-providers`, `/doctor/ai-assistant` | `ChatController`, `AiProviderController` |
| `document-management` | Documents & Knowledge Base | `/admin/knowledge-base`, `/admin/clinic-corpus`, `/doctor/knowledge-base` | `DocumentAdminController`, `PersonalDocumentController` |
| `cs-channels` | Customer Service Channels | `/admin/conversations` | `ChannelGatewayAdminController`, `TelegramWebhookController`, `WhatsappWebhookController`, `CsAdminController`, `ChannelArrivalController` |
| `bpjs-pcare` | BPJS PCare | `/admin/integrations` | `BpjsEligibilityController`, `BpjsMappingController`, `BpjsPcareConfigController`, `BpjsReferenceController`, `BpjsReportController`, `BpjsSubmissionController` |
| `bpjs-antrean` | BPJS Antrean | `/admin/integrations` | `BpjsAntreanConfigController`, `BpjsAntreanWsController` |
| `satusehat` | SATUSEHAT | `/admin/integrations` | `SatusehatLinkController`, `SatusehatSubmissionController` |
| `pharmacy` | Pharmacy | `/admin/pharmacy` | — nothing yet, see §8 |
| `billing` | Billing | `/admin/billing` | — nothing yet, see §8 |
| `room-management` | Rooms & Inpatient | — no screens yet | — no module yet, Phase 3 |

**`/admin/integrations` is shared by three keys.** It is hidden only when all three are off. Switching off SATUSEHAT alone leaves the screen in place, because a clinic still running PCare needs it.

---

## 3. How enforcement works

Guard order is `JwtAuthGuard` → `PermissionsGuard` → `FeatureGuard`, and the order is load-bearing. `FeatureGuard` runs **last** so a caller without the role grant is refused before the entitlement is ever consulted: they get plain `FORBIDDEN` and learn nothing about the clinic's package, while a caller who would otherwise have been allowed gets the accurate `FEATURE_DISABLED` and can render "not included in your plan".

```
403 { "error": { "code": "FEATURE_DISABLED", "message": "The ai-chatbot feature is not enabled for this client" } }
```

Three behaviours worth knowing:

- **A key with no stored row reads as enabled.** Migrations and the seed are separate deploy steps, so a release that adds a catalog key is briefly live with the row absent. Failing closed there would turn every such release into a silent outage of a feature the clinic pays for.
- **`@PublicRoute()` does not stand the guard down.** The Telegram and WhatsApp webhooks authenticate with a provider signature rather than a session, and a clinic that did not buy the channels must not have its inbound endpoint answering. The provider will retry, back off, and eventually drop the registration — the right end state for a channel this deployment does not run.
- **One route is exempt.** `GET /chat/availability` carries `@FeatureIndependent()`, so a client can tell "this clinic did not buy chat" from "the availability call failed".

Cost per request is a `Set` lookup. `FeatureAvailabilityCacheService` holds the **disabled** key set behind a 10-second TTL, invalidated directly on write. The direct invalidation covers the instance that took the write, so an operator sees a toggle on their very next request; the TTL covers the other instances in a multi-process deployment, which an in-memory invalidation cannot reach.

`feature-guard-coverage.spec.ts` pins the whole map — which controllers are gated by which key, which are platform core, which keys are deliberately unenforced, and which routes are exempt. Changing any of those is a visible line in a PR.

---

## 4. How the shell hides things

The disabled key set rides on `hms_session_hint`, the non-credential rendering-hint cookie the API issues at login and refresh. The layouts read it synchronously alongside roles and `portal.*` permissions, so nothing is fetched and nothing flashes.

**The consequence to remember when testing: a toggle does not move a live session's sidebar.** The hint is stamped at login and refresh, so the user has to sign in again, or wait out `JWT_ACCESS_EXPIRES_IN` (15 minutes by default) for the client to refresh. The API refuses the routes immediately either way — only the navigation lags. This is the same staleness window accepted for permission claims in **D-022** ([docs/MVP/decisions.md](../MVP/decisions.md) — note the post-MVP file has an unrelated D-022 of its own).

The cookie carries *disabled* keys rather than enabled ones so that absence means "hide nothing". A hint issued before the field existed must not blank the sidebar.

This is visibility only. Hiding a nav entry is not a security control; `FeatureGuard` refuses the endpoints whatever the sidebar shows.

---

## 5. Runbook: switching a feature

There is **no user interface**, by design (**D-025**). Three ways exist to change a switch and only the first is supported:

| Way | Supported | Why |
| --- | --- | --- |
| `PUT /api/v1/admin/features/:key` | **yes** | Writes a `FEATURE_TOGGLED` audit row and invalidates the cache |
| `seed.sql` | new databases only | The insert is `ON CONFLICT DO NOTHING`; it cannot change an existing deployment |
| Direct SQL | **no** | No audit row, and other instances keep serving stale state until the TTL |

### 5.1 Getting a token

The call needs `feature.manage:any`, which today only `SUPER_ADMIN` holds. If that account has MFA enrolled, password login stops at a TOTP challenge and returns a 120-second ticket rather than tokens — so either complete the challenge, or mint a token directly. The `sub` is computable, because `seed.sql` derives every seeded id as `md5('user:' || email)`:

```bash
cd apps/api && node -e 'const f=require("fs"),c=require("crypto");const e=Object.fromEntries(f.readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim().replace(/^"|"$/g,"")]));const h=c.createHash("md5").update("user:admin@salingjaga.com").digest("hex");const sub=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1e3);const p=`${b({alg:"HS256",typ:"JWT"})}.${b({sub,email:"admin@salingjaga.com",iat:n,exp:n+1800})}`;console.log(`${p}.${c.createHmac("sha256",e.JWT_ACCESS_SECRET).update(p).digest("base64url")}`)'
```

### 5.2 Reading the current state

```bash
curl -s "$API/api/v1/admin/features" -H "Authorization: Bearer $TOKEN" | jq -r '.data[] | "\(.key)\t\(if .isEnabled then "on" else "OFF" end)"'
```

### 5.3 Switching one off

```bash
curl -s -X PUT "$API/api/v1/admin/features/bpjs-pcare" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"isEnabled":false,"notes":"not in the clinic package"}' | jq -c .data
```

`notes` is free text for whoever comes after you — "not in the Rp X package", "paused pending BPJS credentials". Send `null` to clear it. Omit the field entirely to leave an existing note alone.

### 5.4 Verifying

```bash
curl -s "$API/api/v1/features/availability" -H "Authorization: Bearer $TOKEN" | jq -c '.data.enabledKeys'
```

The key should be gone from the list on the very next request, and any route behind it should answer `403 FEATURE_DISABLED`.

### 5.5 Reading the trail afterwards

Every toggle writes one row: `action = FEATURE_TOGGLED`, `resource = 'feature-entitlement'`, with metadata carrying the state on both sides.

```sql
SELECT occurred_at, actor_user_id, metadata
FROM audit_logs
WHERE resource = 'feature-entitlement'
ORDER BY occurred_at DESC;
```

---

## 6. Onboarding a client onto a package

Two steps, and it cannot currently be one:

1. Deploy, migrate, seed. **Every key comes up enabled.**
2. Switch off what the client did not buy, one `PUT` per key.

The seed cannot do step 2. Its insert is `ON CONFLICT DO NOTHING` deliberately — `is_enabled` is the one column in `seed.sql` a customer owns, and a seed that asserted a package would switch a paused feature back on at every deploy. So the seed sets the initial state only, and that state is always everything-on.

The canonical example — a clinic that bought everything except the chatbot:

```bash
curl -s -X PUT "$API/api/v1/admin/features/ai-chatbot" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"isEnabled":false,"notes":"not in package"}'
```

For more than a couple of keys this gets tedious and error-prone; `IMP-20` covers a provisioning script that reads the current state first and writes only the differences.

---

## 7. Gotchas

Each of these has cost real time at least once:

1. **`pnpm --filter @hms/shared-types build` before starting the API.** The dev server loads the prebuilt `dist` bundle, not the TypeScript source, so without a rebuild `FEATURE_CATALOG` is simply absent and the endpoints fail with nothing that explains why.
2. **`prisma migrate deploy`, not `migrate dev`.** Non-interactive, applies pending migrations only, never offers to reset.
3. **Seed before testing.** Without it there is no `feature.manage:any` permission row, so the `PUT` answers 403 and it looks like a bug in the guard.
4. **A toggle does not move an open session's sidebar.** See §4 — log in again.
5. **`disabledFeatures: []` in the hint cookie is correct** when nothing is switched off. It only becomes interesting after a toggle.

---

## 8. Known gaps

- **Three keys hide navigation but refuse nothing.** `pharmacy` and `billing` fell outside `IMP-8`'s enumerated scope; `room-management` has no module until Phase 3. Switching off `billing` today removes the nav entry and leaves `/api/v1/billing/*` answering normally. Tracked as `IMP-18`, and listed explicitly in `feature-guard-coverage.spec.ts` so the gap stays a decision rather than an oversight.
- **Background workers are not gated.** `FeatureGuard` sits in front of HTTP routes only. `satusehat-submission.worker`, `bpjs-submission.worker` and `document-ingestion.worker` keep running when their feature is switched off. For a clinic that never had the feature this is harmless — nothing is ever enqueued — but a clinic switched off mid-flight will keep draining its existing queue to the vendor.
- **There is no vendor account.** `feature.manage:any` reaches only `SUPER_ADMIN`, and `seed.sql` assigns `SUPER_ADMIN` to the clinic's own administrator. So today the clinic can switch its own features back on, and a reserved service account cannot substitute — the login path refuses `is_system` users. The seed-level fix does not work either, because `PermissionsGuard` short-circuits `SUPER_ADMIN` to `manage:all` before role rows are consulted. Closing this is `IMP-19`, at M0.
- **No management UI, and none is planned in the clinic app.** See **D-025**.

---

## 9. Where this goes

At M0 of [multi-tenancy.md](./multi-tenancy.md) the entitlement becomes a control-plane table, the tenant-side row becomes a projection refreshed on write, and `PUT /admin/features/:key` stops being an operator-facing endpoint and becomes the control plane's write path into a tenant. The toggle screen lands in the internal console beside the tenant registry.

Enforcement does not move. `FeatureGuard` has to keep reading on the tenant's own connection — putting a network hop in front of every guarded request is the one thing the cache exists to avoid.
