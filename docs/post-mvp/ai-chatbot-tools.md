# AI Assistant Grounding — Tools, Retrieval, and Memory (Phase 15)

Companion to [ai-chatbot.md](./ai-chatbot.md) and the [readiness review](./ai-chatbot-readiness.md). Phase 13 shipped a chatbot that can only answer from the conversation plus a fixed six-field context projection. This document defines how it stops being a general-purpose language model with a clinic logo on it.

Three capabilities, deliberately separated because they answer different questions and carry different risk:

| Capability | Answers | Personal data | Section |
| ---------- | ------- | ------------- | ------- |
| **Tools** | "What is true in my database right now?" | Yes — scoped to the caller | §2–§4 |
| **Retrieval** | "What is true about this clinic's policies?" | **No** — clinic documents only | §5 |
| **Memory** | "What happened earlier, and who am I?" | Mostly already solved | §6 |

None of them substitutes for another, and none is allowed to give up the property that makes the current design defensible under UU PDP: **HMS knows exactly what leaves the building before it leaves.**

**Placement:** after `P13-T11`. Requires `AI_CHAT_ENABLED` to have run in staging long enough to produce `safetyTags` evidence (readiness §5).

## 1. What changes, and what must not

Today the request body sent to any provider is exactly `{ model, messages, max_tokens }`. There is no `tools` field anywhere in the wire layer, so the model has no channel back into HMS. Enrichment is a single payload computed *before* the call, passed through a denylist, and persisted verbatim as a `SYSTEM` turn. That persisted turn is the UU PDP record of processing: *what personal data went to which processor, when, for whom.*

A tool loop inverts the ordering. The model decides mid-conversation what to fetch, so the payload cannot be computed in advance. Everything below exists to restore the guarantee under the new ordering — not to work around it.

**Three invariants that survive unchanged:**

1. Every byte sent to the processor is recorded in the transcript before it is sent.
2. Authorization is the same authorization the REST API uses, evaluated as the asking user. A tool is never a second door into data the caller could not fetch over HTTP.
3. Read-only over clinic data. No tool mutates anything, in this phase or by accident. The single exception is a user's own typed preferences (§6.2), which are not clinic data and are erasable by their subject.

## 2. Scope

### 2.1 In scope (v1 tools)

Doctor channel only. The patient channel gets no tools until the pattern-guard evidence from readiness §2 is in.

| Tool | Backing service | Permission it inherits | Personal data? |
| ---- | --------------- | ---------------------- | -------------- |
| `list_my_patients` | `PatientManagementService` | `patient.read:own` | Yes — assigned patients only |
| `get_patient_summary` | `PatientManagementService` | `patient.read:own` | Yes — one assigned patient |
| `list_my_appointments` | `AppointmentManagementService` | `appointment.read:own` | Yes — names in slots |
| `check_medication_stock` | `PharmacyFlowService.getInventorySummary` | `medication.read:any` | **No** |
| `check_medication_expiry` | `PharmacyFlowService.getExpiryReport` | `medication.read:any` | **No** |

### 2.2 Explicitly out of scope

- **Any write.** No prescribing, no booking, no EMR entry. Unchanged from `ai-chatbot.md` §2.2.
- **Free-text clinical notes.** `encounter.read:own` exists and a doctor may read their own encounters over HTTP — but shipping SOAP narrative to a foreign processor is a different risk class from shipping a count, and it is the one thing here that could not be defended as minimal. See §8, and §5.1 for why retrieval does not change the answer.
- **Patient channel tools.** A patient asking "what room is Budi in" must get the same denial the REST API gives them; the cheapest way to guarantee that is to give the channel no tools at all.
- **Room availability.** See §3.

### 2.3 Required change: the doctor-channel output guard

**Decided.** `SafetyPolicyService.evaluateOutput` runs on both channels and, on a `diagnosisAssertion` match, **discards the entire assistant reply** and substitutes refusal copy. The doctor variant is politely worded — "rely on your own clinical judgement" — but the answer is still thrown away.

That is survivable while the assistant only knows clinic hours. It becomes the primary obstacle the moment tools land, because the patterns match replies that discuss a *specific patient*, which is precisely what a tool-equipped doctor channel exists to do. A doctor asking "summarize Budi's next appointment and whether we have his medication in stock" can lose the whole reply — stock lookup included — because one clause tripped the pattern. The more useful the tools make it, the more often it refuses.

For the **doctor channel only**, a diagnosis match now:

- still records `diagnosis_attempt` in `safetyTags` — the readiness-review evidence trail is unchanged, and the counts stay comparable across releases;
- **appends** a clinical-judgement notice instead of replacing the reply.

Unchanged: the prescription/dosing guard still replaces the reply on both channels, and the **patient channel is untouched in every respect**. The rationale is the one the readiness review already states — the no-diagnosis rule exists to keep unlicensed medical advice away from a layperson, and a licensed clinician is not a layperson. Detection stays; the punishment changes.

This contradicts `ai-chatbot.md` §2.2, which lists "diagnosis or differential diagnosis" as globally out of scope. **That section must be amended in the same PR** — the constraint becomes patient-channel, and the doctor channel's constraint becomes "will not replace clinical judgement", which is what the appended notice says.

## 3. Rooms do not exist yet

There is no `Room`, `Bed`, or `Ward` model in `schema.prisma`. Room availability is not a tool that is missing — it is a domain that has never been built. Nothing reads it, nothing writes it, and the appointment module schedules against practice sessions and a clinic timezone, not physical rooms.

So "which rooms are free" needs, in order: a data model, a module that owns occupancy, a REST surface with its own RBAC, and only then a tool wrapping it. That is a separate phase, sized like `pharmacy-flow`, not a line item here.

**Decided: dropped, and not replaced by a partial version.** The MVP scope is outpatient, and a room tool implies bed and occupancy management the rest of the product does not have. A static room list was considered and rejected — it could name the rooms that exist but never say whether one is free, which answers the asked question wrongly rather than not at all. Revisit only if inpatient becomes a real requirement, and then as a domain, not as a tool.

## 4. Architecture

### 4.1 The authorization rule that makes this safe

**Every tool calls the existing domain service, passing the asking doctor's own `CurrentUser`.** It does not touch a repository, does not use a service account, and does not build its own query.

This is the whole design in one sentence. `patient.read:own` for `DOCTOR` already resolves through the `DoctorPatient` assignment table inside `PatientManagementService`; a tool that calls that service with that user inherits the scoping for free and cannot drift from it. If a doctor asks about a patient who is not theirs, the service returns not-found exactly as it does over HTTP — the model cannot widen its own access, because the model never gets to express a query, only arguments to a call that was already authorized.

Corollary: **no new permissions are seeded.** A tool the caller lacks permission for is not offered to the model in the first place (the tool list is built per request from the caller's ability), and is refused again at dispatch if it somehow is.

### 4.2 Module layout

```
modules/ai-chatbot/
  tools/
    chat-tool.interface.ts          # name, description, args schema, execute(actor, args)
    chat-tool.registry.ts           # ability-filtered tool list per request
    definitions/
      list-my-patients.tool.ts
      get-patient-summary.tool.ts
      list-my-appointments.tool.ts
      check-medication-stock.tool.ts
      check-medication-expiry.tool.ts
    project-tool-result.ts          # per-tool allowlist — see §4.3
```

Argument schemas are Zod, in `packages/shared-types/src/ai-chatbot/`, and are the *same* objects serialized into the provider's `tools` array — one definition, no drift between what the model is told and what is validated on return.

### 4.3 Why the context denylist cannot be reused

`redactChatContext` is the wrong instrument here, and reaching for it would quietly break two of the five tools:

- It **drops every array** (`redact-chat-context.ts:48`). `list_my_patients` and `list_my_appointments` are arrays by definition, so both would return an empty payload and the assistant would confidently report that the doctor has no patients.
- It forbids any key containing `patientid`, `doctorid`, or `userid`, so a list could carry no stable handle for `get_patient_summary` to reference on the next call.
- Its fragments (`note`, `diagnos`, `allerg`, `prescription`) are blanket bans appropriate to a fixed context blob, not to a result whose legitimate shape varies per tool.

None of that is a fault in the redactor — it was built for one known payload and does that job well. It is the wrong shape for many payloads whose fields differ.

**Tools use an allowlist instead, and build up rather than filter down.** Each tool declares the exact fields its result may contain, as a Zod output schema; the tool constructs that object from the service response and the result is validated against it before transmission. A field nobody listed cannot appear, so a future edit to a domain service that adds `nik` to a projection cannot leak it — the tool would simply not copy it.

This is strictly stronger than a denylist: a denylist fails open on anything it did not anticipate, an allowlist fails closed. `redactChatContext` stays where it is, guarding the §5.3 context payload.

### 4.4 The dispatch loop

`AiChatbotService` gains a bounded loop:

1. Build the tool list from the caller's ability. Empty list → today's behaviour exactly, no `tools` field on the wire.
2. Send. If the reply is a tool call, validate arguments against the Zod schema (a hallucinated argument fails here, not in a repository).
3. Execute as the asking user, then project the response through the tool's output allowlist (§4.3).
4. Persist a `SYSTEM` turn — tool name, validated arguments, projected result — **before** that result goes back to the provider, then append and loop.
5. Cap at **3 tool calls per user message.** Beyond that, answer from what was gathered.

The cap is not a performance guard. It is what stops a prompt injection buried in a data field from driving an unbounded fetch loop.

### 4.5 Wire support

Both adapters need it, and they differ:

- `OpenAiCompatibleAdapter` — `tools` array, `tool_calls` on the response message, `role: 'tool'` results. Covers six of the seven kinds.
- `AnthropicAdapter` — `tools` with `input_schema`, `tool_use` / `tool_result` content blocks.

Both normalize to one HMS-side shape, so `AiChatbotService` stays vendor-blind — same contract as `SendChatCompletionResult` today. Note that a router (`OPENAI_COMPATIBLE`) may silently fall back to a backend that does not support tool calling; treat a reply that ignores `tools` as a plain answer rather than an error.

## 5. Retrieval (RAG)

### 5.1 Two corpora, and only one of them is cheap

"RAG" covers two things with completely different risk profiles, and conflating them is how this goes wrong.

**A. Clinic knowledge — recommended, this phase.** SOPs, FAQ, service and price lists, BPJS process explanations, referral procedures, licensed clinical guidelines. **Contains no personal data**, so it adds no UU PDP exposure at all, and it serves both channels.

This is also the direct fix for the actual complaint: `ai-chatbot.md` §2.1 already promises "clinic operations FAQ" and "clinical reference search" as in-scope — but *no corpus exists behind those promises*, so today the model answers from its training data. That is precisely the "plain LLM returning messages from the internet" problem. Tools ground the assistant in what is **true in the database**; retrieval grounds it in what is **true about this clinic's policies**. Neither substitutes for the other.

**B. Patient records — deferred.** Embedding encounter notes for semantic search over a patient's history. This is `encounter.read:own` wearing a different hat, and §8 already declined it. Retrieval makes it *worse*, not better: a tool sends one note when asked, whereas indexing sends the **entire note corpus, proactively, at index time**, before anyone has asked anything. That inverts the invariant this whole design rests on.

If B is ever built, it is only defensible with **local embeddings** — the vectors and the source text never leave HMS, and only a small retrieved chunk reaches the provider. You already run Ollama as a supported provider kind, so that path exists. But it remains the clinical-notes decision, and it should be taken as that decision, not as a retrieval feature.

### 5.2 Vectors from the start — the corpus is bilingual

**Decided: pgvector, day one.** An earlier draft of this document recommended starting with Postgres full-text search and adding vectors only when measurement justified them. That recommendation is withdrawn, and the reason is recorded here so the reversal is auditable rather than mysterious.

The corpus is **Indonesian and English**. A clinic holds SOPs and patient-facing FAQ in Indonesian and licensed clinical guidelines in English, and users ask in either language regardless of which language the answer lives in.

`tsvector` cannot bridge that, and no amount of tuning changes it. It matches lexemes: "chest pain" and "nyeri dada" share none. A doctor asking an English question will never retrieve the Indonesian SOP that answers it, and a patient asking in Indonesian will never reach the English guideline. This is not a ranking weakness to be measured and improved — it is a structural inability, and it would have been discovered at the first evaluation run after building the wrong thing.

A multilingual embedding model handles it natively: the Indonesian question and the English passage land near each other in the same vector space, because that is what the model was trained to do.

**The four adoption triggers from the earlier draft still apply — to the second and later corpora.** Trigger 1 (cross-lingual) fires now. Triggers 2–4 (paraphrase gap, production zero-hit rate, corpus size) remain the right instruments for judging *retrieval quality over time*, and `P15-T12` still measures them. They just no longer gate the initial decision.

### 5.3 Hybrid, not vector-only

Committing to vectors does **not** mean skipping full-text search. Both get built, and the rankings are fused (reciprocal rank fusion).

Vectors are weak exactly where this domain is strong-willed: **exact identifiers**. Drug names and strengths, BPJS terminology, ICD-10 and ICD-9-CM codes, clinic-specific procedure names. A doctor asking about "Amoxicillin 500mg" wants lexical precision, and embedding similarity will happily return a passage about a different antibiotic because it is semantically adjacent. Keyword matching does not make that mistake.

So each retrieval mode covers the other's failure:

- **Vector** — cross-lingual matching, paraphrase, conceptual questions.
- **Full-text** (`tsvector`, with both Indonesian and English configurations) — drug names, codes, exact terminology, proper nouns.

Both are cheap in Postgres: a generated `tsvector` column with a GIN index, a `vector` column with an HNSW index, and a fusion step of roughly twenty lines. Building both at once is materially less work than building one, tuning it, and retrofitting the other — which means tuning ranking twice.

### 5.4 Embedding provider: local

**Decided: local embeddings via Ollama.** Two independent reasons, either sufficient.

**Cross-lingual quality.** The model must handle Indonesian and English in one shared space. `bge-m3` is the strongest general option here (explicitly multilingual, 1024 dimensions, trained for cross-lingual retrieval); `multilingual-e5-large` is a reasonable alternative at the same dimensionality. **`nomic-embed-text` is not suitable** — it is primarily English, and an earlier draft of this document listed it carelessly alongside `bge-m3`. Indonesian recall is the whole point; the model choice is not interchangeable.

**The second-processor problem.** A cloud embedding API carries no personal data at *index* time — the corpus is policies, not patients. The query side is where it bites: **every user question would be sent to the embedding vendor**, including a patient typing "saya sakit dada sejak kemarin". That is not new exposure, since the question already goes to the LLM provider — but it is a **second processor**, meaning a second DPA, a second retention policy, and a second entry in the record of processing. Considerable paperwork for a ranking improvement.

Local embeddings avoid it entirely: vectors and queries never leave HMS, there is no per-query cost, and it is the *only* configuration in which patient-record retrieval (§5.1 B) could ever be revisited. Choosing local keeps that door open at no cost; choosing cloud closes it quietly.

Operationally: Ollama is already a supported provider kind, so the runtime dependency is not new. Note that the embedding model is a **separate concern from the chat provider** — a clinic may run Gemini for chat and Ollama purely for embeddings, so this is a distinct configuration, not a reuse of `AiProviderConfig`'s active row.

**Consequences that must be designed in, not discovered:**

- `pgvector/pgvector:pg16` in **both** `docker-compose.dev.yml` and `.github/workflows/ci.yml` — today both run `postgres:16-alpine` with no pgvector, and CI would fail on the `CREATE EXTENSION` migration. Production Postgres must permit the extension too.
- Vector dimension is fixed in the column type by the chosen model (1024 for `bge-m3`). Changing model later is a schema change, not a config change.
- `embeddingModel` and `embeddingVersion` columns on every chunk, plus a reindex path. Without them, swapping models silently mixes incompatible vectors and degrades retrieval with no error — the worst possible failure mode, because it looks like the feature simply got worse.
- Ollama must be reachable from the API container. In Docker that is `host.docker.internal`, the same trap documented for chat.

### 5.5 Shape

Retrieval is **not a tool the model calls.** It runs before the completion, like context enrichment: retrieve top-k chunks for the user's message, prepend them as a `SYSTEM` turn, persist that turn. Deterministic, one round trip, and the retrieved text is recorded before transmission exactly like everything else.

- `ClinicDocument` / `ClinicDocumentChunk` models, admin-managed (upload, replace, retire) behind `clinic-document.write:any`.
- Chunks carry a **visibility** column: `PATIENT`, `DOCTOR`, or `BOTH`. Staff-only SOPs must never surface in a patient answer, and channel filtering is the enforcement.
- Chunks carry a **language** tag (`ID` / `EN`). Retrieval is deliberately *not* filtered by it — cross-lingual matching is the entire point — but the tag drives citation display and makes evaluation coverage measurable per language.
- **The answer's language follows the question, not the source.** A doctor asking in English about an Indonesian SOP gets an English answer citing an Indonesian document; the system prompt states this explicitly, since a model handed Indonesian source text will otherwise drift into answering in Indonesian. The citation names the document's own language so the reader knows a translation happened.
- Answers cite which document they came from. A clinic FAQ answer with no citation is indistinguishable from a hallucination, and the citation is what makes it auditable.
- Retrieval failure is non-fatal: no chunks means the assistant answers as it does today.

## 6. Memory

### 6.1 Most of it already exists

`AiChatbotService` replays the last **20 turns** (`REPLAYED_HISTORY_TURN_LIMIT`), and deliberately excludes stored `SYSTEM` turns from the replay so old context payloads are not re-sent. In-session memory is done. Nothing to build.

### 6.2 What is actually missing

**Conversation compaction — worth building.** Past 20 turns, older exchanges vanish silently and the assistant contradicts things it said earlier in the same conversation. A rolling summary of dropped turns, stored on the session and replayed as one `SYSTEM` turn, fixes it. Bounded, no new personal-data surface beyond what the conversation already contains, and it stays within the session's own retention.

**Cross-session memory — narrow it hard.** "The assistant remembers me between conversations" is the request; a model-written store of free-text facts about users is the wrong implementation of it, and under UU PDP it is close to the worst possible shape: personal data collected with no stated purpose, no retention limit, no subject visibility, and written by something that hallucinates. If a doctor discusses a patient and the model durably "remembers" clinical details, you have built a shadow EMR outside the retention and audit regime that governs the real one.

The defensible version is the same fails-closed principle as tool results:

- **A typed allowlist of preference fields**, not free text: preferred language, preferred response length, default clinic location. New fields require a migration and a code change — the model can never invent one.
- **About the asking user only.** Never about a patient, never about a third party.
- **Model-proposed, never model-written.** The model may suggest a value; it is validated against the field's schema before persistence.
- **Visible and erasable by its subject**, which is what makes the UU PDP access and erasure rights answerable.

Anything richer than that is a product decision with a compliance bill attached, and it should be taken deliberately rather than arrived at by letting a `memories` table grow free-text rows.

## 7. UU PDP position

The question a regulator asks is not "did you have a tool" but *what personal data reached which processor, on what basis, and can you show it.*

| Requirement | How it is met |
| ----------- | ------------- |
| Lawful basis / purpose limitation | Doctor channel only; the doctor already has lawful access to these records for care delivery. A tool changes the interface, not the entitlement. |
| Minimization | Tool results are **projections, not records**, enforced by a per-tool allowlist (§4.3) that fails closed. `get_patient_summary` returns display name, age band, assignment status, next appointment — never MRN, NIK, BPJS number, address, or notes. List tools carry a page cap so "list my patients" cannot become a bulk export. Identifiers already have their own door: `getPatientIdentifiers` requires `patient.read-identifier`, audits every disclosure by field name, and **no tool may call it** — an identifier reaching a foreign processor would be an unauditable disclosure by construction. |
| Record of processing | Every tool call persists a `SYSTEM` turn with the exact redacted payload **before** it is transmitted. Same mechanism, same 25-year retention as today. |
| Data subject rights | Unchanged — the transcript is already the authoritative record; tool turns join it. |
| Processor transparency | Unchanged, with one caveat: behind a router the recorded `providerKind` is the router, not the eventual backend. That was already true and matters more once real patient data is in play. |
| Retrieval (§5) | Clinic documents carry no personal data, so retrieval adds **no exposure**. Retrieved chunks are persisted as a `SYSTEM` turn before transmission like any other context. Patient-record retrieval is deferred (§5.1). |
| Memory (§6) | Cross-session memory is a typed allowlist of preference fields about the asking user, never free text and never about a patient — so the retention, access, and erasure questions have concrete answers instead of "whatever the model wrote". |

**The honest risk this adds.** Today, with enrichment off, *no patient data leaves HMS at all*. Tools end that: a doctor asking about their patient sends that patient's name to a foreign processor. That is a policy decision, not a technical one, and it belongs in the same conversation as the readiness §5 production conditions — a signed DPA is not optional once this ships. A vendor without one is fine for a chatbot answering clinic hours and not fine for one that reads patient names.

**Recommended enablement:** a third flag, `AI_CHAT_TOOLS_ENABLED`, default off, independent of `AI_CHAT_CONTEXT_ENRICHMENT_ENABLED`. Ship the two pharmacy tools first — they touch **no personal data whatsoever**, so they prove the entire loop (wire, dispatch, transcript, cap) with zero UU PDP exposure. Add the patient tools only after that has run in staging.

## 8. Deliberate omission: clinical notes

`encounter.read:own` is granted to `DOCTOR` and the module exists, so a `get_encounter_notes` tool is a small change. It is left out on purpose.

A count or a name is a fact about a patient. A SOAP note is the clinical narrative — the most sensitive category the system holds, and the hardest to argue is minimal when the alternative is that the doctor opens the encounter screen they already have. If it is ever added it should be its own task, its own flag, and its own decision record, not a sixth entry in a table.

## 9. Delivery tasks

Branch naming `feature/p15-t<task>-<short-desc>`.

1. `P15-T01` Doctor-channel output guard (§2.3): tag without replacing on a diagnosis match, prescription guard and patient channel unchanged, `ai-chatbot.md` §2.2 amended in the same PR. **Independent of everything below** — it can ship first and stands on its own, because the current behaviour is already the weakest part of the doctor channel.
2. `P15-T02` Tool interface, registry, ability filtering, Zod arg schemas in shared-types. No wire changes; unit tests prove an unpermitted tool is never offered and never dispatched.
3. `P15-T03` Adapter tool support (both adapters) + normalized HMS shape. Wire-shape specs per vendor.
4. `P15-T04` Dispatch loop in `AiChatbotService`: argument validation, call cap, `SYSTEM` turn per call, projection before transmit. Quota accounting for tool calls lands **here, not later** — the loop must never exist without it, since one message can otherwise cost four upstream round-trips.
5. `P15-T05` The two pharmacy tools + `AI_CHAT_TOOLS_ENABLED` (default off). No personal data — the loop proven end to end at zero UU PDP exposure.
6. `P15-T06` The three patient tools, output allowlists defined field by field, specs asserting MRN/NIK/BPJS/notes cannot appear even when the backing service starts returning them.
7. `P15-T07` Circuit-breaker and timeout behaviour under a multi-call turn; cost/latency measurement of a worst-case four-round-trip message.
8. `P15-T08` Frontend: tool-call turns rendered as what the assistant looked up, not hidden — a doctor should see that "3 patients assigned" came from a lookup and not from the model's imagination.

**Retrieval (§5) — independent of the tool track, and shippable in parallel:**

9. `P15-T09` **Infrastructure first**: `pgvector/pgvector:pg16` in `docker-compose.dev.yml` and `.github/workflows/ci.yml`, production Postgres extension confirmed, `CREATE EXTENSION vector` migration. This blocks `T10`–`T12` and is the task most likely to surface an environment surprise — do it before writing retrieval code, not alongside it.
10. `P15-T10` `ClinicDocument` / `ClinicDocumentChunk` schema with channel visibility, language tag, `embeddingModel` / `embeddingVersion`, vector + `tsvector` columns; admin CRUD behind `clinic-document.write:any`; chunking and embedding on ingest via Ollama (`bge-m3`).
11. `P15-T11` Hybrid retrieval (§5.3): vector + full-text, fused with RRF, channel-filtered, prepended as a `SYSTEM` turn in the completion path, citations in the reply, answer-language-follows-question, non-fatal on miss.
12. `P15-T12` Retrieval evaluation: a fixed question set with expected documents, scored — and **explicitly including cross-lingual pairs in both directions** (Indonesian question → English document, and the reverse). Those pairs are the reason vectors were chosen; if they are not tested, the decision is unverified. Also establishes the ongoing recall baseline that triggers 2–4 in §5.2 are judged against.

**Memory (§6):**

13. `P15-T13` Conversation compaction: rolling summary of turns dropped past the 20-turn replay window, stored per session, replayed as one `SYSTEM` turn.
14. `P15-T14` Typed cross-session preferences (language, response length, default location) — migration-defined fields only, about the asking user only, user-visible and user-erasable.

**Gate:**

15. `P15-T15` Readiness review, in the shape of `P13-T11`: injection-through-tool-result *and* injection-through-retrieved-document cases, an attempt to reach another doctor's patient, a staff-only SOP chunk proven unreachable from the patient channel, transcript completeness, the diagnosis-tag rate before and after `P15-T01`, and the DPA condition restated.

## 10. Definition of Done

- A doctor can ask "which of my patients have appointments today" and "do we have amoxicillin in stock" and get answers grounded in HMS data.
- A doctor asking about a patient who is not theirs gets the same not-found the REST API gives, and the attempt is visible in the transcript.
- A doctor's reply is no longer discarded for discussing a patient clinically, and `diagnosis_attempt` is still counted on every such turn.
- No tool exists that writes.
- Every provider-bound byte from a tool appears in `chat_messages` first.
- A tool result can contain only fields its own allowlist names, proven by a spec where the backing service returns an identifier and it does not survive.
- A clinic-policy question is answered from the clinic's own documents, with a citation, rather than from the model's training data.
- **An Indonesian question retrieves the English document that answers it, and is answered in Indonesian** — and the reverse. This is the acceptance test for the whole retrieval track.
- An exact drug name or ICD code retrieves the right passage, proving the full-text half of the hybrid still earns its place.
- A staff-only document chunk cannot appear in a patient-channel answer.
- A conversation past 20 turns does not contradict its own earlier answers.
- Cross-session memory holds only migration-defined fields about the asking user, and its subject can see and erase it.
- Every flag off (`AI_CHAT_TOOLS_ENABLED`, retrieval, memory) reproduces Phase 13 behaviour exactly, including no `tools` field on the wire.

## 11. Related Documents

- [implementation-plan.md](./implementation-plan.md) §10 — Phase 15 sequencing and the rules that gate each track
- [ai-chatbot.md](./ai-chatbot.md) — Phase 13 scope, safety policy, provider gateway. **§2.2 is amended by §2.3 of this document.**
- [ai-chatbot-readiness.md](./ai-chatbot-readiness.md) — enablement conditions this phase inherits, including the signed-DPA gate that `P15-T06` makes load-bearing
- [rbac.md](../MVP/rbac.md) — permission and scope model the tools reuse
- [database.md](../MVP/database.md) — schema conventions the new document/chunk models follow
