# HMS AI Chatbot Integration (Post-MVP)

Companion to [implementation-plan.md](./implementation-plan.md). This document defines scope, architecture, safety policy, and delivery tasks for the `ai-chatbot` module.

**Placement:** Phase 13 — after SATUSEHAT integration (Phase 10) is complete. Do not start before `P10-T06` (sandbox submission pipeline and ops surface are stable).

## 1. Why Post-MVP and After SATUSEHAT

Indonesian clinic buyers prioritize regulatory compliance (RME, SATUSEHAT, BPJS) and front-desk basics (queue, billing) over conversational AI. Incumbents already ship clinical AI (e.g. voice-to-EMR, ICD suggestion), so a chatbot is UX polish — not a purchase wedge.

Deferring until after SATUSEHAT integration also unlocks richer, safer context:

| Capability available after Phase 10 | Chatbot benefit |
| ----------------------------------- | --------------- |
| Verified patient IHS number (`satusehatPatientId`) | Ground patient FAQ in confirmed master-index identity |
| Practitioner IHS + STR/SIP linkage | Doctor channel can reference licensed specialty context |
| Encounter, diagnosis (ICD-10), vitals | Non-diagnostic summaries of *already documented* visit data |
| Medication KFA codes + dispense records | Medication *information* (not prescribing) tied to catalog codes |
| SATUSEHAT submission audit trail | Align chat audit logs with national interoperability events |

The chatbot must never submit FHIR resources or mutate clinical records. It reads HMS domain data through service interfaces only.

## 2. Product Scope

### 2.1 In Scope (v1)

**Patient channel** (`ChatChannel.PATIENT`):

- Clinic operations FAQ (hours, location, services, insurance/BPJS process overview)
- Appointment guidance (how to book, reschedule, cancel — links to existing appointment APIs)
- General non-diagnostic health information (symptom awareness with explicit "see a clinician" routing)
- Registration and queue guidance (after Phase 8 queue module exists)

**Doctor channel** (`ChatChannel.DOCTOR`):

- Literature lookup and research summarization (external sources via provider)
- Clinical reference search (guidelines, drug interaction *information* — not patient-specific prescribing)
- Administrative shortcuts (e.g. "summarize today's appointments" from HMS read APIs)

**Platform**:

- Session lifecycle (create, list own sessions, send message, read history)
- Mandatory disclaimer on every assistant turn
- Full audit trail in PostgreSQL
- Rate limits and abuse protection
- **Multi-provider AI gateway** — clinic admin configures provider + API key; HMS routes to Claude, GPT, DeepSeek, Ollama (self-hosted), or any OpenAI-compatible endpoint. HMS does not run inference — it calls the configured upstream (no model weights in this repository).

### 2.2 Out of Scope (v1)

- Diagnosis or differential diagnosis
- Treatment or prescription generation without explicit clinician review workflow
- Autonomous EMR data entry (contrast: Assist.id-style voice-to-SOAP is a separate product decision)
- Replacing professional medical judgment in any user-facing copy
- Direct SATUSEHAT FHIR writes from chat flows
- Multi-turn clinical decision support that bypasses encounter workflow
- Voice input/output (evaluate in a later iteration)
- Real-time streaming tokens to the browser (start with request/response; streaming is optional v1.1)

### 2.3 Future Considerations (not committed)

- ICD-10 coding *suggestions* during encounter documentation (human-in-the-loop only)
- BPJS eligibility explanations using PCare adapter read models
- Admin analytics dashboard (session volume, safety tag trends, provider latency)

## 3. Safety and Compliance Policy

### 3.1 Hard Rules (enforce in service layer + provider system prompt)

1. **No diagnosis** — block or rewrite responses that assert a diagnosis; attach `safetyTags: ["diagnosis_attempt"]` when detected.
2. **No prescribing** — block medication orders; allow general drug class information only.
3. **Disclaimer required** — every assistant message persisted with `disclaimerShown: true`; API returns disclaimer text in envelope `meta`.
4. **Escalation copy** — emergency symptom patterns route to "contact emergency services / visit ER" template (Indonesian + English).
5. **PII minimization** — do not send full national IDs, raw clinical notes, or unrelated patient data to the provider; use redacted context objects (see §5.3).
6. **Audit retention** — align with PMK 24/2022 RME retention (minimum 25 years) and UU PDP No. 27/2022 field-level audit (Phase 12 `P12-T05`).

### 3.2 Input Guards

- Max message length (e.g. 4 000 characters)
- Max messages per session per hour (configurable)
- Max sessions per user per day
- Block empty, binary, or known prompt-injection patterns (maintain denylist in config)
- Reject requests asking the model to ignore policies or impersonate clinicians

### 3.3 Output Guards

- Post-process provider response through a safety classifier step (provider-native or lightweight local rules)
- Strip markdown/HTML scripts; allow safe subset only
- If provider returns clinical certainty language, append standard uncertainty disclaimer

## 4. Architecture

### 4.1 Module Layout

Follow standard HMS module layering under `apps/api/src/modules/ai-chatbot/`:

```
ai-chatbot/
  controller/
  service/
    ai-chatbot.service.ts
    ai-provider-resolver.service.ts   # Loads clinic config, picks adapter
    context-enrichment.service.ts
    safety-policy.service.ts
  repository/
  dto/
  infrastructure/
    providers/
      ai-chat-provider.interface.ts   # Normalized contract all adapters implement
      ai-provider-registry.service.ts # Maps AiProviderKind -> adapter instance
      openai-compatible.adapter.ts    # OpenAI, DeepSeek, Ollama, Groq, Together, custom base URL
      anthropic.adapter.ts            # Claude (Messages API)
    ai-provider.types.ts              # Adapter-only wire types (not in shared-types)
    ai-provider-crypto.service.ts     # Encrypt/decrypt stored API keys
```

### 4.2 Integration Pattern

```
Client (web/mobile)
  -> POST /api/v1/chat/sessions/:id/messages
  -> AiChatbotService
       -> AiProviderResolverService (load clinic AiProviderConfig, decrypt key)
       -> AiProviderRegistry -> concrete adapter (OpenAI-compatible | Anthropic | …)
       -> ContextEnrichmentService (HMS read-only context)
       -> SafetyPolicyService (input validation)
       -> adapter.sendChatCompletion(resolvedConfig, normalizedInput)
       -> SafetyPolicyService (output validation + disclaimer)
       -> ChatRepository (persist user + assistant messages + providerKind/model audit)
  -> Response envelope { data, meta: { disclaimer, providerRequestId, providerKind, model } }
```

Cross-module reads (appointments, patient profile summaries, encounter summaries) go through **existing domain services**, never foreign repositories.

### 4.3 Multi-Provider AI Service

HMS does **not** hard-code a single vendor. Each clinic (facility) configures which upstream provider and model to use. The backend exposes one normalized `AiChatProvider` interface; per-vendor adapters translate HMS requests into provider-specific HTTP calls.

#### 4.3.1 Supported provider kinds (v1)

| `AiProviderKind` | Example models | Wire protocol | Default base URL |
| ---------------- | -------------- | ------------- | ---------------- |
| `OPENAI` | `gpt-4o`, `gpt-4o-mini` | OpenAI Chat Completions | `https://api.openai.com/v1` |
| `DEEPSEEK` | `deepseek-chat`, `deepseek-reasoner` | OpenAI-compatible | `https://api.deepseek.com/v1` |
| `ANTHROPIC` | `claude-sonnet-4-20250514`, `claude-3-5-haiku-20241022` | Anthropic Messages API | `https://api.anthropic.com/v1` |
| `OLLAMA` | `llama3.2`, `mistral`, `qwen2.5`, `deepseek-r1` (local tag) | OpenAI-compatible (`/v1/chat/completions`) | `http://127.0.0.1:11434/v1` |
| `OPENAI_COMPATIBLE` | User-defined (Groq, Together, LiteLLM gateway) | OpenAI Chat Completions | **Required** — admin supplies `baseUrl` |
| `AZURE_OPENAI` | Deployment name as `model` | OpenAI-compatible + `api-key` header | Admin supplies Azure resource URL |

Add new kinds by implementing `AiChatProvider` and registering in `AiProviderRegistry` — no changes to `AiChatbotService` orchestration.

**Adapter split:**

- `OpenAiCompatibleAdapter` — one implementation for all OpenAI-shaped APIs (`OPENAI`, `DEEPSEEK`, `OLLAMA`, `OPENAI_COMPATIBLE`, `AZURE_OPENAI`). Differences (auth header name, api-version query param, optional auth for Ollama) live in small strategy objects keyed by `AiProviderKind`.
- `AnthropicAdapter` — separate because Claude uses the Messages API (`/messages`), different auth header (`x-api-key`), and `system` prompt placement. The adapter normalizes to the same HMS result type.

**Ollama notes (`OLLAMA`):**

- Ollama is **self-hosted by the clinic** (or used in local dev); HMS connects to it as an external HTTP upstream — same adapter pattern as cloud APIs, but no vendor API key by default.
- `apiKey` is **optional** for `OLLAMA` (omit or leave blank when Ollama has no auth; store empty ciphertext). If Ollama is fronted with a reverse proxy or `OLLAMA_API_KEY`, admins supply the key as usual.
- `defaultModel` must match an Ollama model tag visible in `ollama list` on the target host (e.g. `llama3.2`, `mistral:latest`).
- `baseUrl` defaults to `http://127.0.0.1:11434/v1`; override for a remote Ollama host (e.g. `http://ollama.internal:11434/v1`). In Docker dev, point at the host gateway (e.g. `http://host.docker.internal:11434/v1`) — the API container must reach the Ollama process on the network.
- Recommended for **dev/staging and air-gapped clinics**; production cloud deployments typically use `OPENAI`, `ANTHROPIC`, or `DEEPSEEK`.

#### 4.3.2 Normalized provider contract

All adapters implement the same interface (types in `infrastructure/providers/ai-chat-provider.interface.ts`):

```typescript
type AiProviderKind =
  | 'OPENAI'
  | 'DEEPSEEK'
  | 'ANTHROPIC'
  | 'OLLAMA'
  | 'OPENAI_COMPATIBLE'
  | 'AZURE_OPENAI';

type ResolvedAiProviderConfig = {
  configId: string;
  providerKind: AiProviderKind;
  apiKey: string;           // decrypted in memory only for the request
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
};

type SendChatCompletionInput = {
  sessionExternalId: string | null;
  channel: 'PATIENT' | 'DOCTOR';
  messages: ReadonlyArray<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  contextPayload: Record<string, unknown>; // redacted HMS context
};

type SendChatCompletionResult = {
  content: string;
  providerKind: AiProviderKind;
  providerRequestId: string;
  providerMessageId: string | null;
  model: string;
  latencyMs: number;
  rawMetadata: Record<string, unknown>;
};

interface AiChatProvider {
  supports(kind: AiProviderKind): boolean;
  sendChatCompletion(
    config: ResolvedAiProviderConfig,
    input: SendChatCompletionInput,
  ): Promise<SendChatCompletionResult>;
}
```

`AiProviderResolverService` loads the clinic's active config, decrypts the API key, validates the model string against an allowlist pattern, and returns `{ adapter, config }` for the orchestration service.

#### 4.3.3 Clinic provider configuration (database)

Each facility stores **one active** provider configuration (v1). Secrets never appear in API responses or logs.

**`AiProviderConfig`** (new table, migration `P13-T01`):

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | UUID | PK |
| `facilityId` | UUID | FK — one active config per facility in v1 |
| `providerKind` | enum | See §4.3.1 |
| `displayName` | string | Admin label, e.g. "Clinic GPT-4o" |
| `apiKeyCiphertext` | string | Encrypted at rest (see §9) |
| `apiKeyHint` | string | Last 4 chars for admin UI, e.g. `…x7Kp` |
| `baseUrl` | string? | Override; required for `OPENAI_COMPATIBLE` and `AZURE_OPENAI`; optional for `OLLAMA` (defaults to `http://127.0.0.1:11434/v1`) |
| `defaultModel` | string | e.g. `gpt-4o-mini`, `deepseek-chat`, `claude-sonnet-4-20250514` |
| `isActive` | boolean | Only one `true` per `facilityId`; defaults to `false` so a new config is staged, not switched on |
| `isEnabled` | boolean | Master switch — chat returns `AI_NOT_CONFIGURED` when false |
| `maxTokens` | int | Default 2048 |
| `timeoutMs` | int | Default 30000 |
| `credentialKeyVersion` | int | Which master key sealed `apiKeyCiphertext` (mirrors `BpjsPcareConfig`, so one rotation runbook covers both) |
| `lastTestedAt`, `lastTestResult` | timestamp, string? | Outcome of the `/test` endpoint (§4.3.4), surfaced in the admin UI |
| `createdById`, `updatedById` | UUID | Admin audit |
| `createdAt`, `updatedAt`, `deletedAt` | timestamps | Soft delete |

As shipped in `P13-T01`: `facilityId` is nullable, matching `BpjsPcareConfig` — HMS ships single-facility, so the live deployment holds one facility-less row and a multi-facility build fills the column in without a table rewrite. "Only one `true` per `facilityId`" is enforced by a hand-written partial unique index (Prisma cannot express one), scoped to rows that are both active and not soft-deleted so an admin can stage a replacement config and so a retired config does not keep holding the slot. `facilityId` is `COALESCE`d to the nil-UUID sentinel (`MrnCounter`'s convention) because Postgres treats NULLs as distinct, which would otherwise leave the only case that exists today unguarded.

**`ChatSession.providerKey`** stores the config id (or `providerKind:configId`) so audit trails show which clinic credential set handled the session. It is deliberately **not** a foreign key: a config can be soft-deleted or rotated away while the transcript lives on, and the platform env fallback below has no config row at all — an FK would either block those cases or force the column nullable and lose the audit trail. `ChatSession.providerKind` is denormalized next to it so support filtering and analytics never depend on the config row still existing.

Optional **platform fallback**: when no clinic config exists (dev/single-tenant), `AiProviderResolverService` may read deployment-level env defaults (`AI_PLATFORM_PROVIDER_*`). Production multi-tenant deployments should require explicit clinic configuration.

#### 4.3.4 Admin API — provider setup

| Method | Path | Permission | Description |
| ------ | ---- | ---------- | ----------- |
| `GET` | `/admin/ai-providers` | `ai-provider.read:any` | List configs for facility (no secrets; includes `apiKeyHint`) |
| `POST` | `/admin/ai-providers` | `ai-provider.write:any` | Create config (body includes plaintext `apiKey` once; stored encrypted) |
| `PATCH` | `/admin/ai-providers/:id` | `ai-provider.write:any` | Update model, base URL, enabled flag; optional `apiKey` rotation |
| `POST` | `/admin/ai-providers/:id/activate` | `ai-provider.write:any` | Set as active provider for facility |
| `POST` | `/admin/ai-providers/:id/test` | `ai-provider.write:any` | Send a minimal completion to verify key + model (no chat session created) |
| `DELETE` | `/admin/ai-providers/:id` | `ai-provider.write:any` | Soft-delete; block if last active config while chat enabled |

Admin UI (Phase 13): provider kind dropdown, model text input with kind-specific placeholders, masked API key field, "Test connection" button, active badge.

#### 4.3.5 Request flow example

1. Clinic admin saves DeepSeek config: `providerKind=DEEPSEEK`, `apiKey=sk-…`, `defaultModel=deepseek-chat`.
2. Patient sends chat message → `AiProviderResolverService` loads active config for patient's facility.
3. Registry returns `OpenAiCompatibleAdapter` (DeepSeek uses OpenAI shape).
4. Adapter POSTs to `https://api.deepseek.com/v1/chat/completions` with clinic's key.
5. Response normalized → safety pass → persisted with `providerKind=DEEPSEEK`, `providerModel=deepseek-chat`.

Switching to Claude: admin creates `ANTHROPIC` config, activates it — **new sessions** use Claude; existing sessions keep historical audit metadata unchanged.

**Ollama example:** admin sets `providerKind=OLLAMA`, `defaultModel=llama3.2`, `baseUrl=http://host.docker.internal:11434/v1`, leaves `apiKey` empty → resolver uses `OpenAiCompatibleAdapter` with no `Authorization` header → chat completions hit the local Ollama daemon.

#### 4.3.6 Adapter resilience (all providers)

- Config via resolved `AiProviderConfig` + optional platform env fallback
- Per-provider circuit breaker keyed by `configId` (a bad key must not trip other clinics)
- Timeout from config (default 30s), retry with exponential backoff for idempotent-safe transport errors only (not 401/403)
- Map upstream errors to HMS codes: `AI_PROVIDER_UNAVAILABLE`, `AI_PROVIDER_TIMEOUT`, `AI_PROVIDER_UNAUTHORIZED`, `AI_PROVIDER_MODEL_NOT_FOUND`, `AI_SAFETY_BLOCKED`
- Never log raw prompts, API keys, or decrypted credentials

## 5. Data Model

Schema baseline for chat messages lives in [docs/MVP/database.md](../MVP/database.md) (`ChatSession`, `ChatMessage`). **`AiProviderConfig`** is new in Phase 13. Migration ships in `P13-T01`, not during MVP.

### 5.1 Entities

**AiProviderConfig** — clinic-scoped upstream credentials and model defaults (see §4.3.3). API keys stored as `apiKeyCiphertext` only.

**ChatSession**

- `ownerUserId` — RBAC ownership anchor for `:own` scopes
- `channel` — `PATIENT | DOCTOR` (separate system prompts and context policies)
- `providerKey` — active `AiProviderConfig.id` at session creation time
- `providerKind` — denormalized `AiProviderKind` for filtering/analytics
- `providerSessionId` — external thread id when the upstream supports it
- `title` — optional, auto-generated from first user message

**ChatMessage**

- `actor` — `USER | ASSISTANT | SYSTEM`
- `content` — full text (encrypted-at-rest is an infra decision for Phase 13 spike)
- Provider audit fields: `providerKind`, `providerRequestId`, `providerMessageId`, `providerModel`, `providerStatusCode`, `providerLatencyMs`, `providerMetadata`
- `disclaimerShown`, `safetyTags` (JSON array)

### 5.2 Indexes and Retention

- Index `(sessionId, createdAt)` for paginated history
- Index `ownerUserId` on sessions for user session lists; index `channel` for the admin support view
- Soft-delete sessions via `deletedAt`; messages are append-only — `ChatMessage` carries no `updatedAt` or `deletedAt` at all, because an edited or vanishing assistant turn defeats the point of keeping it
- `ChatSession.ownerUserId` is `onDelete: Restrict`: a transcript records what a patient was told, so deleting the account must not erase it. `ChatMessage.authorUserId` is `onDelete: SetNull` — attribution can be erased, the turn cannot. Messages cascade only when the session row itself is hard-deleted by a retention job

### 5.3 Context Enrichment (read-only)

`ContextEnrichmentService` builds a redacted payload per channel:

**Patient channel** (authenticated patient only):

- Display name, next appointment summary (date, doctor name, status)
- Active registration queue number (if any)
- No other patients' data; no full EMR notes

**Doctor channel** (authenticated doctor only):

- Today's appointment count and next slot
- Assigned patient count (number only)
- Optional: de-identified aggregate stats — never bulk export via chat

Do not pass `nik`, `bpjsNumber`, full SOAP notes, or SATUSEHAT bearer tokens to the provider.

## 6. API Contract

Base path: `/api/v1/chat`. Response envelope matches HMS standard.

| Method | Path | Permission | Description |
| ------ | ---- | ---------- | ----------- |
| `POST` | `/sessions` | `chat.session.create:own` | Create session (`channel`, optional `title`) |
| `GET` | `/sessions` | `chat.session.read:own` | List own sessions (cursor pagination) |
| `GET` | `/sessions/:id` | `chat.session.read:own` | Session detail (ownership check) |
| `DELETE` | `/sessions/:id` | `chat.session.delete:own` | Soft-delete session |
| `POST` | `/sessions/:id/messages` | `chat.message.create:own` | Send user message; returns user + assistant messages |
| `GET` | `/sessions/:id/messages` | `chat.message.read:own` | Paginated history |
| `GET` | `/admin/sessions` | `chat.session.read:any` | Admin support view (SUPER_ADMIN, ADMIN) |

Admin provider configuration endpoints are listed in §4.3.4.

Request/response Zod schemas live in `packages/shared-types/src/ai-chatbot/` (`schemas.ts`, `contracts.ts`, `types.ts`). Shared types include `AiProviderKind` enum and admin DTOs; **never** include decrypted API keys in shared contracts.

Example success meta:

```json
{
  "data": { "assistantMessage": { "id": "...", "content": "..." } },
  "meta": {
    "disclaimer": "Informasi ini bukan diagnosis medis. Konsultasikan dengan tenaga kesehatan.",
    "providerRequestId": "req_abc123",
    "providerKind": "DEEPSEEK",
    "model": "deepseek-chat"
  }
}
```

## 7. RBAC

Permissions (seed in `P13-T02`):

| Permission | Scope | Default roles |
| ---------- | ----- | ------------- |
| `chat.session.create` | own | PATIENT, DOCTOR, ADMIN, SUPER_ADMIN |
| `chat.session.read` | own / any | own: all authenticated; any: ADMIN, SUPER_ADMIN |
| `chat.session.delete` | own | all authenticated |
| `chat.message.create` | own | PATIENT, DOCTOR, ADMIN, SUPER_ADMIN |
| `chat.message.read` | own / any | own: session owner; any: ADMIN, SUPER_ADMIN |
| `ai-provider.read` | any | ADMIN, SUPER_ADMIN |
| `ai-provider.write` | any | ADMIN, SUPER_ADMIN |

CASL subjects: `ChatSession`, `ChatMessage` (already listed in [docs/MVP/rbac.md](../MVP/rbac.md)). Ownership: `ownerUserId === currentUser.id`.

## 8. Frontend (Phase 13)

Follow MVP Phase 5 patterns:

1. Floating chat entry on patient dashboard and doctor workspace (feature-flagged per clinic; hidden when no active `AiProviderConfig`)
2. Session list + message thread UI in `components/client/chat/`
3. Persistent disclaimer banner above input
4. TanStack Query hooks from Orval-generated client
5. CASL `Can` gates at layout boundary; no chat widget on unauthenticated routes
6. Indonesian default copy (align with Phase 12 i18n)
7. **Admin settings page**: provider kind, API key (masked), model, base URL, test connection, activate
8. UI tests: disclaimer visible, 403 hidden entry, rate-limit error state, provider-not-configured empty state

## 9. Configuration

### 9.1 Clinic provider credentials (primary)

Stored in `AiProviderConfig` (§4.3.3). Admins set provider kind, API key, model, and optional base URL through the admin API/UI. Keys are encrypted before persistence.

| Field | Required | Description |
| ----- | -------- | ----------- |
| `providerKind` | yes | `OPENAI`, `DEEPSEEK`, `ANTHROPIC`, `OLLAMA`, `OPENAI_COMPATIBLE`, `AZURE_OPENAI` |
| `apiKey` | yes (on create/rotate) | Plaintext only in transit; never returned by GET. **Optional for `OLLAMA`** when the target host has no auth |
| `defaultModel` | yes | Provider-specific model id (`llama3.2` for Ollama; must exist on target host) |
| `baseUrl` | conditional | Required for `OPENAI_COMPATIBLE` and `AZURE_OPENAI`; optional for `OLLAMA` (see §4.3.1) |
| `isEnabled` | yes | Facility master switch |

### 9.2 Platform / deployment defaults (optional fallback)

Environment variables for single-tenant dev or platform-managed default. **Not a substitute** for clinic config in multi-tenant production.

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `AI_PLATFORM_PROVIDER_KIND` | no | Fallback `AiProviderKind` when clinic has no config |
| `AI_PLATFORM_API_KEY` | no | Fallback key (dev only — prefer clinic config in prod) |
| `AI_PLATFORM_BASE_URL` | no | Fallback base URL |
| `AI_PLATFORM_MODEL` | no | Fallback model id |
| `AI_PROVIDER_ENCRYPTION_KEY` | yes | 32-byte secret for AES-256-GCM encrypting stored API keys |
| `AI_PROVIDER_TIMEOUT_MS` | no | Default 30000 |
| `AI_CHAT_RATE_LIMIT_PER_HOUR` | no | Default 60 messages/user |
| `AI_CHAT_MAX_MESSAGE_LENGTH` | no | Default 4000 |
| `AI_CHAT_ENABLED` | no | Feature flag; default false until Phase 13 complete |

### 9.3 API key encryption

- Encrypt `apiKey` with `AiProviderCryptoService` before INSERT/UPDATE (`AES-256-GCM`, random IV per row, auth tag validated on decrypt).
- Decrypt only inside `AiProviderResolverService` for the duration of a single outbound request.
- Store `apiKeyHint` (last four characters) for admin identification.
- Rotate `AI_PROVIDER_ENCRYPTION_KEY` via re-encryption migration (document in runbook); never log decrypted values.

## 10. Testing Strategy

| Level | Focus |
| ----- | ----- |
| Unit | Safety policy, context redaction, error mapping, crypto round-trip, registry kind resolution |
| Adapter | Per-kind HTTP mocks (OpenAI-compatible + Anthropic shapes); timeout/retry/circuit-breaker per `configId` |
| Integration | Full send-message flow with mock adapters; admin provider CRUD + test endpoint; RBAC 200/403 matrix |
| Contract | OpenAPI examples for chat + admin provider endpoints |

Do not call live provider APIs in CI. Record fixtures under `apps/api/test/fixtures/ai-provider/` (`openai-completion.json`, `anthropic-message.json`, `deepseek-completion.json`, `ollama-completion.json`).

## 11. Observability

- Structured logs: `chatSessionId`, `providerKind`, `configId`, `providerRequestId`, `channel`, `latencyMs` — no message body, no API key
- Metrics (future): error rate by `providerKind`, safety block rate, p95 latency per config
- Admin retry is **not** supported for provider calls (user re-sends message); admin can only read audit trails

## 12. Delivery Tasks (Phase 13)

Aligned with branch naming `feature/p13-t<task>-<short-desc>`.

### Backend

1. `P13-T01` Schema migration: `AiProviderConfig`, `ChatSession`, `ChatMessage`, enums, indexes. **Done** — migration `20260810000000_ai_chatbot_provider_and_chat_schema`, constraints proven in `ai-chatbot-schema.integration.spec.ts`. See §4.3.3 and §5.1 for what shipped.
2. `P13-T02` RBAC seed: chat + `ai-provider.*` permissions + role bindings.
3. `P13-T03` Module skeleton + repositories (provider config CRUD with encrypted keys, session/message ownership filters).
4. `P13-T04` Multi-provider layer: `AiChatProvider` interface, `AiProviderRegistry`, `OpenAiCompatibleAdapter`, `AnthropicAdapter`, `AiProviderCryptoService`, `AiProviderResolverService`, per-config circuit breaker + mocks.
5. `P13-T05` Admin provider API (CRUD, activate, test connection) + `AiChatbotService` orchestration.
6. `P13-T06` `ContextEnrichmentService` (post-SATUSEHAT read models via domain services).
7. `P13-T07` `SafetyPolicyService` (input/output guards, disclaimer injection, safety tags).
8. `P13-T08` Chat controller + OpenAPI + integration tests (multi-adapter mocks).

### Frontend

9. `P13-T09` Chat UI + admin provider settings page + Orval sync.
10. `P13-T10` UI tests, i18n strings, feature flag wiring, provider-not-configured states.

### Gate

11. `P13-T11` Readiness review: safety checklist sign-off, UU PDP log audit, load test rate limits, enable `AI_CHAT_ENABLED` in staging only.

## 13. Definition of Done

- All Phase 13 tasks merged; CI green.
- No local model inference in repository.
- Clinic admin can configure, test, activate, and rotate **OpenAI-compatible** (GPT, DeepSeek, **Ollama**), **Anthropic** (Claude), and custom gateway providers without code changes.
- Every assistant response includes disclaimer in API `meta` and persisted `disclaimerShown`.
- Provider failures degrade gracefully (structured error, no partial assistant message persisted).
- API keys encrypted at rest; never returned from GET endpoints or written to logs.
- Context enrichment uses service interfaces only; SATUSEHAT IDs present on profiles before doctor/patient-specific context is enabled in production.
- OpenAPI exported; `pnpm api:contract:sync` run for web client.

## 14. Related Documents

- [Post-MVP implementation plan](./implementation-plan.md) — Phase 13 sequencing
- [AGENTS.md §10 AI Chatbot Boundaries](../../AGENTS.md) — repository contract
- [MVP decisions D-007](../MVP/decisions.md) — scope limitation decision
- [MVP database schema](../MVP/database.md) — `ChatSession` / `ChatMessage` models
- [MVP RBAC](../MVP/rbac.md) — CASL subjects and permission naming
