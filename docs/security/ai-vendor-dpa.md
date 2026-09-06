# External AI processors: what crosses, to whom, under what instrument

**SJ-17.** A field-level record of every payload that leaves the HMS boundary
for an external AI vendor, so the UU PDP No. 27/2022 question — *which
processors receive personal data, and under what agreement* — has an answer
drawn from the code rather than from the architecture diagram.

This document is deliverable #1 of the ticket (the inventory) plus the parts of
#5 (the decision record) that can be written without a counterparty. The
inventory is not prose alone: §9 describes the contract test that fails the
build when the boundary moves, which is what keeps this document from quietly
decaying into fiction.

The vendor posture review (§5) and the legal gap list (§6) are **open** and say
so explicitly: they need the deployment's actual vendor and a named compliance
owner, and inventing either would make this document worse than absent. The
disclosure draft in §10 is unreviewed text for a lawyer to correct, not copy to
ship.

## 1. The correction this inventory has to make first

The ticket's Prerequisites state:

> the chat provider is external; embeddings are local Ollama — confirm the
> embedding path truly never leaves.

**Confirmed false as of this commit.** `EMBEDDING_PROVIDER` defaults to
`TOGETHER` ([embedding.config.ts:9](../../apps/api/src/common/embedding/embedding.config.ts:9)),
and `.env.example` ships that default ([`.env.example:372`](../../apps/api/.env.example:372)).
The local Ollama adapter is still fully supported, but it is the opt-in branch,
not the default one.

So there are **two external processors in scope**, not one, and the second was
not on the ticket's list. The code says so plainly —
[together-embedding.service.ts:30](../../apps/api/src/common/embedding/together-embedding.service.ts:30):

> This adapter is a data processor, and the local one was not (D-EMB-01).

The switch is a single function ([resolve-embedding-service.ts](../../apps/api/src/common/embedding/resolve-embedding-service.ts)),
resolved once at startup, and an unrecognised value throws rather than falling
back — so which company sees the corpus is decided by one variable, provably.

## 2. The two boundaries

```
                    ┌─────────────────────────────────────────┐
   browser ────────▶│  HMS API (apps/api)                     │
   (clinician       │                                         │
    or patient)     │  ChatRetrievalService ──┐               │
                    │  ChatContextEnrichment ─┤               │
                    │  history replay ────────┴──▶ adapter ───┼──▶ ❶ CHAT VENDOR
                    │                                         │     (DB-configured)
                    │  DocumentIngestionService ──┐           │
                    │  DocumentRetrievalService ──┴──▶ Embed ─┼──▶ ❷ EMBEDDING VENDOR
                    │                                         │     (Together AI,
                    │  tool dispatch ──▶ results ─────────────┼─┐   by default)
                    └─────────────────────────────────────────┘ │
                                                                │
   browser ◀────────────────────────────────────────────────────┘
   (tool results return to the CLIENT, never to ❶ — §3.3)
```

**❶ Chat vendor.** Not fixed in code: an admin picks the kind and credentials,
stored as an `AiProviderConfig` row and resolved per exchange
([ai-provider-resolver.service.ts](../../apps/api/src/modules/ai-chatbot/service/ai-provider-resolver.service.ts)).
Supported kinds and their default base URLs
([ai-provider-base-urls.ts](../../apps/api/src/modules/ai-chatbot/infrastructure/providers/ai-provider-base-urls.ts)):

| Kind | Default base URL | Hosting |
|---|---|---|
| `OPENAI` | `https://api.openai.com/v1` | US |
| `DEEPSEEK` | `https://api.deepseek.com/v1` | CN |
| `ANTHROPIC` | `https://api.anthropic.com/v1` | US |
| `GEMINI` | `https://generativelanguage.googleapis.com/v1beta/openai` | US |
| `OLLAMA` | `http://127.0.0.1:11434/v1` | **local — not a processor** |
| `OPENAI_COMPATIBLE` | none (admin must supply) | unknown until configured |
| `AZURE_OPENAI` | none (admin must supply) | per Azure resource region |

The hosting column is the vendors' published corporate hosting, stated here to
frame the Art. 55–56 transfer question — **not** a verified answer to it. Two of
these kinds (`OPENAI_COMPATIBLE`, `AZURE_OPENAI`) cannot be answered at all
without knowing the deployment's configured URL.

**❷ Embedding vendor.** Fixed in config, not admin-managed, and deliberately so:
the vector width is a column type, so swapping the embedder is a migration and a
re-ingest rather than a settings screen
([embedding.config.ts:112](../../apps/api/src/common/embedding/embedding.config.ts:112)).
Default `https://api.together.xyz`, model
`intfloat/multilingual-e5-large-instruct`.

## 3. Field-level inventory — ❶ chat vendor

Every completion request is assembled in one place,
`AiChatbotService.buildCompletionMessages`
([ai-chatbot.service.ts:686](../../apps/api/src/modules/ai-chatbot/service/ai-chatbot.service.ts:686)).
The request body is built by the adapter
([openai-compatible.adapter.ts:88](../../apps/api/src/modules/ai-chatbot/infrastructure/providers/openai-compatible.adapter.ts:88),
[anthropic.adapter.ts:52](../../apps/api/src/modules/ai-chatbot/infrastructure/providers/anthropic.adapter.ts:52)).

### 3.1 What is transmitted

| # | Payload | Personal data? | Gated by | Source |
|---|---|---|---|---|
| 1 | `AI_CHAT_SYSTEM_PROMPTS[channel]` | no — HMS-authored static text | always | [ai-chat-system-prompts.ts](../../apps/api/src/modules/ai-chatbot/service/ai-chat-system-prompts.ts) |
| 2 | `contextPayload`, JSON, after `AI_CHAT_CONTEXT_PREAMBLE` | **yes** — see §3.2 | `AI_CHAT_CONTEXT_ENRICHMENT_ENABLED` (default off) | [chat-context-enrichment.service.ts](../../apps/api/src/modules/ai-chatbot/service/chat-context-enrichment.service.ts) |
| 3 | `retrieval.promptBlock`, JSON array, after `AI_CHAT_RETRIEVAL_PREAMBLE` | **clinic documents** — PHI if the corpus contains it | `AI_CHAT_RETRIEVAL_ENABLED` (default off) | [chat-retrieval.service.ts:133](../../apps/api/src/modules/ai-chatbot/service/chat-retrieval.service.ts:133) |
| 4 | replayed history, ≤20 turns, `USER` and `ASSISTANT` only | **yes — free text, assume PHI** | always | [ai-chatbot.service.ts:69](../../apps/api/src/modules/ai-chatbot/service/ai-chatbot.service.ts:69) |
| 5 | tool definitions: name, description, JSON Schema | no — HMS-authored | `AI_CHAT_TOOLS_ENABLED` (default off) | [build-chat-tool-wire-definitions.ts](../../apps/api/src/modules/ai-chatbot/tools/build-chat-tool-wire-definitions.ts) |
| 6 | `model`, `max_tokens`, API key header | no | always | adapter |
| 7 | **second call:** title prompt + question/answer excerpts, ≤400 chars each | **yes — same text as 4** | first exchange of an unnamed session | [chat-session-title.service.ts:17](../../apps/api/src/modules/ai-chatbot/service/chat-session-title.service.ts:17) |

Row 4 is the one that matters most and is the least constrained: it is whatever
the user typed. No allowlist applies to it, and none can — a patient describing
a symptom *is* the product. Rows 2 and 3 are both **off by default**; row 4 is
not, so a deployment that turns AI on at all transmits free-text PHI.

Row 7 is a second HTTP request per named session, easy to miss. It transmits no
*new* data — both excerpts are text the same vendor produced or received moments
earlier — but it is a separate call, and a retention or logging question asked
about it gets the same answer as row 4.

### 3.2 The enrichment payload, field by field

Projected down at the source and then passed through `redactChatContext`
([redact-chat-context.ts](../../apps/api/src/modules/ai-chatbot/service/redact-chat-context.ts)),
which strips any key matching a forbidden fragment (`nik`, `bpjs`, `mrn`,
`note`, `diagnos`, `allerg`, `prescription`, `email`, `phone`, `address`,
`patientid`, `doctorid`, `userid`, credentials).

| Channel | Fields sent | Notes |
|---|---|---|
| `PATIENT` | `displayName`, `nextAppointment{scheduledAt, doctorName, specialty, status}`, `activeQueueNumber` | the patient's own name and their doctor's name |
| `DOCTOR` | `todayAppointmentCount`, `nextAppointmentAt`, `assignedPatientCount` | **counts and a timestamp only** — no patient identity, deliberately ([chat-context-enrichment.service.ts:118](../../apps/api/src/modules/ai-chatbot/service/chat-context-enrichment.service.ts:118)) |
| `ADMIN` | *nothing* | returns `{}` before any read |

Two structural properties are worth recording for the processor agreement.
Every read goes through the owning domain service **as the authenticated user**,
so the chatbot can never assemble context the user could not already read. And
what is about to be transmitted is persisted as its own `SYSTEM` turn *before*
the call ([ai-chatbot.service.ts:330](../../apps/api/src/modules/ai-chatbot/service/ai-chatbot.service.ts:330)) —
that row is the per-exchange answer to "what personal data went to the
processor, and when", which is exactly the audit question UU PDP asks.

### 3.3 What is NOT transmitted — and why that is fragile

**Tool results never reach the chat vendor.** Mode A executes the model's
requested lookups as the asking user and returns results *to the client*
([ai-chatbot.service.ts:391](../../apps/api/src/modules/ai-chatbot/service/ai-chatbot.service.ts:391)).
Two independent mechanisms enforce it: results are persisted as `SYSTEM` turns,
and `buildCompletionMessages` filters `SYSTEM` out of the replay
([ai-chatbot.service.ts:712](../../apps/api/src/modules/ai-chatbot/service/ai-chatbot.service.ts:712)).
So the patient rows a lookup returns — the richest PHI in the system — are not
in the vendor's context at all. Stored `SYSTEM` turns being excluded also means
earlier exchanges' context and passages are never resent.

**This is a property of the current implementation, not a guarantee.** Both
adapters already carry Mode B wire shapes for `role: 'tool'` messages
([openai-compatible.adapter.ts:129](../../apps/api/src/modules/ai-chatbot/infrastructure/providers/openai-compatible.adapter.ts:129),
[anthropic.adapter.ts:96](../../apps/api/src/modules/ai-chatbot/infrastructure/providers/anthropic.adapter.ts:96)),
unreachable today because nothing constructs such a message.
`.env.example:242` describes a flag, `AI_CHAT_TOOL_RESULT_TO_PROVIDER`, that
**exists in no source file** — it is documentation of an intent (P15-T07), not a
setting. The day it is implemented, this section is void and the inventory needs
re-running: full patient summaries, medication stock, and cashier reports would
begin crossing to ❶.

## 4. Field-level inventory — ❷ embedding vendor

Two call sites, both unconditional once retrieval/ingestion is used:

| # | Payload | Personal data? | When | Source |
|---|---|---|---|---|
| 1 | every chunk of every ingested document | **whatever the corpus contains** | on ingest | [document-ingestion.service.ts:86](../../apps/api/src/modules/document-management/service/document-ingestion.service.ts:86) |
| 2 | the user's raw question, verbatim | **yes — free text, assume PHI** | every retrieval | [document-retrieval.service.ts:80](../../apps/api/src/modules/document-management/service/document-retrieval.service.ts:80) |

Sent as `{model, input: [...texts]}` in batches of 16 to `/v1/embeddings`
([together-embedding.service.ts:147](../../apps/api/src/common/embedding/together-embedding.service.ts:147)).
Vectors come back; nothing is logged; the credential never appears in an error
line.

Note the asymmetry with ❶: rows 2 and 3 of §3.1 are behind default-off flags,
but **the question text reaches ❷ whenever retrieval runs at all** — the query
must be embedded in the same vector space as the corpus. There is no redaction
step on this path and no sensible place to put one, because a redacted question
retrieves the wrong passages.

Two documentation inconsistencies found while tracing this, both worth fixing
whether or not SJ-17 proceeds:

1. `.env.example:251` says retrieval "Needs an ingested corpus and a reachable
   `OLLAMA_EMBEDDING_BASE_URL`" — stale since `TOGETHER` became the default.
2. [document-management.module.ts:28](../../apps/api/src/modules/document-management/document-management.module.ts:28)
   describes `EmbeddingService` as turning passages into vectors "on a local"
   embedder. Same staleness, in a comment a future reader would trust.

## 5. Vendor posture review — OPEN

Ticket §2 asks for training use, retention, sub-processors, and hosting region,
each with a citation and a date checked. **Not answerable from this repository.**
The chat vendor is a database row in whichever deployment is being reviewed, and
this document must not guess it.

To close this section, someone with access to the target deployment supplies:

| Question | ❶ chat vendor | ❷ embedding vendor |
|---|---|---|
| Which vendor, which model | from the active `AiProviderConfig` row | Together AI unless `EMBEDDING_PROVIDER=OLLAMA` |
| API data used for training? | | |
| Retention period for prompts | | |
| Sub-processors | | |
| Hosting region | | |
| Date checked / by whom | | |

## 5b. Delivery processors — WhatsApp and email (P16-T21, NFR-PRIV-06)

Phase 16 added a **third** class of external recipient, and it is not an AI
vendor: a document delivered to a patient leaves the building over WhatsApp or
email. It belongs in this inventory for the same reason the embedding vendor
did — the ticket that created it was not the ticket that wrote the processor
list, and an unlisted processor is the failure mode this document exists to
prevent.

| | ❸ WhatsApp bridge | ❹ SMTP relay |
|---|---|---|
| What it is | A self-hosted bridge (`GOWA` or `WAHA`) paired to the clinic's own WhatsApp number, on the compose network with no published port | Whatever `SMTP_*` names in the target deployment |
| What crosses | The message body, the recipient's phone number, and the **attachment**: a password-protected PDF (D-027) | The message body, the recipient's address, and the same attachment |
| Who it reaches | WhatsApp/Meta, as the transport for any WhatsApp message | The relay operator, then the recipient's mail provider |
| Patient data in it | Recipient identifier; the PDF contains the bill or the clinical document. The **message body names the password scheme, never the value** (FR-E4-08) | Same |
| Controller instrument | **Unknown — same gap shape as G1/G2** | **Unknown** |

### What contains this today

- The attachment is **AES-256 encrypted before it leaves the system** (D-027),
  so the transport carries ciphertext plus a scheme hint. That is the right
  control for misdelivery — a mistyped digit — and explicitly **not** a
  control against a determined attacker, because the default password is the
  patient's date of birth and that is not a secret.
- Delivery requires recorded **consent** (`P16-T24`) and a verified number,
  enforced in the service rather than the UI.
- `destination_masked` is the only destination the delivery row keeps; there
  is no column holding a full phone number or address to leak.
- Bucket URLs never ride in a message body (NFR-SEC-07): attachments are
  streamed server-side, and link delivery sends a tokenised app URL that
  mints its presign only when redeemed.

### New gaps

- **G6 — WhatsApp is a processor and the privacy notice must say so.** Meta
  transports every WhatsApp message; a patient who consented to "receiving
  their bill" has not thereby been told which company carries it. **The
  privacy notice must name WhatsApp delivery before production enablement**,
  and the §10 pilot go/no-go treats this as a blocker.
- **G7 — no instrument with the SMTP relay** for the target deployment, same
  shape as G1.
- **G8 — the bridge image floats on `:latest`**
  ([F-3](renderer-isolation.md#f-3--the-whatsapp-bridge-image-floats-on-latest--medium)).
  A container that can send as the clinic should not change under a
  `docker compose pull` nobody reviewed.

G6 is the one that gates a pilot. G7 and G8 are backlog.

## 6. Legal mapping and gap list — OPEN

Blocked on a named compliance owner (ticket Prerequisites: hospital DPO, which
UU PDP requires for a health-data controller). The gaps below are the ones the
inventory already implies; each needs an owner and a date that this document
cannot assign:

- **G1 — no DPA with ❶.** Controller obligation under UU PDP; vendor is a
  processor. Unknown whether any instrument exists for the target deployment.
- **G2 — no DPA with ❷, and the processor was unlisted.** Strictly worse than G1
  because the ticket did not know this processor existed. `TOGETHER` is the
  shipped default, so a clinic reaches it by doing nothing.
- **G3 — cross-border transfer mechanism (Art. 55–56).** Every non-`OLLAMA`
  default base URL in §2 is hosted outside Indonesia; `api.together.xyz` is too.
- **G4 — patient-facing disclosure.** A disclaimer mechanism exists and is
  structural — every assistant turn persists `disclaimerShown: true` and the
  text rides in the response `meta`, never in the content
  ([ai-chatbot.service.ts:414](../../apps/api/src/modules/ai-chatbot/service/ai-chatbot.service.ts:414)),
  so there is a proven place to route disclosure text into. The text itself is
  not drafted, and drafting it is a legal act, not an engineering one.
- **G5 — retention at the vendor is unbounded from HMS's side.** HMS retains
  everything transmitted (the `SYSTEM` turns of §3.2), which is good for audit
  and means a vendor-side deletion request has a precise manifest to work from.
  Nothing enforces a vendor-side limit.

## 7. Minimization follow-ups (ticket §4)

Filed in the Security Backlog. Each carries the reasoning below plus the
tradeoff it is trading against, because two of the four have a legitimate
"keep it, documented" outcome:

| Ticket | What | Priority |
|---|---|---|
| **SJ-27** | Remove the hosted embedder from DPA scope | High |
| **SJ-28** | Stop sending the patient's legal name to ❶ | Medium |
| **SJ-29** | Drop the doctor's name from the patient appointment context | Medium |
| **SJ-30** | Title sessions locally instead of with a second vendor call | Low |

- **SJ-27 — question text to ❷.** Not fixable by redaction (see §4): a redacted
  question retrieves the wrong passages, so there is no sanitisation step to
  add. The only real mitigation is `EMBEDDING_PROVIDER=OLLAMA`, which removes
  the processor entirely — which is what D-EMB-01 recorded the tradeoff for.
  **Time-sensitive**: a one-variable change today, a migration and full
  re-ingest once any corpus exists.
- **SJ-28 — `displayName` in the patient channel.** The only direct identifier
  crossing to ❶ under default-off enrichment. The model needs to address the
  user; it does not need their legal name. (The doctor channel already made
  this trade —
  [chat-context-enrichment.service.ts:118](../../apps/api/src/modules/ai-chatbot/service/chat-context-enrichment.service.ts:118).)
- **SJ-29 — `doctorName` in `nextAppointment`.** Second identifier, about a
  third party rather than the asking user. Genuinely a judgement call: it is
  also the most useful field in the object, and `redactChatContext` will not
  catch it — no forbidden fragment matches — so it is a projection change.
- **SJ-30 — the title call (§3.1 row 7).** Transmits no *new* data, so this is
  not a disclosure fix; it removes one round trip from the retention
  conversation. The local heuristic already exists as the fallback path
  (`normalizeChatSessionTitle`), at the cost of blunter titles.

## 8. Go / no-go for production

Proposed, **not yet acknowledged by the project owner** (that acknowledgement is
an AC and needs a person):

> No production PHI reaches ❶ or ❷ until a signed DPA and a documented Art.
> 55–56 transfer mechanism exist for **each processor the deployment actually
> uses**, and the patient-facing disclosure (G4) is live.

Three facts make this condition cheap to hold today and expensive to hold later:

1. `AI_CHAT_ENABLED` defaults to `false`, and enrichment, tools, and retrieval
   each default off behind their own flag. A deployment that has not decided is
   already compliant by inaction.
2. Setting `EMBEDDING_PROVIDER=OLLAMA` removes ❷ from the DPA scope entirely.
   That is a one-variable decision — but it is a **migration and a re-ingest**
   after any corpus exists, so it is cheapest before go-live and gets steadily
   more expensive.
3. The condition is stated per *processor actually used*, not per vendor in §2's
   table. Reviewing seven chat kinds a deployment will never configure is how
   this review stalls.

## 9. The inventory is enforced, not just written

Everything above was produced by reading code, and a document produced by
reading is true only on the day it was written. The next field somebody folds
into a completion request is exactly the field this DPA does not cover, and
nothing would have failed.

`apps/api/src/modules/ai-chatbot/vendor-egress-contract.spec.ts` pins the
boundary as a test. It is deliberately **exhaustive rather than illustrative** —
it asserts complete key sets and complete message counts, because a presence
assertion (`expect(body).toHaveProperty('messages')`) passes unchanged when a
payload is added beside it. What it holds:

| Claim | How it is pinned |
|---|---|
| §3.1 — the OpenAI wire body is exactly `model`, `messages`, `max_tokens` | complete key-set equality |
| §3.1 — the Anthropic body adds only `system` | complete key-set equality |
| §3.1 — `sessionExternalId`, `channel`, `contextPayload` are dropped by both adapters | populated with canaries, asserted absent from the serialized body |
| §3.1 — the service sends exactly five input fields | complete key-set equality |
| §3.1 — four message sources, in documented order | exact role sequence of a maximal exchange |
| §3.3 — **no tool result ever crosses** | a canary field in tool output, asserted absent from every request; plus no `"role":"tool"` |
| §3.3 — stored `SYSTEM` turns are not replayed | canary in an earlier turn, asserted absent |
| §3.1 row 7 — the title call carries only the two excerpts | exact argument equality |
| §4 — the embedding body is exactly `model` and `input`, question verbatim | complete key-set equality |
| §3.2 — the redaction denylist still strips every identifier class | one payload per forbidden fragment |

The suite was mutation-checked: folding `contextPayload` onto the OpenAI wire
body as a `metadata` field fails two of these tests. A test that cannot fail is
not a control.

**A failure here is not necessarily a bug.** It means the boundary moved, and
§3, §4 and the gap list in §6 need re-reading before the change ships. That is
the whole point — the Mode B tripwire in particular is the one that converts
"someone implemented `AI_CHAT_TOOL_RESULT_TO_PROVIDER` and forgot the DPA" from
an invisible event into a red build.

This does **not** replace the ticket's Verification step. The contract proves
the code sends what this document says; only a captured payload from a running
deployment proves the document did not miss a path entirely.

## 10. Draft patient-facing disclosure — NOT LEGALLY REVIEWED

G4 needs text. This is a **drafting starting point for the compliance owner, not
approved copy**, and it is deliberately not wired into
`AI_CHAT_DISCLAIMERS` — routing unreviewed text about data processing into what
patients actually see would be worse than shipping nothing.

The mechanism it should route into is proven and described in §6 G4: per-channel
strings returned in the response envelope's `meta`, with `disclaimerShown`
persisted per turn.

> **Indonesian.** Asisten ini menggunakan layanan kecerdasan buatan pihak
> ketiga. Pertanyaan yang Anda tulis, dan ringkasan data janji temu serta nomor
> antrean Anda, dikirim ke penyedia layanan tersebut untuk menghasilkan jawaban.
> Rekam medis, hasil diagnosis, resep, NIK, dan nomor BPJS Anda **tidak** ikut
> dikirim. Jangan menuliskan informasi yang tidak ingin Anda bagikan kepada
> pihak ketiga.
>
> **English.** This assistant uses a third-party artificial-intelligence
> service. The questions you write, along with a summary of your appointment and
> queue number, are sent to that provider to produce an answer. Your medical
> records, diagnoses, prescriptions, national identity number, and BPJS number
> are **not** sent. Please do not type information you would not want shared
> with a third party.

Four things the compliance owner has to decide, which engineering cannot:

1. **Whether this is notice or consent.** The draft reads as notice. If UU PDP
   requires consent for this processing, the disclaimer mechanism is the wrong
   surface entirely — consent needs a recorded affirmative act, not a line in a
   response envelope.
2. **Whether the vendor must be named.** The draft says "a third-party service".
   Naming it is more honest and becomes wrong the moment an admin changes the
   config — the disclaimer is static text and the chat vendor is a database row.
3. **The two-processor problem.** This draft describes ❶ only. With the hosted
   embedder (§4), the question also reaches a second company — and it does so
   even when every chat-side flag is off. Either the text covers both or the
   deployment sets `EMBEDDING_PROVIDER=OLLAMA`.
4. **Accuracy against the flags.** The middle sentence is true only with
   `AI_CHAT_CONTEXT_ENRICHMENT_ENABLED=true`. With it off the assistant sends no
   appointment or queue data at all, and claiming otherwise is its own kind of
   wrong. Text that is accurate under every flag combination, or text per
   configuration — another decision this document cannot make.

## 11. What is done and what is not

**SJ-17 is closed for the inventory. The compliance half is SJ-31, which owns
the production go-live gate.** Read that split before treating this document as
permission to ship: what is finished is the *evidence*, not any signature.
There is no DPA with either processor, no documented Art. 55–56 transfer
mechanism, and the §8 condition has never been acknowledged.

| AC | State | Owner |
|---|---|---|
| Field-level data-flow inventory + diagram | **done** — §2, §3, §4, held by the contract test in §9 | SJ-17 |
| Minimization tickets filed | **done** — SJ-27, SJ-28, SJ-29, SJ-30 (§7) | SJ-17 |
| Vendor training/retention/region posture with sources | **open** — §5, needs deployment access | **SJ-31** |
| Gap list reviewed with compliance owner, owners + dates | **open** — G1–G5 named in §6, unowned | **SJ-31** |
| Patient-facing disclosure text reviewed and routed | **open** — draft in §10, deliberately not routed | **SJ-31** |
| Go/no-go acknowledged by the project owner | **open** — §8 proposed | **SJ-31** |

SJ-31 is filed **Blocked**: all four of its criteria need a named compliance
owner (a DPO, which UU PDP requires for a health-data controller) and access to
the target deployment to read the active `AiProviderConfig` row. Neither exists
yet, and pretending otherwise is how a go-live gate quietly stops being one.

Worth resolving SJ-27 first regardless. It closes gap G2 by *deletion* rather
than by signature — removing the second processor entirely instead of
negotiating an agreement with it — and it is a one-variable change today
against a migration and full re-ingest once a corpus exists.

The ticket's Verification — walkthrough with the compliance owner, and a
spot-check of this inventory against a captured dev vendor payload using
synthetic data — has **not** been run. The spot-check is worth doing
independently of the legal track: it is the only step that would catch a field
this inventory missed by reading rather than observing.
