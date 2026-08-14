# External AI processors: what crosses, to whom, under what instrument

**SJ-17.** A field-level record of every payload that leaves the HMS boundary
for an external AI vendor, so the UU PDP No. 27/2022 question — *which
processors receive personal data, and under what agreement* — has an answer
drawn from the code rather than from the architecture diagram.

This document is deliverable #1 of the ticket (the inventory) plus the parts of
#5 (the decision record) that can be written without a counterparty. The vendor
posture review (§4) and the legal gap list (§5) are **open** and say so
explicitly: they need the deployment's actual vendor and a named compliance
owner, and inventing either would make this document worse than absent.

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

Candidates the inventory surfaced. Filing these as backlog tickets is an AC of
SJ-17 and has not been done:

- **M1 — `displayName` in the patient channel.** The only direct identifier
  crossing to ❶ under default-off enrichment. The model needs to address the
  user; it does not need their legal name. A greeting name or role label would
  do. (The doctor channel already made this trade —
  [chat-context-enrichment.service.ts:118](../../apps/api/src/modules/ai-chatbot/service/chat-context-enrichment.service.ts:118).)
- **M2 — `doctorName` in `nextAppointment`.** Second identifier, about a third
  party rather than the asking user.
- **M3 — the title call (§3.1 row 7).** A local heuristic already exists as the
  fallback path (`normalizeChatSessionTitle`). Making it the default would
  remove one vendor round trip per session at the cost of blunter titles.
- **M4 — question text to ❷.** Not fixable by redaction (see §4). The real
  mitigation is `EMBEDDING_PROVIDER=OLLAMA`, which removes the processor
  entirely — which is what D-EMB-01 recorded the tradeoff for.

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

## 9. What is done and what is not

| AC | State |
|---|---|
| Field-level data-flow inventory + diagram | **done** — §2, §3, §4 |
| Vendor training/retention/region posture with sources | **open** — §5, needs deployment access |
| Gap list reviewed with compliance owner, owners + dates | **partial** — gaps named in §6, unowned and unreviewed |
| Patient-facing disclosure text drafted and routed | **open** — mechanism verified, text not drafted (G4) |
| Minimization tickets filed | **open** — candidates in §7, not filed |
| Go/no-go recorded and acknowledged | **partial** — §8 proposed, unacknowledged |

The ticket's Verification — walkthrough with the compliance owner, and a
spot-check of this inventory against a captured dev vendor payload using
synthetic data — has **not** been run. The spot-check is worth doing
independently of the legal track: it is the only step that would catch a field
this inventory missed by reading rather than observing.
