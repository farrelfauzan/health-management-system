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

> **Risk — unofficial protocol.** Both GOWA and WAHA automate WhatsApp Web, which violates WhatsApp ToS; the clinic number can be **banned**. Mitigations: use a dedicated business number (never a personal one), warm the number up gradually, reply-only behavior (we never message first except confirmations within an active conversation), per-number rate limiting, and human-like send pacing. The **long-term migration path** is the official **WhatsApp Business Cloud API** (Meta) — template-message costs and business verification apply, but no ban risk. The `WhatsappGatewayPort` interface must be designed so a Cloud API adapter is a drop-in third implementation (§4.2). Treat GOWA/WAHA as the pragmatic v1, not the endgame.

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

Dedup on `(channel, externalMessageId)` is mandatory — webhook retries must not double-book an appointment.

### 4.2 `customer-service` module

Owns conversations, intent orchestration, the tool registry, safety, and handoff.

```
apps/api/src/modules/customer-service/
  controller/
    cs-admin.controller.ts            # admin: conversation list, transcript, handoff queue, takeover
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

While a conversation is `NEEDS_HUMAN` or `HUMAN_ACTIVE`, inbound messages are persisted but **not** sent to the LLM; the admin replies from the dashboard through the same outbound dispatcher. In `AWAITING_OTP`, inbound messages are matched against the pending code deterministically and likewise never reach the LLM (§5.1.1).

#### The three tools (v1 — complete list)

| Tool | Arguments (Zod) | Backing service | Output allowlist |
| --- | --- | --- | --- |
| `search_faq` | `query: string` | `DocumentIngestionService` → pgvector top-k | chunk text, source document title. Nothing else exists in the corpus (clinic docs only) |
| `list_available_sessions` | `poliOrDoctorName?: string`, `dateFrom: string`, `dateTo: string` (≤ 14 days) | `AppointmentManagementService` (session calendar, the [revamp](../revamp/appointment-scheduling.md) model) | doctor display name, specialty/poli, session date, window (`08:00–12:00`), remaining capacity or `full`. **No attendee data** |
| `book_appointment` | `patientFullName: string`, `phoneNumber: string`, `sessionId: string`, `note?: string` (note schema-capped at 200 chars) | `AppointmentManagementService` + channel-patient resolution (§5). May suspend into the `AWAITING_OTP` verification sub-flow when the phone matches an existing patient (§5.1.1) | booking reference code, doctor name, session date + window, arrival instructions. **Never** queue position promises, never other patients, never whether the phone matched a record |

That the registry contains *only* these three is itself the security boundary: there is no tool that reads a patient record, so no prompt injection can ask for one.

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
| `CS_LINK_REVERIFY_DAYS` | Default 180 — verified `ChannelPatientLink` age before re-challenge |
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
5. `PCS-T05` `channel-gateway` module: normalizer, Telegram webhook + grammY adapter, outbound dispatcher, dedup.
6. `PCS-T06` `customer-service` module: conversation state machine, transcript persistence, `IntentOrchestrator` on Phase 13 adapters, safety/redaction service.
7. `PCS-T07` Tools: `search_faq` wired; `list_available_sessions`; `book_appointment` + `ChannelPatientLink` + draft-patient flow + existing-patient authentication (contact-share, OTP sub-flow, `AWAITING_OTP` state; channel-possession auto-verify lands with WhatsApp in `PCS-T09`).
8. `PCS-T08` Admin: conversation inbox, transcripts, handoff queue, takeover reply, channel-booking worklist in check-in.

**Phase CS-3 — WhatsApp**
9. `PCS-T09` GOWA in compose + `GowaAdapter` + webhook auth + session-health status card; number warm-up runbook.
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
