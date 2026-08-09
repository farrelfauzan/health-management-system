# WhatsApp / Telegram Customer Service Strategy (SalingJaga)

Strategy for a conversational customer-service channel over **WhatsApp** (via a self-hosted gateway — GOWA or WAHA) and **Telegram** (official Bot API). An LLM classifies the intent of each inbound message, executes tools inside HMS, and replies to the customer directly on the same channel.

**Scope is deliberately narrow — two features only:**

1. **FAQ** — answer clinic questions from an admin-managed knowledge base (documents in S3, retrieved via pgvector).
2. **Appointment booking** — a patient books an appointment in chat; the system creates it automatically instead of an admin typing it into the dashboard. **No sensitive data (NIK, BPJS number, address, medical details) is ever collected over chat** — that is completed manually by the admin in the dashboard when the patient arrives at the clinic.

Companion documents: [ai-chatbot.md](../post-mvp/ai-chatbot.md) (multi-provider AI gateway this channel reuses), [ai-chatbot-tools.md](../post-mvp/ai-chatbot-tools.md) (tool-dispatch pattern and its privacy invariants), [appointment-scheduling.md](../revamp/appointment-scheduling.md) (session-based booking model the appointment tool targets).

---

## 1. Positioning and Principles

### 1.1 Why this channel

Indonesian patients live on WhatsApp. Today the flow is: patient calls or WhatsApps the front desk → admin reads it → admin creates the appointment in the dashboard. This channel removes the manual middle step for the two highest-volume request types (questions and bookings) while keeping the admin in control of everything sensitive.

### 1.2 Principles

1. **The messaging channel is untrusted and unauthenticated.** A WhatsApp number or Telegram chat id identifies a *conversation*, not a verified patient. Nothing that requires authenticated identity (medical records, existing-appointment details beyond what this conversation created, billing) is reachable from this channel.
2. **Data minimization by design, not by prompt.** The tools exposed to this channel are structurally incapable of returning or accepting sensitive fields. We do not rely on the LLM "being careful" — the tool schemas and output allowlists are the guard (same fails-closed pattern as [ai-chatbot-tools.md](../post-mvp/ai-chatbot-tools.md) §4.3).
3. **The gateway is a dumb pipe.** GOWA/WAHA/Telegram only move messages. All logic — intent, tools, safety, persistence — lives in HMS. Swapping WhatsApp gateways (or adding the official WhatsApp Cloud API later) must not touch business logic.
4. **Channel-agnostic core.** WhatsApp and Telegram converge into one normalized inbound message shape immediately at the edge; everything downstream is channel-blind.
5. **Reuse the Phase 13 AI gateway.** The multi-provider adapter layer (`AiProviderResolverService`, `OpenAiCompatibleAdapter`, `AnthropicAdapter`, encrypted per-clinic keys) already exists. This channel is a new *consumer* of it, not a new AI stack.
6. **Human handoff is a first-class outcome.** When the LLM cannot classify, the customer asks for a human, or safety rules trip, the conversation is flagged for the admin — never a dead end and never an LLM improvising.

### 1.3 Explicitly out of scope (v1)

- Medical advice, symptom triage, diagnosis — the FAQ answers *clinic operations* questions only; medical questions get the standard "please consult our clinicians / book an appointment" template.
- Rescheduling/cancelling via chat (v1.1 candidate; needs a phone-number → appointment lookup with confirmation-code verification).
- Payment, billing, or BPJS eligibility over chat.
- Proactive outbound campaigns / broadcasts (only conversational replies and appointment confirmations to a customer who messaged first).
- Voice notes, images as *input* to the LLM (politely ask for text in v1).

---

## 2. Channel Gateways

### 2.1 WhatsApp — GOWA (primary) vs WAHA (fallback)

Both drive a real WhatsApp Web session over the unofficial multi-device protocol (both ultimately build on `whatsmeow`), exposed as a REST API + webhooks you self-host. They are functionally interchangeable for our two features, which is exactly why the adapter boundary in §4.2 exists.

| | **GOWA** ([aldinokemal/go-whatsapp-web-multidevice](https://github.com/aldinokemal/go-whatsapp-web-multidevice)) | **WAHA** ([waha.devlike.pro](https://waha.devlike.pro)) |
| --- | --- | --- |
| Runtime | Single Go binary / small Docker image, low memory | Node.js Docker image; multiple engines (WEBJS browser-based, NOWEB, GOWS Go-websocket) |
| License / cost | Open source, free | Free — since **2026.6.1** all former Plus-tier features (media, multi-session) ship in the public image |
| Inbound | Webhook POST per event; payloads carry `device_id` / `session_id` for multi-account correlation | Webhook via `WHATSAPP_HOOK_URL` + `WHATSAPP_HOOK_EVENTS=message` |
| Outbound | REST (`/send/message` etc.), OpenAPI docs at `/docs` | REST (`POST /api/sendText` etc.) |
| Multi-account | Yes (multi-device, multi-account) | Yes (sessions) |
| Extras | MCP server, Chatwoot integration, admin UI | Dashboard, many engines to tune stability vs footprint |

**Recommendation: start with GOWA.** Reasons: smallest operational footprint (one Go binary next to the API container), webhook payloads already structured for multi-account, an active release cadence, and wide use in the Indonesian dev community. Keep WAHA as the documented fallback behind the same `WhatsappGatewayPort` interface — if GOWA has stability problems with a particular WhatsApp update, switching is a config + thin-adapter change, not a redesign.

> **Risk — unofficial protocol.** Both GOWA and WAHA automate WhatsApp Web, which violates WhatsApp ToS; the clinic number can be **banned**. Mitigations: use a dedicated business number (never a personal one), warm the number up gradually, reply-only behavior (we never message first except confirmations within an active conversation), per-number rate limiting, and human-like send pacing. **All five are operational procedures rather than code, and `PCS-T09` writes them down in the [warm-up runbook](../ops/whatsapp-number-warmup.md)** — the two that *are* code are the send pacing (`WA_GATEWAY_SEND_PACING_MS`, applied as a chain so concurrent replies leave one at a time) and the per-chat rate limit the conversation layer already enforced. The one deliberate exception to reply-only is §5.1.1's OTP, which by definition addresses someone who has not written to us; §8.3's challenge quota is what stops it becoming a way to make the clinic text strangers. The **long-term migration path** is the official **WhatsApp Business Cloud API** (Meta) — template-message costs and business verification apply, but no ban risk. The `WhatsappGatewayPort` interface must be designed so a Cloud API adapter is a drop-in third implementation (§4.2). Treat GOWA/WAHA as the pragmatic v1, not the endgame.

### 2.2 Telegram — official Bot API

Telegram needs no proxy at all: the **official Bot API** is free, ToS-clean, and webhook-native.

- Create a bot via **@BotFather** → get a bot token.
- **Webhook mode** (not long polling) in production: `setWebhook` to an HMS endpoint with a `secret_token` that Telegram echoes in the `X-Telegram-Bot-Api-Secret-Token` header — that is our webhook authentication.
- Library: **[grammY](https://grammy.dev)** — TypeScript-first, actively maintained, and its `webhookCallback` mounts cleanly inside a NestJS controller. (Telegraf also works; grammY has the better TS ergonomics and docs. Decide at implementation time via a 1-day spike; the adapter interface makes it a non-decision architecturally.)
- No ban risk, no per-message cost — Telegram is also the ideal **staging/testing channel**: every conversational flow can be exercised end-to-end on Telegram before pointing a real WhatsApp number at it.

---

## 3. Architecture Overview

```
                         ┌─────────────────────────── HMS (apps/api) ───────────────────────────┐
 WhatsApp user           │                                                                      │
   │  wa message         │  channel-gateway module                 customer-service module      │
   ▼                     │  ┌──────────────────────┐               ┌───────────────────────┐    │
 ┌───────────┐  webhook  │  │ WhatsappWebhook      │  normalized   │ ConversationService   │    │
 │ GOWA/WAHA │──────────►│  │ Controller           │──InboundMsg──►│  (session, history,   │    │
 │ (Docker)  │◄──────────│  │ TelegramWebhook      │               │   state machine)      │    │
 └───────────┘  REST send│  │ Controller           │               └──────────┬────────────┘    │
                         │  └──────────────────────┘                          ▼                 │
 Telegram user           │  ┌──────────────────────┐               ┌───────────────────────┐    │
   │  tg message         │  │ WhatsappGatewayPort  │               │ IntentOrchestrator    │    │
   ▼                     │  │  ├ GowaAdapter       │               │  (LLM tool loop via   │    │
 ┌───────────┐  webhook  │  │  ├ WahaAdapter       │◄──send reply──│   Phase 13 provider   │    │
 │ Telegram  │──────────►│  │  └ (CloudApiAdapter) │               │   adapters)           │    │
 │ Bot API   │◄──────────│  │ TelegramGatewayPort  │               └──────────┬────────────┘    │
 └───────────┘           │  │  └ GrammyAdapter     │                          ▼                 │
                         │  └──────────────────────┘               ┌───────────────────────┐    │
                         │                                         │ CS tools (allowlisted)│    │
                         │   document-service module               │  ├ search_faq ────────┼──► pgvector
                         │  ┌──────────────────────┐               │  ├ list_available_    │    │
                         │  │ S3/MinIO storage     │               │  │   sessions ────────┼──► appointment services
                         │  │ upload / ingest /    │               │  └ book_appointment ──┼──► (session booking)
                         │  │ chunk / embed        │               └───────────────────────┘    │
                         │  └──────────────────────┘                                            │
                         └──────────────────────────────────────────────────────────────────────┘
```

**Message lifecycle:**

1. Gateway receives a WhatsApp/Telegram message → POSTs to the HMS webhook.
2. Webhook controller authenticates the caller (§8.1), normalizes the payload into `InboundChannelMessage`, ACKs `200` immediately, and enqueues processing (webhook handlers must never block on an LLM call — GOWA/Telegram will retry or time out).
3. `ConversationService` resolves/creates the conversation (keyed by channel + external chat id), loads recent history and conversation state.
4. `IntentOrchestrator` runs the LLM tool loop: system prompt + history + the three tools. The model either replies directly (FAQ small talk / clarification), calls a tool, or signals handoff.
5. Tool results return to the model, which composes the final customer-facing reply (Indonesian by default).
6. Reply is sent back through the same gateway adapter; the full turn (inbound, tool calls, args, results, outbound) is persisted for audit.

### 3.1 Relationship to the Phase 13/15 chatbot

This is a **separate module, same engine**. The in-app chatbot (`ai-chatbot`) serves authenticated users inside the product; this channel serves unauthenticated members of the public. They share:

- The multi-provider adapter layer and encrypted clinic provider config ([ai-chatbot.md](../post-mvp/ai-chatbot.md) §4.3) — one clinic AI config powers both.
- The tool-dispatch discipline: Zod-validated arguments, per-tool output allowlists, every tool turn persisted before anything is transmitted.

They deliberately do **not** share: channels/system prompts, tool registries (the CS registry is its own, three tools, public-scope), or session tables (a WA conversation is not a `ChatSession` — different identity model, different retention posture).

**On tool results returning to the model:** [ai-chatbot.md](../post-mvp/ai-chatbot.md) §4.2.1 Mode A exists because in-app tools return *patient rows*. The CS tools are designed so their outputs contain **no sensitive personal data at all** (FAQ chunks are clinic documents; session availability is capacity data; booking confirmation echoes only what the customer themselves typed — name and phone). Because the payload class is non-sensitive by construction, results feeding back into the model for reply composition — what the user wants, and what makes the UX good — does not create a Mode-B-grade transfer problem. This is recorded as a decision in §10 (D-CS-02), and the output allowlists are what keep it true.

---

## 4. Module Design

Two new API modules plus one extension, following the standard `controller/ service/ repository/ dto/` layout; all request schemas in `packages/shared-types` per repo contract.

### 4.1 `channel-gateway` module

Owns the edge: webhook controllers and outbound send adapters. Contains **zero business logic**.

```
apps/api/src/modules/channel-gateway/
  controller/
    whatsapp-webhook.controller.ts    # @PublicRoute + gateway auth guard (§8.1)
    telegram-webhook.controller.ts
  service/
    inbound-message-normalizer.service.ts
    outbound-message-dispatcher.service.ts   # picks adapter by conversation.channel
  infrastructure/
    whatsapp-gateway.port.ts          # interface: sendText, sendTyping, markRead
    gowa.adapter.ts
    waha.adapter.ts                   # thin; parity-tested against the port
    telegram-gateway.port.ts
    grammy.adapter.ts
    channel-gateway.types.ts          # wire types (stay in API, not shared-types)
```

Normalized shape (in `packages/shared-types/src/customer-service/`):

```typescript
type ChannelKind = 'WHATSAPP' | 'TELEGRAM';

type InboundChannelMessage = {
  channel: ChannelKind;
  externalChatId: string;      // WA JID / Telegram chat id
  externalMessageId: string;   // for dedup — gateways retry webhooks
  senderDisplayName: string | null;
  text: string;
  receivedAt: string;          // ISO
};
```

Dedup is mandatory — webhook retries must not double-book an appointment.

**Amended at `PCS-T05`: the key is `(channel, externalChatId, externalMessageId)`, not the two columns sketched above.** Telegram's `message_id` counts up *per chat* rather than per bot, so two customers hold the same id within minutes of each other; a two-column key would drop the second customer's message as a duplicate of the first's — silently, and worst for exactly the customers who message first. Including the chat is what makes the constraint mean "this message, from this conversation". The claim is the insert itself rather than a read followed by an insert: the case being defended against is the same message arriving twice in quick succession, which lands both copies in the window between those two statements.

**Also settled at `PCS-T05`: grammY is used as an API client only** — the `Api` class, not `Bot`, and not `webhookCallback`. §2.2 deferred this to a spike; the spike's answer is that `webhookCallback` would take over routing and hand this codebase a grammY `Context`, when §8.1 puts the secret-token check in a Nest guard and the repo contract puts inbound parsing in a Zod schema in `@hms/shared-types`. A framework that owns the request fights both. What grammY still earns its place for is outbound, where hand-rolled `fetch` calls go wrong quietly: it tracks Bot API versions, and it surfaces Telegram's `error_code` and `parameters.retry_after` as a typed error, so `autoRetry` can honour a 429 on Telegram's own schedule — the flood control §8.3's send pacing depends on, and the single most common thing a naive client gets wrong.

### 4.2 `customer-service` module

Owns conversations, intent orchestration, the tool registry, safety, and handoff.

```
apps/api/src/modules/customer-service/
  controller/
    cs-admin.controller.ts            # admin: conversation list, transcript, handoff queue, takeover
    channel-arrival.controller.ts     # admin: §5.2 arrival worklist, merge candidates, draft merge
  service/
    conversation.service.ts           # session resolution, state machine, history window
    intent-orchestrator.service.ts    # LLM tool loop (max 3 tool calls/turn, reuse Phase 13 adapters)
    cs-tool-registry.service.ts       # the 3 tools; Zod arg schemas; output allowlists
    cs-safety-policy.service.ts       # PII redaction, injection guard, escalation templates
    handoff.service.ts                # flag conversation, pause bot, notify admin
  repository/
    conversation.repository.ts
  dto/
```

#### Conversation state machine

```
BOT_ACTIVE ──(handoff trigger)──► NEEDS_HUMAN ──(admin resolves)──► BOT_ACTIVE
BOT_ACTIVE ──(admin takeover)───► HUMAN_ACTIVE ─(admin releases)──► BOT_ACTIVE
BOT_ACTIVE ──(existing-patient match, OTP sent)──► AWAITING_OTP ──(verified | 3 fails | 5 min timeout)──► BOT_ACTIVE
any ──(30 days idle)──► ARCHIVED
```

**Amended at `PCS-T08`: an admin reply *is* a takeover, and a block is not a state.** Replying from `BOT_ACTIVE` moves the conversation to `HUMAN_ACTIVE` in the same call, because the alternative is the bot answering the customer's next message over the top of a person. §8.3's chat block is a nullable `blockedAt` column rather than a sixth state: it is an overlay on whatever state the chat was in, so unblocking restores that state instead of guessing at one, and blocking a conversation a colleague is handling does not erase the fact. A blocked chat's inbound messages are dropped **before** persistence — earlier than the paused states, which still record everything — because a block exists to stop the chat costing anything, and one that still wrote a transcript row per message would move the flood from tokens to storage.

While a conversation is `NEEDS_HUMAN` or `HUMAN_ACTIVE`, inbound messages are persisted but **not** sent to the LLM; the admin replies from the dashboard through the same outbound dispatcher. In `AWAITING_OTP`, inbound messages are matched against the pending code deterministically and likewise never reach the LLM (§5.1.1).

#### The three tools (v1 — complete list)

| Tool | Arguments (Zod) | Backing service | Output allowlist |
| --- | --- | --- | --- |
| `search_faq` | `query: string` | `DocumentIngestionService` → pgvector top-k | chunk text, source document title. Nothing else exists in the corpus (clinic docs only) |
| `list_available_sessions` | `poliOrDoctorName?: string`, `dateFrom: string`, `dateTo: string` (≤ 14 days) | `AppointmentManagementService` (session calendar, the [revamp](../revamp/appointment-scheduling.md) model) | doctor display name, specialty/poli, session date, window (`08:00–12:00`), remaining capacity or `full`. **No attendee data** |
| `book_appointment` | `patientFullName: string`, `phoneNumber: string`, `sessionId: string`, `note?: string` (note schema-capped at 200 chars) | `AppointmentManagementService` + channel-patient resolution (§5). May suspend into the `AWAITING_OTP` verification sub-flow when the phone matches an existing patient (§5.1.1) | booking reference code, doctor name, session date + window, arrival instructions. **Never** queue position promises, never other patients, never whether the phone matched a record |

That the registry contains *only* these three is itself the security boundary: there is no tool that reads a patient record, so no prompt injection can ask for one.

**Amended at `PCS-T07`: `sessionId` is an opaque token, not a database id.** Sessions are materialised lazily ([revamp](../revamp/appointment-scheduling.md) §3.2) — the row is created by the first booking, so a window nobody has booked yet has no id at all — and the pair that identifies one uniquely is the doctor's schedule window plus the calendar date. `list_available_sessions` mints a token encoding that pair and `book_appointment` accepts it back. Keeping it meaningless to the model is deliberate: a readable `doctor/date` value invites the model to *construct* one, and a constructed booking target is a booking the customer never chose. An unparseable token is refused rather than guessed at.

**Also settled at `PCS-T07`: two replies are never the model's to phrase.** `book_appointment` may return a reply this codebase wrote, and when it does the tool loop stops without asking the provider again. The booking confirmation is one, because it must be byte-identical across the linked and drafted paths (§5.1.1's no-registry-oracle rule) and must never promise a queue position the session model assigns at check-in; the possession challenge is the other, because a model asked to explain why it wants a phone number will explain that it found a record.

### 4.3 `document-service` module (S3 knowledge base — and future general documents)

Named `document-management` in code to match module conventions. v1 exists to feed the FAQ, but it is deliberately built as the **general document service** the platform will need later (admin uploads, patient documents, doctor documents).

```
apps/api/src/modules/document-management/
  controller/
    document-admin.controller.ts      # upload, list, delete, re-ingest
  service/
    document.service.ts               # CRUD, presigned URLs, RBAC ownership
    document-ingestion.service.ts     # extract → chunk → embed → pgvector
  repository/
  infrastructure/
    storage.port.ts                   # put, getPresignedUrl, delete
    s3-storage.adapter.ts             # AWS SDK v3; works for AWS S3 AND MinIO (self-host)
```

**Storage decisions:**

- **S3-compatible via one adapter**: AWS S3 in cloud production, **MinIO** in Docker dev/self-hosted deployments — the AWS SDK v3 client covers both with a `forcePathStyle` + endpoint config switch. Add MinIO to `infra/docker/docker-compose.dev.yml`.
- Bucket layout: `documents/{ownerType}/{uuid}.{ext}` — `ownerType ∈ clinic | patient | doctor | admin`. The clinic corpus (`documents/clinic`) shipped with Phase 15 `P15-T10`; the layout means patient lab results or doctor documents later are a policy addition, not a migration. **This supersedes the earlier `{env}/{facilityId|_}/{ownerType}/{documentId}/{filename}` sketch, and the reasons are worth keeping:** a caller-supplied `{filename}` would put a human-chosen string — potentially a patient's name — into an object key, `{documentId}` is not known until after the upload it would have to name, `{env}` is already the bucket, and `{facilityId}` is a constant in a single-tenant deployment. The key that ships is opaque and server-minted, which is also the only shape the presigned-upload guard will sign: a key that arrived in a request body can never be handed write authority.
- All downloads via **short-lived presigned URLs**; the bucket is private; the API never streams file bytes through itself except during ingestion. Uploads are presigned the same way and go browser-direct — the API sees only the object's metadata, read back at confirm time, because a client's claim about what it uploaded is not evidence of what is in the bucket.

**Data model:**

```prisma
enum DocumentOwnerType { CLINIC PATIENT DOCTOR ADMIN }
enum DocumentPurpose   { FAQ_KNOWLEDGE_BASE PERSONAL_KNOWLEDGE_BASE GENERAL }  // extended later
enum DocumentIngestStatus { PENDING PROCESSING READY FAILED NOT_APPLICABLE }

model Document {
  id           String   @id @default(uuid()) @db.Uuid
  ownerType    DocumentOwnerType
  ownerId      String?  @db.Uuid            // null for CLINIC
  purpose      DocumentPurpose
  title        String
  storageKey   String                       // S3 object key
  mimeType     String
  sizeBytes    Int
  ingestStatus DocumentIngestStatus @default(NOT_APPLICABLE)
  uploadedById String   @db.Uuid
  createdAt / updatedAt / deletedAt         // repo conventions
}

model DocumentChunk {
  id         String                      @id @default(uuid()) @db.Uuid
  documentId String                      @db.Uuid  // cascade delete with document
  chunkIndex Int
  content    String
  embedding  Unsupported("vector(1024)")           // pgvector; bge-m3 dimension — see embedding note below
  @@index([documentId])
}
```

**Ingestion pipeline** (async, triggered on upload with a knowledge-base purpose): extract text (PDF/DOCX/MD/plain — start with MD + PDF), chunk ~500 tokens with overlap, embed, upsert chunks. Re-upload = new document version → re-ingest → atomic swap. **Embeddings are local via Ollama (`bge-m3`, 1024 dims)** — this follows the Phase 15 decision in [ai-chatbot-tools.md](../post-mvp/ai-chatbot-tools.md) §5.4 (cross-lingual ID↔EN quality; no second cloud processor seeing every customer question), and since both features share this one store, the embedding configuration is shared too. `embeddingModel` + `embeddingVersion` are recorded per chunk so a model switch triggers a re-embed rather than silently mixing vector spaces.

**One store, many knowledge bases.** This module is also where **Phase 15 retrieval keeps every corpus** ([ai-chatbot-tools.md](../post-mvp/ai-chatbot-tools.md) §5.5 — it supersedes that document's earlier `ClinicDocument` naming):

- **Clinic corpus** (`ownerType = CLINIC`) — the FAQ/SOP knowledge base, admin-managed via `document.write:any`. The **only** corpus the WA/Telegram channel can ever touch: `search_faq` is hard-filtered to `ownerType = CLINIC` + `purpose = FAQ_KNOWLEDGE_BASE` in the repository query.
- **Personal knowledge bases** (`ownerType = DOCTOR | ADMIN`, `purpose = PERSONAL_KNOWLEDGE_BASE`) — a doctor or admin maintains their own document corpus via `document.write:own` / `document.read:own`, retrieved **only in that user's own in-app chat sessions** (Phase 15 `P15-T20`). Private to the owner; never in the public channel's candidate set; must contain no patient data (upload notice + readiness spot-check per Phase 15 §5.1).

**RBAC** (seeded with the module): `document.read` / `document.write` with `ANY` (ADMIN, SUPER_ADMIN) and `OWN` (DOCTOR, ADMIN — personal KBs; patient documents later) scopes. This CS phase wires only the admin-`ANY` routes; the `OWN` routes land with Phase 15 `P15-T20`.

---

## 5. Appointment Booking Flow — the sensitive-data boundary

### 5.1 Identity model: the "channel patient"

The customer on WhatsApp is unverified. We must not create real `Patient` records with junk data, and we must not demand NIK/BPJS to book. Resolution:

- New table `ChannelPatientLink`: `(channel, externalChatId, phoneNumber, fullName, patientId?, verificationStatus, verifiedAt?)` with `verificationStatus ∈ UNVERIFIED | CHANNEL_VERIFIED | OTP_VERIFIED`.
- On `book_appointment`, HMS looks for an existing patient by exact phone-number match:
  - **No match** → create a **draft patient** (name + phone only, flagged `source = CHANNEL_BOOKING`, incomplete-profile status). This is the record the admin completes.
  - **Match** → the booking may only attach to the existing patient record **after the sender is authenticated as that patient** (§5.1.1). An unauthenticated match never links — and the *tool result reveals nothing about the match* either way: no "welcome back, we found your record" leaking registry contents to an unverified caller.
- The appointment is created as a normal **session booking** (`AppointmentType.SESSION`, confirmed immediately per the [revamp model](../revamp/appointment-scheduling.md)) with `bookingSource = WHATSAPP | TELEGRAM` for analytics and the admin worklist.

#### 5.1.1 Existing-patient authentication

A phone-number match is a *claim*, not proof — anyone who knows a patient's number could otherwise book (and later probe) against their record. Verification is **possession of the registered phone number**, proven one of three ways, cheapest first:

| Tier | Channel | Proof | Cost to customer |
| --- | --- | --- | --- |
| **Channel possession** | WhatsApp | The WA sender identity (JID) *is* a phone number. If it equals the patient's registered number, the channel itself proves possession — WhatsApp already verified that device owns the number. Auto-verify, zero friction. | None |
| **Contact share** | Telegram | Telegram chat ids are not phone numbers, but the Bot API `request_contact` button shares the account owner's **Telegram-verified** number. If it matches the registered number → verified. | One tap |
| **OTP** | Both (fallback) | Customer gave a number different from their channel identity (booking for themselves from a new number, etc.). HMS sends a 6-digit code **to the patient's registered number** via the WhatsApp gateway (SMS fallback later); customer types it back. Code hashed at rest, TTL 5 minutes, max 3 attempts, then the flow falls through to draft. | Type a code |

Mechanics and consequences:

- **Verification is a deterministic sub-flow, not an LLM tool.** When `book_appointment` hits an unverified match, the conversation enters `AWAITING_OTP` (§4.2 state machine): inbound messages are checked against the code by `ConversationService` directly and are **never sent to the LLM** — the code never enters a model context, and prompt injection cannot talk its way past a string comparison. The LLM only resumes after the state resolves.
- **Success** → `ChannelPatientLink.verificationStatus` is persisted (`CHANNEL_VERIFIED` or `OTP_VERIFIED`, with `verifiedAt`), so the same chat books next time without re-challenging. Re-verify if the link is older than a configurable window (default 180 days) or the patient's registered number changes.
- **Failure / timeout / customer declines** → the booking still goes through, but as a **draft patient not linked to the existing record**; the reply is the standard confirmation, identical to the no-match path (no registry oracle). The admin reconciles at check-in exactly as in §5.2 — the existing record was never exposed or touched, and the customer never hit a dead end.
- **Verification unlocks linkage only, not data access.** A verified customer's bookings attach to their real record, but the chat still cannot *read* anything from it — the tool surface is unchanged (§4.2). Verified identity is a prerequisite for future v1.1 features (reschedule/cancel "my appointment"), which must require `verificationStatus != UNVERIFIED`.

### 5.2 Arrival completes the record

At the clinic, the admin's existing check-in flow gains a worklist: channel-sourced bookings with incomplete profiles. Admin verifies the person, enters NIK/BPJS/demographics **in the dashboard**, merges the draft into an existing patient if the phone-match was wrong, and check-in proceeds normally (queue number at `CHECKED_IN`, unchanged).

**Shipped at `PCS-T08`** on the registration screen rather than as a route of its own, because it is what the desk needs *while* checking someone in. Three rules make it a worklist rather than a list. It is keyed on the **appointment's** `bookingSource`, not the patient's `source`: a verified customer's chat booking hangs off a long-standing front-desk record, and keying off the person would drop exactly the rows the desk most needs. "Incomplete" means the two columns `PCS-T07` made nullable — date of birth and address — and nothing else; a missing NIK or BPJS number is still *reported*, so the desk knows to ask, but it does not hold the row open, because a patient may genuinely have neither and a worklist that never clears is one people stop reading. And completing a record is deliberately **not** on this screen: it links to the patient-edit route, which owns the validation and the identifier encryption, so there is only ever one write path for those columns. The merge itself moves the draft's appointments, registrations, and channel links in one transaction and soft-deletes the draft — never a hard delete, since the MRN was quoted to a customer in a confirmation reply and the row carries the privacy-notice record the channel deferred. It refuses a draft that has acquired an encounter, prescription, or invoice: moving clinical history between patients is not something a front-desk button does silently.

### 5.3 What the bot says and refuses

- Collects **only**: full name, phone number (pre-filled from the WA sender number, confirmed in chat), chosen doctor/poli, chosen session (date + window). Explains clearly: *"Kedatangan sesuai urutan; nomor antrean diberikan saat check-in di klinik"* — no exact-time promises (session model).
- **Never asks** for NIK, BPJS number, date of birth, address, or medical complaints. The system prompt says so, but the enforcement is structural: `book_appointment` has no such parameters to fill.
- If the customer **volunteers** sensitive data ("NIK saya 317…"), `CsSafetyPolicyService` redacts it with pattern guards (16-digit NIK, 13-digit BPJS, long digit runs) **before** persistence and before the LLM sees the turn, and the bot replies with a fixed template: bring the documents to the clinic instead, data is completed at the front desk.
- Exact-time requests get the honest answer: sessions only via chat; special requests (approval-gated) are referred to the front desk in v1.

---

## 6. LLM Layer

- **Provider**: resolved through the existing `AiProviderResolverService` — the clinic's one configured provider serves web chat and this channel. Recommended default: a fast, cheap, tool-capable model (e.g. Haiku-class / `gpt-4o-mini`-class); FAQ + a 3-tool booking flow does not need a frontier model, and WA users expect replies in seconds.
- **Intent handling**: no separate classifier stage — the tool loop *is* the classifier. A well-written system prompt + three tools means the model's tool choice is the intent decision, with "no tool + template reply" covering greetings, thanks, and out-of-scope topics. This halves latency and removes a component. Revisit only if misrouting shows up in transcripts.
- **Loop bounds**: max 3 tool calls per inbound message; max 20-turn history window; hard token budget per reply.
- **Language**: system prompt mandates Bahasa Indonesia by default, mirroring the customer's language if they write in English.
- **System prompt sketch** (per channel config, versioned in DB or config file, not hard-coded):
  - You are the customer-service assistant of {clinic name}. Two jobs only: answer clinic questions using `search_faq`, and book appointments with `list_available_sessions` → `book_appointment`.
  - Never answer clinic-fact questions from memory — no FAQ hit means say you don't know and offer the front desk ([ai-chatbot.md](../post-mvp/ai-chatbot.md) §3.1 rule 7, `unsourced_claim`, applies verbatim here).
  - Never request or accept NIK/BPJS/addresses/medical details; use the arrival-completes-data template.
  - Medical questions → consultation-referral template. Emergencies → emergency template (ER/119) immediately, no tools.
  - Confused, angry, or asks for a human → call handoff.

---

## 7. Telegram Specifics

- One bot (`@SalingJagaBot` or clinic-branded), webhook to `/api/v1/channel-gateway/telegram/webhook`, authenticated by the BotFather `secret_token` header.
- Telegram allows richer UX at zero cost — use it, but keep parity thinking: **inline keyboards** for session selection (tap a session instead of typing "number 2") and `/start`, `/booking`, `/faq` command hints. The conversation core stays text-first so WhatsApp (plain text + numbered lists) runs the identical logic; the gateway adapter decides *presentation* (buttons vs numbered list) from the same normalized reply structure (`text + options[]`).
- Telegram is the **pilot channel**: ship it first (no ban risk, free, instant setup), harden the flows on real traffic, then attach the WhatsApp number.

---

## 8. Security, Privacy, Operations

### 8.1 Webhook & gateway security

- GOWA/WAHA webhook → HMS: HMAC signature or bearer secret (both support configurable webhook auth headers) + IP allowlist (gateway and API share a private Docker network; the gateway's own REST port is **never** exposed publicly, and its API auth is enabled).
- Telegram → HMS: `X-Telegram-Bot-Api-Secret-Token` check.
- Webhook endpoints are `@PublicRoute` for JWT purposes but guarded by a dedicated `ChannelGatewayAuthGuard`; rate-limited; body-size-capped.

### 8.2 Privacy (UU PDP posture)

- What crosses to the AI provider per turn: conversation text (post-redaction), FAQ chunks (clinic documents), session-availability data, and the booking echo (name + phone the customer typed). **No registry data, no medical data, no identifiers beyond what the data subject themselves sent in this conversation.**
- Transcripts persisted with the same append-only discipline as `ChatMessage` (no update/delete on message rows); conversation retention configurable, default 90 days then archived — this is a CS log, not a medical record (booking facts live on the `Appointment` row, which follows RME retention independently).
- The bot's first reply to a new conversation includes a one-line notice: automated assistant, data used for booking, sensitive data completed at the clinic.

### 8.3 Abuse & cost control

- Per-chat rate limit (e.g. 20 messages/hour) and daily LLM budget cap per channel; over-limit → polite template, no LLM call.
- Booking abuse: max N active future bookings per phone number; unknown-number bookings capped per day; admin can block an `externalChatId`.
- OTP abuse: max 3 verification attempts per challenge, max 3 challenges per chat per day, codes hashed at rest with a 5-minute TTL; repeated failed challenges against the same registered number flag the conversation for admin review (possible enumeration attempt).
- No-show feedback loop: channel-sourced no-shows visible in admin analytics (decides whether chat booking stays open-by-default).

### 8.4 Operations

- GOWA runs as a Docker service in `infra/docker` (session volume persisted!); WhatsApp session health (connected/QR-needed) surfaced on an admin status card via the gateway's status endpoint — a silently logged-out WhatsApp session is the #1 operational failure mode, so it must page/alert.
- Structured logs mirror ai-chatbot §11: conversation id, channel, tool calls, latency — never message bodies at info level, never tokens/keys.
- Metrics: messages/day per channel, intent mix, booking conversion, handoff rate, FAQ no-hit rate (feeds corpus improvement), LLM latency/cost.

### 8.5 Configuration (env)

| Variable | Purpose |
| --- | --- |
| `CS_CHANNEL_ENABLED` | Master switch (default false) |
| `WA_GATEWAY_KIND` | `GOWA` \| `WAHA` (adapter selection) |
| `WA_GATEWAY_BASE_URL` / `WA_GATEWAY_API_KEY` | Gateway REST access |
| `WA_GATEWAY_WEBHOOK_SECRET` | Inbound webhook auth |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` | Telegram Bot API |
| `CS_RATE_LIMIT_PER_CHAT_HOUR` | Default 20 |
| `CS_CONVERSATION_RETENTION_DAYS` | Default 90 |
| `CS_OTP_TTL_SECONDS` / `CS_OTP_MAX_ATTEMPTS` | Defaults 300 / 3 (§5.1.1) |
| `CS_OTP_MAX_CHALLENGES_PER_DAY` | Default 3 — §8.3's per-chat challenge quota; exceeding it stops challenging, not booking |
| `CS_LINK_REVERIFY_DAYS` | Default 180 — verified `ChannelPatientLink` age before re-challenge |
| `CS_MAX_ACTIVE_BOOKINGS_PER_PHONE` | Default 3 — counted across every record the number resolves to, drafts included |
| `CS_MAX_DRAFT_BOOKINGS_PER_DAY` | Default 50 — clinic-wide, because a per-chat cap costs nothing to evade with a second chat |
| `CS_HISTORY_TURN_LIMIT` / `CS_CLINIC_NAME` | Default 20 turns; clinic display name used in the system prompt |
| `DOCUMENT_S3_ENDPOINT` / `_BUCKET` / `_REGION` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` / `_FORCE_PATH_STYLE` | S3/MinIO |
| `DOCUMENT_EMBEDDING_MODEL` | e.g. `text-embedding-3-small`; dimension recorded per corpus |

---

## 9. Delivery Plan

Phases assume ai-chatbot Phase 13 (provider layer) is merged. Branch naming `feature/pcs-t<task>-<short-desc>`.

**Phase CS-1 — Document service + FAQ corpus (no channels yet)**
1. `PCS-T01` `document-management` schema (Document, DocumentChunk + pgvector), MinIO in compose, S3 adapter, RBAC seed. **Done, with Phase 15 `P15-T10`** — schema, migration, and the four `document.*` grants; the S3 adapter, which shipped earlier with presigned upload/download; and MinIO in `docker-compose.dev.yml` with an init container that creates the bucket, because MinIO has no create-on-boot setting and an API booting against a missing bucket fails on the first upload rather than at startup.
2. `PCS-T02` Admin upload/list/delete API + ingestion pipeline (MD + PDF) + presigned downloads. **Done, with Phase 15 `P15-T10`**: presigned upload → confirm-from-stored-object → list/read/edit/retire over the clinic corpus, all behind `document.*:any` with the `ANY`-scope check in the service, because the guard cannot distinguish it from a doctor's `OWN` grant; presigned downloads minted per request; and the MD/plain-text/PDF ingestion pipeline (extract → chunk → embed on local Ollama `bge-m3` → pgvector) behind a poller on `ingestStatus`, default off. `search_faq` at `PCS-T04` reads the chunks this writes — note the lexical config is `simple`, and a `tsquery` parsed under any other config cannot match them. **Closed out** with the one criterion that had no coverage: the pipeline *composed*. Every stage was tested in isolation — the service against a mocked storage and a mocked embedder, the chunk write against real Postgres but bypassing the service, the PDF parser against bytes that never came from a bucket — and nothing put a file in storage at one end and asked a question at the other. The new opt-in suite does, and it lands three assertions the isolated tests structurally cannot make: that `pdf-parse` accepts the body the *storage adapter* produces from a provider's response stream rather than one a test author built; that the width check in `EmbeddingService` is exercised against a real model instead of against a stub written knowing the answer; and that an Indonesian question retrieves an English passage — the cross-lingual property that chose `bge-m3` and chose to run it locally (§5.4), never once observed, because fabricated vectors cannot exhibit it. Gated on `S3_INTEGRATION_TEST_BUCKET` **and** `EMBEDDING_INTEGRATION_TEST_BASE_URL`, both dedicated variables rather than the app's own `S3_BUCKET`/`OLLAMA_EMBEDDING_BASE_URL`, which have defaults: keying off a value that is always present would make "no test infrastructure configured" indistinguishable from "the default happens to be right", and the suite would fail rather than skip on every machine without a pulled model.
3. `PCS-T03` Admin dashboard page: FAQ corpus management (upload, ingest status, delete). Orval sync. **Done** at `/admin/clinic-corpus`, a separate route from the personal knowledge base at `/admin/knowledge-base` rather than a mode of it — the two differ in whether a document is patient-reachable, and a toggle is a thing you can be wrong about: uploading an internal SOP into a patient-facing corpus by leaving a switch where the last person left it is the mistake worth making structurally impossible. No Orval regeneration was needed; the admin routes were already in the checked-in contract from `PCS-T02`. Three decisions carry the screen. **Visibility defaults to `DOCTOR`, not `BOTH`** — the safe default is the narrow one, because an admin who ignores the field gets a document that answers too few questions rather than an internal SOP quoted to a stranger on WhatsApp, and only one of those two mistakes is recoverable by editing the row afterwards. **Visibility is editable even though changing it discards the chunks**, which is the opposite of the call made for `language` on a personal document: a language change is a re-ingest wearing the costume of a metadata edit, but a visibility change is a *policy* decision — someone has realised an internal SOP is answering patients — and there must be a way to stop that in one step; the dialog states the cost up front, because an admin who does not know the document leaves the corpus for a few minutes will read the resulting `PENDING` as a bug. **The list is pinned to `FAQ_KNOWLEDGE_BASE`**, since a `GENERAL` clinic document is stored and never embedded, and listing it on a knowledge-base screen would offer a re-ingest that can only ever be refused. The ingest badge repeats `P15-T21`'s "not answerable yet" line for the reason that matters more here than there: uploaded and retrievable are separated by a background worker, and an admin who uploads the clinic's opening hours has every reason to assume the channel started using them. `put-file-to-signed-url` and the ingest-state map moved to `lib/documents/` — both are read by two corpora now, and two tables that could disagree about what `PROCESSING` means is precisely the drift worth designing out.
4. `PCS-T04` `search_faq` retrieval service + eval harness (golden Q→chunk set from the clinic's real FAQ). **Done.** The retrieval *mechanics* already existed — `DocumentRetrievalService` (`P15-T11`) and a SQL predicate that already hard-filters the clinic half to `ownerType = CLINIC` + `purpose = FAQ_KNOWLEDGE_BASE`, exactly as §4.3 requires. What did not exist was a way to call it that an anonymous channel could not misuse: `channelVisibility` and `ownerUserId` are *parameters*, so entirely within the type a caller can ask for `DOCTOR` and be handed staff-only SOPs, or name an owner and be handed that user's private documents. `FaqSearchService` removes both — the method takes a question and nothing else, and the two values that decide scope are constants in the file rather than arguments a future tool-registry change can set wrongly. That is principle 2 ("structurally incapable, not instructed") applied to the corpus, and the same reasoning governs the return type: `FaqSearchPassage` carries the §4.2 allowlist — passage text and document title — so a chunk's internal ids and its RRF score cannot reach a customer reply by omission, the score especially, being a number a model will happily present as a confidence percentage. A retrieval failure returns no passages rather than throwing: an unreachable embedder must degrade to "I don't have that written down", not to an error on someone's WhatsApp message. **The eval harness is shared with Phase 15's `P15-T12`** — a fixed question set with expected documents over one corpus is the same deliverable asked twice, the arrangement `PCS-T01`/`T02` already have with `P15-T10` — and it is documented in [faq-retrieval-eval.md](./faq-retrieval-eval.md). Three things make it worth having: it queries **`search_faq`, not the retrieval service**, so it measures what the channel can actually see through the real output allowlist (grading maps title back to slug, because titles are all the channel gets); it separates three kinds of wrong a single accuracy number would blend — a miss, a false answer on a question nothing covers, and a **staff-only leak**, which is not a quality result at all but the scope predicate failing; and it reports **cross-lingual recall on its own denominator**, because that is the number the architecture rests on and a healthy overall recall can hide a dead half. The corpus is a checked-in stand-in modelled on what an Indonesian primary clinic publishes, not the clinic's real FAQ, which does not exist yet — swapping it in changes the fixture and the expected slugs and nothing else. Not yet run: it needs pgvector, a live embedding host, and a bucket.

**Phase CS-2 — Conversation core on Telegram (pilot)**
5. `PCS-T05` `channel-gateway` module: normalizer, Telegram webhook + grammY adapter, outbound dispatcher, dedup. **Done, Telegram only** (D-CS-05): free, official, and no ban risk, so the conversational core can be exercised end to end before a WhatsApp number is exposed. `WhatsappGatewayService` is declared and unbound — `PCS-T09` binds GOWA, `PCS-T10` binds WAHA, and because the dispatcher already branches on channel both are a provider binding rather than an edit. Four decisions carry the slice. **Everything authenticated answers 200**, including updates this clinic cannot use: Telegram redelivers anything that is not a 2xx and eventually drops the webhook, so a 4xx on one sticker would have it retried on a schedule, and a 5xx on a downstream fault would have it retried after dedup had *already claimed* it — dropped as a duplicate forever. The reply body names the outcome (`ACCEPTED` / `DUPLICATE` / `IGNORED` / `DISABLED`) so an operator can tell the four apart. **An unconfigured webhook secret closes the endpoint rather than opening it** — with `TELEGRAM_WEBHOOK_SECRET` empty every request is refused, including one carrying an empty header, which would otherwise compare equal and let the whole check pass by accident; the comparison is constant-time. **A sink failure does not un-claim the message**, which is a real trade made deliberately: releasing the claim would let a deterministically-failing message be retried forever, each attempt doing whatever partial work it managed, and at-most-once with a logged failure is the safer half on a channel whose failure mode is a duplicate appointment. And **the handoff to `PCS-T06` is a port** (`InboundMessageSink`, defaulting to a logging drop), which is how "the gateway contains zero business logic" survives contact with the conversation state machine. See the two amendments in §4.1 — the three-column dedup key, and grammY as an API client only.
6. `PCS-T06` `customer-service` module: conversation state machine, transcript persistence, `IntentOrchestrator` on Phase 13 adapters, safety/redaction service. **Done, without tools** — `PCS-T07` registers the three, and until then the model answers from the system prompt alone and honestly says it has no information for FAQ questions. Shipping the loop before its tools is deliberate: the conversation core, the transcript, and the guards are what need exercising on real traffic first (D-CS-05), and a bot whose worst answer is "I don't have that written down" is a safe thing to point a pilot bot at. Five decisions carry it. **The state machine's only real question is whether the LLM may see a message**, and four of the five states answer no — while a conversation is `NEEDS_HUMAN`, `HUMAN_ACTIVE`, `AWAITING_OTP`, or `ARCHIVED`, inbound messages are still persisted but never reach a provider, which is what makes "prompt injection cannot talk its way past a handoff" structural: there is no prompt to inject into. The paused set is derived from a shared list rather than written as a branch, so a state added later must be classified deliberately instead of defaulting into the half that reaches the model. **Redaction runs first and unconditionally**, before the block/allow decision and before persistence, because a blocked message is still written to the transcript and an identifier stripped afterwards would already have been recorded; a redacted turn is then answered locally rather than forwarded, since sending a model a turn whose identifiers were just stripped is the one exchange most likely to make it ask for them again. **Emergencies are checked before injection** — someone describing chest pain in clumsy phrasing must not lose the ambulance number to a pattern match — and everything the safety layer resolves resolves with no provider call at all. **Replies are persisted before dispatch**, so the transcript records what the clinic decided to say even when the gateway then failed to deliver it. And **the `InboundMessageSink` seam pays off exactly as designed**: this module rebinds it and not one line of `channel-gateway` changed. The binding needs `forwardRef` in both directions, which is honest rather than awkward — inbound travels one way and replies travel back — and without it Nest's per-module resolution would leave the gateway holding its own binding, an override that compiles, loads, and silently does nothing. Two defects were found by failing tests and fixed in the same PR: the shared emergency patterns require adjacent word order (`nyeri dada`) and miss the colloquial register this channel actually receives (`dada saya sakit banget`, `sesak nih`), now supplemented by a CS-specific list; and `ignore your previous instructions` slipped through the shared prompt-injection rule, which allowed `all`/`any`/`the` but not `your` while its sibling rule allowed all four — a one-word gap that was open on the in-app channel too.
7. `PCS-T07` Tools: `search_faq` wired; `list_available_sessions`; `book_appointment` + `ChannelPatientLink` + draft-patient flow + existing-patient authentication (contact-share, OTP sub-flow, `AWAITING_OTP` state; channel-possession auto-verify lands with WhatsApp in `PCS-T09`). **Done.** The three tools, the registry that fails closed in both directions, and the booking flow behind them. Six decisions carry it. **The confirmation reply is written by this codebase, not by the model**, and that is what makes the no-registry-oracle criterion hold: a booking that attached to a verified record, one that fell through to a draft after a failed challenge, and one for a number nobody recognised all reach the *same* function and produce the same bytes — a model composing that sentence would phrase the three slightly differently, and the difference is a readable answer to "is this number in your registry?". The same choice is what keeps a queue number out of the reply, since queue numbers are assigned at check-in and a model handed a booking result and asked to be helpful will invent one. **The registry has no ability filter**, unlike the in-app one, because every caller here is the same caller — an unauthenticated member of the public — so the boundary had to be the catalogue itself; what it does enforce is the name, the Zod arguments, and the §4.2 output allowlist, the last of which is what makes D-CS-02 (results *do* return to the model) safe rather than hopeful. **`book_appointment` has no NIK, BPJS, date-of-birth or address parameter**, and the draft patient it books against has *null columns* where those values would go — which is why `PatientProfile.dateOfBirth` and `.address` became nullable and gained a `source` discriminator: a placeholder date in a record PMK 24/2022 keeps for 25 years is worse than an absence, and "we never asked" and "someone left it blank" are different facts, only one of which has a worklist. **Sessions are addressed by an opaque token**, not an id, because sessions materialise lazily and an unbooked window has no row — and making the token meaningless to the model is what stops it *constructing* a booking target the customer never chose. **The OTP tier ships unbound**: a code must reach the *registered* number, Telegram cannot message a phone number, and `OtpDeliveryService` is declared with no provider exactly as `WhatsappGatewayService` was at `PCS-T05`; `PCS-T09` binds it. Until then Telegram's one-tap contact share carries verification, and every other path — quota spent, delivery failed, wrong code, expired, declined — falls through to a draft booking, which §5.1.1 already specifies. **Tool-call turns are persisted but excluded from the replay window** on a safety tag: they are audit, not conversation, and replaying their JSON would spend a growing share of every later prompt re-reading answers the model already gave. The channel writes as a reserved `CUSTOMER_SERVICE_CHANNEL` actor with five grants and nothing more, following `P14-T04`'s pattern for the same reason — the domain services resolve permissions from a real user row, and a null actor would be a permission bypass on the one path reachable from the public internet without any authentication at all. ⚠️ **Not run end to end**: no bot token and no active `AiProviderConfig`, so the tool loop has never met a real provider or a real Telegram chat.
8. `PCS-T08` Admin: conversation inbox, transcripts, handoff queue, takeover reply, channel-booking worklist in check-in. **Done.** The human side of the channel: `/admin/conversations` with its handoff queue, transcript, takeover and reply, §8.3's chat block, and §5.2's arrival worklist on the registration screen. Six decisions carry it. **A block is a nullable column, not a sixth `ConversationState`** — it is a policy overlay and a state is a position in a lifecycle, so blocking a chat a colleague is mid-conversation on must not erase `HUMAN_ACTIVE`, and unblocking must return it there rather than to a guess; the pair also answers "who decided this", which a state transition cannot. It is also the *first* thing the inbound path checks, before redaction and before persistence, which is stricter than the four paused states: those keep the transcript complete because a human will read it, while a block exists to stop the chat costing anything — one that still wrote a row per message would move a flood from tokens to storage rather than ending it. **Replying takes the conversation over**, in the same call, rather than being refused from `BOT_ACTIVE`: refusing costs a click at the exact moment someone is answering a waiting customer, and allowing the reply *without* the transition leaves the bot free to answer the next message over the top of a person — two voices in one chat, which is the failure the state machine exists to prevent. **`AWAITING_OTP` refuses takeover, reply, and release**, and that is the one exclusion worth stating: the conversation is holding a live possession challenge and a booking that has not happened yet, the customer's next message is matched against a hash, and an admin stepping in would both strand the booking and turn a code into a message a person now reads. The state resolves itself inside the OTP TTL, so refusing is a bounded delay while taking over is a lost booking. **The list endpoint returns no message bodies** — a preview line would put post-redaction customer text into every cached list response, every screenshot of the queue, and every log of a list request, for conversations nobody opened — and for the same reason the inbox search matches the display name and the chat id only: a full-text search over `content` would be an index over exactly the text §5.3's redaction exists not to keep. **The worklist filters on the *appointment's* provenance, not the patient's**, because a verified customer's chat booking attaches to a long-standing front-desk record and `PatientProfile.source` would call it a walk-in; and "incomplete" is the two columns `PCS-T07` made nullable, not every empty field — a missing NIK or BPJS number is reported so the desk knows to ask, but a patient may genuinely have neither, and a worklist that never clears is one people stop reading. **The merge moves bookings and retires the draft, and completing a record is somewhere else**: NIK, BPJS and demographics are entered through the existing patient-edit route with its own grant, its own validation, and its own identifier encryption, because a second write path for those columns is a second place for the encryption rules to drift. The merge refuses a front-desk source, a target that is itself a draft, a record merged into itself, and any draft that has acquired an encounter, prescription, or invoice — moving clinical history between patients is not a front-desk button — and it soft-deletes rather than removes, since the MRN was quoted to a customer and the row carries the privacy-notice record the channel deferred. Four new grants, all `ANY`-only and all ADMIN: `conversation.read`, `conversation.write`, `conversation.block` split from write because silencing a member of the public is not the shift's ordinary work, and `patient.merge`, which is the only patient grant that ends a record rather than editing one. ⚠️ Still not exercised end to end: no bot token and no active `AiProviderConfig`, so the inbox has never displayed a conversation a real customer started.

**Phase CS-3 — WhatsApp**
9. `PCS-T09` GOWA in compose + `GowaAdapter` + webhook auth + session-health status card; number warm-up runbook. **Done.** WhatsApp is bound, and the *shape* of the change is the payoff `PCS-T05` was designed for: `WhatsappGatewayService` had been declared and unbound since then, the dispatcher already branched on channel, and turning the channel on is a `useClass` plus a webhook controller. Six decisions carry it. **The webhook is authenticated by HMAC over the raw body, not by a shared secret**, which is the stronger of the two available checks and the reason `rawBody: true` is now on in bootstrap: GOWA signs the exact bytes it sent, and verifying against `JSON.stringify(parsedBody)` would be verifying a re-serialisation — key order, whitespace, and unicode escaping are all free to differ, so the check would fail on honest deliveries and any implementation that "fixed" that by loosening the comparison would be no check at all. The Telegram rule carries over unchanged: an **empty secret closes the endpoint**, and it matters more here, because a forged inbound message on this channel can book an appointment. **`is_from_me` is the rejection that matters most in the normalizer.** GOWA echoes the clinic's own outbound messages back through the same webhook, so without it the bot answers itself — two automated turns in a loop, with a banned number at the end. **§5.1.1 tier 1 lands as a comparison, not a challenge**: a WhatsApp sender's JID *is* a number WhatsApp verified the device owns, so a customer booking under the number they are messaging from is marked `CHANNEL_VERIFIED` and linked outright. Challenging them would send a code to the very chat that asked for it, proving only that a chat can read its own messages. It is safe to compare against the *chat* JID because the normalizer refuses anything that is not a one-to-one `@s.whatsapp.net` address, so chat and sender are the same person by the time a booking can happen. **The OTP tier turns on by providing a class.** `OtpDeliveryService` waited since `PCS-T07` for a transport to the *registered* number rather than to the chat that asked — the asymmetry that is the whole proof — and Telegram structurally cannot be one. Its message is the only outbound message on this channel that is not a reply, so it is written to be read by a stranger: it names the clinic, says what the code is for, says ignoring it is safe, and asks for nothing. **Sends are paced as a chain, not a per-call sleep.** §2.1 names human-like pacing as a ban mitigation, and two replies composed concurrently would each sleep in parallel and then fire together — exactly the burst the pacing exists to prevent. **The session-health card exists because the failure is silent**: a logged-out session errors nothing, the bridge keeps answering and the API keeps taking bookings while every reply is never delivered, so the card polls and shows the three flags separately — not configured, not connected, not logged in — because only the last needs a person holding the clinic's phone. Compose runs GOWA behind a `whatsapp` profile with **no published port**, basic auth on, and a persisted session volume; the [warm-up runbook](../ops/whatsapp-number-warmup.md) carries the dedicated-number, gradual-warm-up, reply-only and re-pairing procedures. ⚠️ **Not run against a real number**: there is no SIM, no paired device, and no active `AiProviderConfig`, so the end-to-end criteria — a WhatsApp message answered from the FAQ, and a JID-matching booking linking without OTP — are proven by unit tests over the adapter, the normalizer, the guard, and the tier-1 comparison, not by a live conversation.
10. `PCS-T10` `WahaAdapter` parity implementation + adapter contract test suite (the same fixture conversations must pass through both).
11. `PCS-T11` Load/abuse testing, rate limits verified, UU PDP notice copy reviewed, staged rollout (announce the WA number only after 2 clean weeks on Telegram).

**Later (recorded, not committed):** reschedule/cancel via confirmation code; WhatsApp Cloud API adapter; special-request booking in chat; patient/doctor document features on `document-management`; voice-note transcription.

---

## 10. Decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| D-CS-01 | GOWA as primary WA gateway, WAHA as tested fallback behind one port interface; official Cloud API is the planned endgame | Smallest footprint now, ban-risk hedged by adapter swap, ToS-clean path preserved |
| D-CS-02 | CS tool results DO return to the LLM for reply composition (unlike in-app Mode A) | The CS tool outputs are non-sensitive by construction (clinic docs, capacity data, customer-typed echo); allowlists enforce it. Reply quality on a text-only channel depends on it |
| D-CS-03 | No sensitive data over chat, structurally: booking tool has no NIK/BPJS/DOB parameters; inbound redaction for volunteered data | "The prompt says don't" is not a control; absent schema fields and pattern redaction are |
| D-CS-04 | Draft-patient + arrival-completes-record flow; silent phone matching | Unverified channel can never read the registry, but admin work is still saved |
| D-CS-08 | An existing-patient match must be authenticated before linking: channel possession (WA), contact share (TG), or OTP to the registered number — handled as a deterministic state, never through the LLM | A phone number is a claim, not proof; without this, knowing someone's number lets you book against (and probe) their record. Unverified fallback is a draft booking, so no dead ends and no registry oracle |
| D-CS-05 | Telegram ships first as pilot | Free, official, zero ban risk — de-risks the conversational core before the WA number is exposed |
| D-CS-06 | `document-management` is the single document store: CS FAQ corpus, Phase 15 retrieval, and per-owner knowledge bases (doctor/admin `OWN`-scoped) all live in it; embeddings follow Phase 15's local `bge-m3` decision | One ingestion pipeline, one embedding space, one S3 layout; the future patient/doctor document feature and personal KBs are policy additions, not schema migrations |
| D-CS-07 | Intent classification = the tool loop itself, no separate classifier stage | Fewer components, half the latency; revisit only on observed misrouting |

## 11. Sources

- [GOWA — aldinokemal/go-whatsapp-web-multidevice](https://github.com/aldinokemal/go-whatsapp-web-multidevice) · [webhook payload docs](https://github.com/aldinokemal/go-whatsapp-web-multidevice/blob/main/docs/webhook-payload.md) · [releases](https://github.com/aldinokemal/go-whatsapp-web-multidevice/releases)
- [WAHA — WhatsApp HTTP API](https://waha.devlike.pro/) (free since 2026.6.1; engine overview)
- [Telegram Bot API](https://core.telegram.org/bots/api) · [grammY](https://grammy.dev)
