# AI Assistant Grounding — Tools, Retrieval, and Memory (Phase 15)

Companion to [ai-chatbot.md](./ai-chatbot.md) and the [readiness review](./ai-chatbot-readiness.md). Phase 13 shipped a chatbot that can only answer from the conversation plus a fixed six-field context projection. This document defines how it stops being a general-purpose language model with a clinic logo on it.

Three capabilities, deliberately separated because they answer different questions and carry different risk:

| Capability | Answers | Personal data | Section |
| ---------- | ------- | ------------- | ------- |
| **Tools** | "What is true in my database right now?" | Reaches the caller; reaches the **provider** only in the opt-in mode of §4.4 | §2–§4 |
| **Retrieval** | "What is true about this clinic's policies?" | **No** — clinic documents only | §5 |
| **Memory** | "What happened earlier, and who am I?" | Mostly already solved | §6 |

None of them substitutes for another, and none is allowed to give up the property that makes the current design defensible under UU PDP: **HMS knows exactly what leaves the building before it leaves.**

**Placement:** after `P13-T11`. Requires `AI_CHAT_ENABLED` to have run in staging long enough to produce `safetyTags` evidence (readiness §5).

## 1. What changes, and what must not

Today the request body sent to any provider is exactly `{ model, messages, max_tokens }`. There is no `tools` field anywhere in the wire layer, so the model has no channel back into HMS. Enrichment is a single payload computed *before* the call, passed through a denylist, and persisted verbatim as a `SYSTEM` turn. That persisted turn is the UU PDP record of processing: *what personal data went to which processor, when, for whom.*

A tool loop inverts the ordering. The model decides mid-conversation what to fetch, so the payload cannot be computed in advance. Everything below exists to restore the guarantee under the new ordering — not to work around it.

**Four invariants:**

1. Every byte sent to the processor is recorded in the transcript before it is sent.
2. Authorization is the same authorization the REST API uses, evaluated as the asking user. A tool is never a second door into data the caller could not fetch over HTTP.
3. Read-only over clinic data. No tool mutates anything, in this phase or by accident. The single exception is a user's own typed preferences (§6.2), which are not clinic data and are erasable by their subject.
4. **A tool result does not go back to the provider unless a clinic has explicitly opted in.** By default the model chooses *which* lookup to run; HMS runs it and renders the answer. The model never sees the rows. See §4.4.

The fourth is new to this document and it is the one that decides the compliance position. The first three make the transfer *auditable and minimal*; the fourth makes it **not happen**. Sections §4.4 and §7 carry the consequences.

## 2. Scope

### 2.1 In scope (v1 tools)

Two channels get tools; the patient channel gets none until the pattern-guard evidence from readiness §2 is in.

#### 2.1.1 Doctor channel

Every entry's permission column is a **requirement including its scope**, enforced per §4.1.1 — not a description of who happens to hold it.

| Tool | Backing service | Required permission | Personal data? |
| ---- | --------------- | ------------------- | -------------- |
| `list_my_patients` | `PatientManagementService` | `patient.read` scope **`OWN`** | Yes — assigned patients only |
| `get_patient_summary` | `PatientManagementService` | `patient.read` scope **`OWN`** | Yes — one assigned patient |
| `list_my_appointments` | `AppointmentManagementService` | `appointment.read` scope **`OWN`** | Yes — names in slots |
| `check_medication_stock` | `PharmacyFlowService.listMedications` | `medication.read:any` | **No** |
| `check_medication_expiry` | `PharmacyFlowService.getExpiryReport` | `inventory.read:any` | **No** |

**Both pharmacy rows were corrected when `P15-T05` implemented them, and the correction is the §4.1 rule doing its job rather than a typo fix.** The original table paired `getInventorySummary` with `medication.read:any`, but that service asserts `Inventory:read` — and `seed.sql` gives `DOCTOR` `medication.read:any` and **not** `inventory.read:any`. Written as drafted, a doctor would have been offered a tool the domain service then refuses.

The resolution keeps invariant 2 exact — a tool is the same door as the REST route, so it must be the route the caller's own grant opens:

- **Stock** moves to `PharmacyFlowService.listMedications`, which is what `medication.read:any` actually opens (`GET /api/v1/medications`) and which already carries `stockQty`, `reorderLevel`, and `needsReorder`. A doctor gets a real stock answer, and **no permission is seeded to make a tool work**.
- **Expiry** keeps `getExpiryReport` and declares the permission that service really requires. The consequence is deliberate: in a doctor-channel session the tool is **not offered** unless the caller genuinely holds `inventory.read:any` — a doctor who also holds `PHARMACIST` does, and the admin channel (§2.1.2) does. Fails closed, and the tool goes live there by ability rather than by edit.

#### 2.1.2 Admin channel — aggregates only

An admin runs the clinic and has a legitimate need to ask it questions: how busy is the queue, what came through the cash drawer, what is about to expire. That need is real and it is **almost entirely answerable without naming a single patient** — which makes the admin channel the cheapest useful tool surface in this document, not the most expensive.

The rule for this channel is one line: **a tool returns counts, totals, and status distributions. It never returns a row about an identified patient.** Where a backing service returns both, the tool's output allowlist (§4.3) keeps the aggregate and drops the roster — the same fails-closed instrument, pointed at a different question.

| Tool | Backing service | Required permission | Personal data? |
| ---- | --------------- | ------------------- | -------------- |
| `get_queue_board_summary` | `RegistrationFlowService.getQueueBoard` | `registration.read:any` | **No** — `counts` and `poli[]` only; `entries[]` dropped |
| `get_daily_cashier_report` | `CashierReportService.getDailyReport` | `invoice.read:any` | Staff names only — see below |
| `get_appointment_load` | `AppointmentManagementService.listSessionsCalendar` | `appointment.read:any` | **No** — per-session capacity and booked counts; no attendee rows |
| `check_medication_stock` | `PharmacyFlowService.listMedications` | `medication.read:any` | **No** — shared with the doctor channel |
| `check_medication_expiry` | `PharmacyFlowService.getExpiryReport` | `inventory.read:any` | **No** — shared with the doctor channel |

**`get_daily_cashier_report` is the one entry that is not free, and it should be labelled rather than waved through.** `CashierDailyReport` is `{ date, totals, byMethod, byDoctor }` — no patient appears, but `byDoctor` names practitioners. That is personal data about *staff*: `data pribadi umum` under UU PDP, not `data pribadi spesifik`, and about someone employed by the controller rather than a patient in their care. A different and much smaller risk than a patient's health data — but not zero, and in Mode B it still crosses a border. The tool ships with `byDoctor` **included** (a revenue-by-doctor question is the point of the report) and the fact recorded here so nobody later discovers it in a payload.

**`ADMIN` needs its own `ChatChannel` value.** The enum is `PATIENT | DOCTOR` today. Reusing `DOCTOR` for admins is exactly the confusion §4.1.1 exists to prevent, and the channel already decides the system prompt and the context policy — an admin prompt should not carry clinical-safety framing written for a clinician. This is a migration plus a shared-types change, tracked as `P15-T17`.

#### 2.1.3 What the admin channel deliberately cannot answer

- **Occupancy, rooms, beds, wards, in-patient census.** See §3 — this is not a missing tool, it is a domain that has never been built. `Room`, `Bed`, and `Ward` do not exist in `schema.prisma`, the MVP is outpatient, and appointments schedule against practice sessions rather than physical space. An in-patient analytics tool needs the domain first; adding a tool that guesses would answer the question wrongly rather than not at all.
- **Anything naming a patient.** `QueueBoardResponse.entries[]`, per-patient invoices, individual registrations. An admin who needs those has the REST screens built for them, with the audit trail those screens carry. The chat surface is for the aggregate question.
- **Identifiers, in any channel.** Unchanged: `getPatientIdentifiers` is unreachable from every tool (§7).

### 2.2 Explicitly out of scope

- **Any write.** No prescribing, no booking, no EMR entry. Unchanged from `ai-chatbot.md` §2.2.
- **Free-text clinical notes.** `encounter.read:own` exists and a doctor may read their own encounters over HTTP — but shipping SOAP narrative to a foreign processor is a different risk class from shipping a count, and it is the one thing here that could not be defended as minimal. See §8, and §5.1 for why retrieval does not change the answer.
- **Patient channel tools.** A patient asking "what room is Budi in" must get the same denial the REST API gives them; the cheapest way to guarantee that is to give the channel no tools at all.
- **Room availability, and in-patient analytics generally.** See §3 and §2.1.3 — the domain does not exist, in any channel.

### 2.3 Required change: the doctor-channel output guard

**Decided.** `SafetyPolicyService.evaluateOutput` runs on both channels and, on a `diagnosisAssertion` match, **discards the entire assistant reply** and substitutes refusal copy. The doctor variant is politely worded — "rely on your own clinical judgement" — but the answer is still thrown away.

That is survivable while the assistant only knows clinic hours. It becomes the primary obstacle the moment tools land, because the patterns match replies that discuss a *specific patient*, which is precisely what a tool-equipped doctor channel exists to do. A doctor asking "summarize Budi's next appointment and whether we have his medication in stock" can lose the whole reply — stock lookup included — because one clause tripped the pattern. The more useful the tools make it, the more often it refuses.

For the **doctor channel only**, a diagnosis match now:

- still records `diagnosis_attempt` in `safetyTags` — the readiness-review evidence trail is unchanged, and the counts stay comparable across releases;
- **appends** a clinical-judgement notice instead of replacing the reply.

Unchanged: the prescription/dosing guard still replaces the reply on both channels, and the **patient channel is untouched in every respect**. The rationale is the one the readiness review already states — the no-diagnosis rule exists to keep unlicensed medical advice away from a layperson, and a licensed clinician is not a layperson. Detection stays; the punishment changes.

**The admin channel (§2.1.2) takes the patient-channel treatment, not the doctor's.** An administrator is a layperson in exactly the sense the rule means, so a diagnosis or dosing assertion there replaces the reply. This costs nothing in practice — the channel's tools return counts and totals, so a guard match is a signal that something has gone wrong rather than an obstacle to legitimate use.

This contradicts `ai-chatbot.md` §2.2, which lists "diagnosis or differential diagnosis" as globally out of scope. **That section must be amended in the same PR** — the constraint becomes patient-channel, and the doctor channel's constraint becomes "will not replace clinical judgement", which is what the appended notice says.

## 3. Rooms do not exist yet

There is no `Room`, `Bed`, or `Ward` model in `schema.prisma`. Room availability is not a tool that is missing — it is a domain that has never been built. Nothing reads it, nothing writes it, and the appointment module schedules against practice sessions and a clinic timezone, not physical rooms.

So "which rooms are free" needs, in order: a data model, a module that owns occupancy, a REST surface with its own RBAC, and only then a tool wrapping it. That is a separate phase, sized like `pharmacy-flow`, not a line item here.

**Decided: dropped, and not replaced by a partial version.** The MVP scope is outpatient, and a room tool implies bed and occupancy management the rest of the product does not have. A static room list was considered and rejected — it could name the rooms that exist but never say whether one is free, which answers the asked question wrongly rather than not at all. Revisit only if inpatient becomes a real requirement, and then as a domain, not as a tool.

**This applies to the admin channel too, and is worth restating there because the request arrives in a different costume.** "Admin analytics" reasonably suggests occupancy, in-patient census, average length of stay. None of those have a data source. What the admin channel *can* answer — queue load, cash-drawer totals, appointment capacity, stock and expiry — it answers from services that already exist (§2.1.2). The distinction is not about sensitivity; it is that one set of questions has data behind it and the other does not.

## 4. Architecture

### 4.1 The authorization rule that makes this safe

**Every tool calls the existing domain service, passing the asking doctor's own `CurrentUser`.** It does not touch a repository, does not use a service account, and does not build its own query.

This is the whole design in one sentence. `patient.read:own` for `DOCTOR` already resolves through the `DoctorPatient` assignment table inside `PatientManagementService`; a tool that calls that service with that user inherits the scoping for free and cannot drift from it. If a doctor asks about a patient who is not theirs, the service returns not-found exactly as it does over HTTP — the model cannot widen its own access, because the model never gets to express a query, only arguments to a call that was already authorized.

Corollary: **no new permissions are seeded.** A tool the caller lacks permission for is not offered to the model in the first place (the tool list is built per request from the caller's ability), and is refused again at dispatch if it somehow is.

#### 4.1.1 Scope is part of the requirement, not a footnote

"Inherits the caller's authorization" is necessary but not sufficient, and the gap is concrete.

`ChatChannel` is `PATIENT | DOCTOR` (`schema.prisma`), the channel is chosen by the **client** and defaults to `PATIENT` (`schemas.ts`), and `chat.session.create:own` is granted to `ADMIN` and `SUPER_ADMIN` as well as `PATIENT` and `DOCTOR`. Nothing today stops an admin from opening a session with `channel: 'DOCTOR'`.

That matters because the §2.1 table reads `patient.read:own` as a description when it needs to be a **requirement**. `ADMIN` holds `patient.read:any` and `medication.read:any` in `seed.sql`. An admin in a doctor-channel session would therefore be offered `list_my_patients`, and §4.1 would faithfully execute it as that admin — resolving through scope `ANY` rather than the `DoctorPatient` assignment table. The result is every patient in the clinic, from a tool whose name promises the caller's own.

No permission is violated: an admin may read all patients over HTTP. What breaks is minimisation. The §7 page cap bounds how many rows come back, not **which population they are drawn from** — and in Mode B that is the difference between one patient's name crossing the border and the clinic's whole roster.

**Two rules, both enforced in `ChatToolRegistry`, both fails-closed:**

1. **Channel and role must agree.** A tool declares the channels it may appear in *and* the roles that may invoke it. A doctor-channel session opened by a non-doctor is offered no tools at all — not a reduced set. The channel a session claims is not evidence about who opened it.
2. **A tool declares a required scope, not just an action.** `list_my_patients` requires `patient.read` resolved to **`OWN`**. If the caller's ability resolves it to `ANY`, the tool is **not offered** — the broader permission disqualifies rather than qualifies. This reads backwards until you say it out loud: the tool's contract is *"the patients assigned to you"*, and an actor for whom that phrase has no meaning should not be handed the tool that answers it.

Rule 2 is what makes the §2.1 table honest. It also means an admin who genuinely needs clinic-wide numbers gets them from a tool built for that question (§2.1.2), with a projection designed for it — not by borrowing a doctor's tool and silently widening its scope.

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

The allowlist applies in **both** modes of §4.4, but it carries different weight in each. In Mode B it is the last thing standing between a domain service and a foreign processor. In Mode A the recipient is a doctor who could fetch the same rows over HTTP, so it is no longer a disclosure control — it becomes the contract the frontend renders against (§4.5), and the reason enabling Mode B later is a flag flip rather than a re-audit.

### 4.4 The dispatch loop, and where it stops

**Decided: two modes, and the safe one is the default.** Summarised in [ai-chatbot.md](./ai-chatbot.md) §4.2.1 as an extension of the Phase 13 integration pattern; this is the authoritative version.

The observation that forces this: the model is not the thing that reads the database — it is the thing that decides *what to read*. Intent classification and argument extraction are what an LLM is for here. Composing the sentence around the rows is a separate job, and it is the only part that requires the rows to leave the country.

So the loop splits at step 4.

**Common steps (both modes):**

1. Build the tool list from the caller's ability. Empty list → today's behaviour exactly, no `tools` field on the wire.
2. Send. If the reply is a tool call, validate arguments against the Zod schema (a hallucinated argument fails here, not in a repository).
3. Execute as the asking user, then project the response through the tool's output allowlist (§4.3).
4. Persist a `SYSTEM` turn — tool name, validated arguments, projected result. Unconditional, in both modes, and it happens **before** any decision about transmission.

**Mode A — orchestrator-only (default, `AI_CHAT_TOOL_RESULT_TO_PROVIDER=false`):**

5. **Stop.** The projected result is returned to the client as a structured payload alongside the assistant turn (§4.5). There is no second round trip; the model is never shown the rows it asked for.

The provider saw: the system prompt, the conversation, the user's own message, the tool *catalogue*, and the arguments it chose. It did not see a single patient field. A tool call for `get_patient_summary` sends `{"patientId": "…"}` — an opaque UUID the model got from a prior list turn — and receives nothing back.

**Mode B — full loop (opt-in, `AI_CHAT_TOOL_RESULT_TO_PROVIDER=true`):**

5. Append the projected result to the messages array and loop, so the model composes prose over the rows.
6. Cap at **3 tool calls per user message.** Beyond that, answer from what was gathered.

The cap is not a performance guard. It is what stops a prompt injection buried in a data field from driving an unbounded fetch loop. Mode A is structurally immune to that class: a result that never re-enters the model's context cannot carry an instruction into it. **This is a security property, not only a privacy one** — §9 `P15-T15` tests injection-through-tool-result, and in Mode A the test is a formality.

Mode A also costs one round trip instead of two-to-four, which makes it the faster and cheaper mode as well as the compliant one.

**What Mode A gives up, stated plainly.** The answer is a rendered structure — a table, a card, a list — not a paragraph. A composite question (*"summarise Budi's next appointment and tell me whether we have his medication in stock"*) returns two blocks with a short model-written preamble that was composed **before** the lookups, rather than one flowing narrative that reasons across both results. For a doctor scanning a schedule this is arguably better; for conversational follow-ups (*"and the one after that?"*) it is worse, because the model cannot see what it just showed. That is the trade, and it is the clinic's to make — which is why it is a flag and not a decision taken here.

`P15-T12` and the staging period should measure how often Mode A's shape is actually insufficient, so the choice to enable Mode B is made against evidence rather than assumption.

### 4.5 Response composition in Mode A

The model's turn and the data are assembled separately and joined on the way out.

- The assistant message persisted and returned is the model's own text — which, in Mode A, is written without knowledge of the results and so must not assert facts about them. The system prompt instructs it to announce the lookup (*"Saya cek jadwal Anda hari ini."*) rather than predict its content, and `SafetyPolicyService.evaluateOutput` runs on it exactly as today.
- The projected tool results ride in the response envelope's `meta.toolResults` — an array of `{ tool, arguments, result }` matching the persisted `SYSTEM` turns one-to-one.
- The client renders each result with a per-tool component. This is the same information `P15-T08` already required be made visible; Mode A promotes it from a transparency affordance to the primary answer surface.
- A tool that fails, or returns empty, renders as that — never as model-authored prose about what might have been there.

Consequence for `packages/shared-types`: each tool's **output** schema is now part of the API contract, not an internal projection. It is what the web client types against, so it lives beside the argument schema in `packages/shared-types/src/ai-chatbot/` and reaches the frontend through Orval like everything else.

### 4.6 Wire support

Both adapters need it, and they differ:

- `OpenAiCompatibleAdapter` — `tools` array, `tool_calls` on the response message, `role: 'tool'` results. Covers six of the seven kinds.
- `AnthropicAdapter` — `tools` with `input_schema`, `tool_use` / `tool_result` content blocks.

Both normalize to one HMS-side shape, so `AiChatbotService` stays vendor-blind — same contract as `SendChatCompletionResult` today.

A router (`OPENAI_COMPATIBLE`) may silently fall back to a backend that does not support tool calling. An earlier draft said to treat a reply that ignores `tools` as a plain answer rather than an error. **That is too permissive once tools exist**: a plain answer to a question about clinic data is the model's imagination, and it is indistinguishable from a real answer until someone checks it against the database. The reply is still not an error — but a turn where tools were offered, none were called, and the reply asserts clinic facts is caught by §4.7's unsourced-claim guard rather than rendered.

**Mode A needs only half of this.** Serializing the `tools` catalogue and parsing `tool_calls` / `tool_use` out of the reply is required in both modes; emitting `role: 'tool'` messages and `tool_result` blocks is Mode B only. Build both halves in `P15-T03` regardless — the second half is small, and leaving it unbuilt would make Mode B a re-implementation rather than a flag.

**Routers are refused when Mode B is on.** Behind `OPENAI_COMPATIBLE` the recorded `providerKind` is the router, not the eventual backend, so the transfer destination is unknown — tolerable when nothing personal is transmitted, not tolerable under Pasal 56 when patient fields are. `AiProviderConfigService` rejects activating `AI_CHAT_TOOL_RESULT_TO_PROVIDER` while the active config is a router kind.

### 4.7 Intent classification, and what happens when it is wrong

Mode A rests on the model picking the right tool. That deserves a section rather than an assumption, because **Mode A raises the stakes on this and lowers them at the same time**, and both halves matter.

**It raises them.** In Mode B the model sees the result and can self-correct — call the wrong tool, notice, call another. Mode A has no correction loop: one choice, executed, rendered. A wrong pick is the answer.

**It lowers them.** The rendered card names the tool and its arguments (§4.5). A clinician who asked about today and sees `list_my_appointments · 2026-08-02` sees the mismatch immediately. Mode B would narrate the wrong day fluently, with nothing marking it. **Visible wrongness beats confident wrongness**, and this is the design's answer to imperfect classification — not a claim that classification will be perfect.

So the goal is not accuracy approaching 100%. It is: raise accuracy where that is cheap, and make the residual visible.

#### 4.7.1 The levers, in order of actual effect

1. **Tool surface design — larger than prompting.** Five tools with disjoint purposes classify far better than fifteen with fuzzy edges. §2.1's restraint is an accuracy property, not only a scope one. The one genuinely adjacent pair is `list_my_patients` / `get_patient_summary`, separated by whether a patient is named — a strong signal. Resist adding a sixth doctor tool that overlaps an existing one; a merged tool with an argument beats two tools the model must choose between.

2. **Descriptions are classifier input, not documentation.** Each tool states what it is for, **what it is not for**, and carries Indonesian trigger phrasing. Users type Indonesian; tool descriptions are written in English; that is cross-lingual matching, the same problem §5.2 solves with vectors, on a different surface. Written as:

   ```
   get_queue_board_summary
   Berapa banyak pasien mengantre hari ini, per poli.
   Use for: "berapa yang antre", "antrean poli umum ramai?", "how many waiting".
   Do NOT use for: siapa saja yang antre (nama pasien tidak tersedia lewat tool ini),
   atau kapasitas jadwal praktik (pakai get_appointment_load).
   ```

3. **Argument schemas as constraints, not just validation.** Enums over free strings; `date` defaulting to today in `CLINIC_TIMEZONE` so the model never has to derive it; `.describe()` on every field, which serializes into the JSON Schema the model reads. An argument that cannot be malformed removes half the error space, and Zod catches the rest at §4.4 step 2 rather than in a repository.

4. **Ambiguity must produce a question, not a guess.** The channel system prompts state explicitly: when it is unclear which lookup is meant, call nothing and ask. One clarifying question costs less than one wrong lookup rendered as fact. A high clarify rate is a *good* measurement, not a failure — §4.7.3 counts it as such.

5. **Deterministic pre-routing where a miss is expensive.** The pattern already exists: the emergency template never contacts the provider at all (`ai-chatbot.md` §3.1.4). Any intent whose misclassification is costly belongs in that shape, not in the model's hands.

#### 4.7.2 The dangerous failure is *no* tool call

Picking the wrong tool is visible. Picking **none** — and answering "you have 3 patients today" from training data — is not. In Mode B this is nearly undetectable. In Mode A it is trivially detectable, because the absence of a lookup is a fact HMS holds:

> **Unsourced-claim guard.** When tools were offered, none was called, and the assistant reply asserts a specific clinic fact — a count, a name, a date, a currency amount — the reply is treated as unsourced. It is tagged `unsourced_claim` in `safetyTags` and replaced with a short "I could not look that up" message rather than rendered.

Mechanical, cheap, and shaped exactly like the existing `SafetyPolicyService` guards: pattern-based, and it runs whether or not the model cooperated. It closes the only path by which Mode A could display a number that did not come from the database — and it happens to catch §4.6's silent-router case for free, since a backend that ignores `tools` produces exactly this signature.

Like every pattern guard in this repository, it will not catch every phrasing. It is a control over the clear cases, and `safetyTags` is what tells us whether the patterns are adequate.

#### 4.7.3 Tool selection has to be measured, per provider

Everything above is hypothesis until there are numbers, and **this document previously had none**: `P15-T12` measures retrieval quality and nothing measures tool selection. `P15-T19` fills that gap, in the same shape as `P15-T12` — a fixed bilingual question set with expected `(tool, arguments)`:

| Metric | What it catches |
| ------ | --------------- |
| Correct-tool rate | The right lookup was chosen |
| Correct-args rate | Date, poli, or patient extracted correctly |
| False-tool rate | A tool was called when none was needed |
| **Missed-tool rate** | Answered from training data when a tool existed — the §4.7.2 failure |
| Clarify rate | Asked back when genuinely ambiguous — counted as success |

**Run per `AiProviderKind`, because the results will differ sharply.** Tool-calling competence varies enormously between models; `llama3.2` on a clinic's own Ollama is not `claude-sonnet` or `gpt-4o`. Since the clinic chooses the provider (`AiProviderConfig`), tool-calling reliability is a per-config property, and this eval is what says whether a given config may have `AI_CHAT_TOOLS_ENABLED` at all. A model that cannot select tools should be refused the tool surface, not allowed to degrade into §4.7.2.

### 4.8 Implementation strategy: build it, with three small libraries

**Decided: no agent framework — not LangChain, not LlamaIndex, not a wholesale move to the Vercel AI SDK.** Recorded here because "why didn't you just use LangChain" is a reasonable question that should have a written answer rather than be re-argued.

Three reasons, each specific to this repository:

1. **Mode A opposes the framework's core abstraction.** An agent executor exists to feed tool results back to the model; §4.4 exists to stop before that. Implementing Mode A on top of a framework means fighting its main component, which is more work than the loop it replaces.
2. **Invariant 1 requires owning the request body.** "Every byte recorded before it is sent" is a structural guarantee only while HMS assembles the payload. A framework that composes it internally demotes that to an integration test — and `pii-audit-regression.spec.ts` could not keep its current shape.
3. **The expensive part is already built, and it is small.** `openai-compatible.adapter.ts` (169 lines) and `anthropic.adapter.ts` (121 lines) already normalize seven provider kinds through one contract, with a circuit breaker, sealed credentials, and per-vendor specs. Adding a framework means a second provider abstraction beside the working one, plus its own credential path beside `AiProviderCryptoService`.

There is also a house-style cost: explicit types everywhere, no `any`, one export per file, domain types in `shared-types`. A framework's runtime surface leaks into call sites where those rules apply.

**What is left to build is genuinely small** — the Mode A loop, the registry with its §4.1.1 filters, hybrid retrieval with RRF, chunking, and an Ollama embedding call. The RRF fusion really is about twenty lines.

**Three libraries do earn their place**, all single-purpose, none owning the flow:

| Need | Library | Why not hand-rolled |
| ---- | ------- | ------------------- |
| Zod → JSON Schema for the `tools` array | `zod-to-json-schema` | `shared-types` is on Zod `^3.25`, which has **no** native `z.toJSONSchema()` — that is Zod 4. Unions, optionals, nesting, and `additionalProperties` have too many edge cases to write by hand. Migrating `shared-types` to Zod 4 for the native version is a separate, larger decision touching `nestjs-zod` and every DTO |
| Token budgeting | `gpt-tokenizer` or `tiktoken` | `max_tokens`, the 20-turn replay, and `P15-T13` compaction all need real counts. `chars / 4` is badly wrong for Indonesian, and `ai-chatbot.md` §4.3.6 already documents what too small a budget does |
| Chunking (optional) | a small text splitter | Only if chunking must be structure-aware. Paragraph-plus-overlap is ~80 lines of our own code |

**One constraint to design in, not discover:** Prisma has no native `vector` type. `ClinicDocumentChunk` needs `Unsupported("vector(1024)")` and every retrieval query is `$queryRaw`. This fits the architecture — repositories are already the only layer touching Prisma — but it means `P15-T10` and `P15-T11` cannot lean on Prisma Client for vector work.

**What would reverse this:** streaming tokens to the browser across many vendors, dozens of third-party integrations, or autonomous multi-step planning. None is in scope — v1 is explicitly request/response, five tools, and a deliberately bounded loop. If two of those three become real, revisit, and the Vercel AI SDK is the candidate to revisit — not LangChain.

## 5. Retrieval (RAG)

### 5.1 Two corpora, and only one of them is cheap

"RAG" covers two things with completely different risk profiles, and conflating them is how this goes wrong.

**A. Curated knowledge — recommended, this phase.** Documents someone chose to upload as reference material. **Contains no personal data**, so it adds no UU PDP exposure at all. Two ownership tiers, same risk profile:

- **Clinic-wide corpus** — SOPs, FAQ, service and price lists, BPJS process explanations, referral procedures, licensed clinical guidelines. Admin-managed; serves both channels (visibility-filtered).
- **Personal knowledge bases** — a doctor or admin maintains **their own** corpus: a doctor uploads the guidelines, formularies, and reference papers they personally work from; an admin uploads their operational playbooks. A personal corpus is **private to its owner** — it is retrieved only for that user's own sessions and is never visible to, or retrievable by, anyone else. It stays inside risk class A only because of one rule, stated at upload and enforced as policy: **no patient data in a knowledge base.** Retrieved chunks reach the AI provider like any context, so a doctor pasting patient notes into their KB would smuggle corpus B in through the side door — upload copy warns against it, and the readiness review (§9 `P15-T15`) includes a spot-check.

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

- **Storage is the shared `document-management` service**, not a chatbot-private table — `Document` / `DocumentChunk` with `ownerType` (`CLINIC | DOCTOR | ADMIN | PATIENT`) and `ownerId`, defined in [docs/customer-service/wa-telegram-customer-service-strategy.md](../customer-service/wa-telegram-customer-service-strategy.md) §4.3. This supersedes the earlier `ClinicDocument` / `ClinicDocumentChunk` naming: one document store serves the clinic FAQ, the WA/Telegram channel, and every knowledge base, so there is exactly one ingestion pipeline, one embedding configuration, and one place S3 objects live.
- **Corpus scoping (the ownership rule in code):** clinic corpus rows are `ownerType = CLINIC`, managed behind `document.write:any`; a personal KB row is `ownerType = DOCTOR | ADMIN` with `ownerId = the owner`, managed behind `document.write:own` / `document.read:own`. **A retrieval query is the union of the clinic corpus (visibility-filtered by channel) and the asking user's own corpus — nothing else.** The `ownerId` filter is applied in the repository query, not left to ranking: another doctor's KB is not "unlikely to surface", it is not in the candidate set. Patients have no personal KB in this phase (`PATIENT` rows exist for the future document feature, not for retrieval).
- Chunks carry a **visibility** column: `PATIENT`, `DOCTOR`, or `BOTH`. It applies to the **clinic corpus only** — staff-only SOPs must never surface in a patient answer, and channel filtering is the enforcement. Personal-KB chunks need no visibility value; owner-only scoping already decides everything.
- Citations distinguish the source tier — "dari dokumen klinik" vs "dari dokumen Anda" — so a doctor knows whether an answer leans on clinic policy or on their own uploads.
- A personal KB is the owner's data: they can list, replace, and delete their documents at any time, and deletion removes chunks and vectors with the document.
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

### 7.1 The claim this section used to make, and why it was wrong

An earlier version of this table justified the lawful basis as: *"the doctor already has lawful access to these records for care delivery — a tool changes the interface, not the entitlement."*

**That is withdrawn.** It does not survive contact with UU PDP. The doctor's entitlement is a right of *internal access*; transmitting the same fields to a processor in another jurisdiction is a **separate processing activity** with a new recipient, a new purpose, and a cross-border transfer. Access is not disclosure, and disclosure is not transfer. Inheriting a basis across those boundaries is exactly the reasoning the law exists to prevent, and writing it into a design document would have made it load-bearing.

The correct response was not a better argument. It was §4.4 Mode A — **make the transfer not happen**, and the question of what basis would have covered it stops needing an answer.

### 7.2 Position by mode

| Requirement | Mode A (default) | Mode B (opt-in) |
| ----------- | ---------------- | --------------- |
| Lawful basis (Pasal 20) | No patient field reaches the processor, so no basis for transfer is required. The user's own typed message is unchanged from Phase 13. | **Explicit, purpose-specific consent required.** Health data is *data pribadi spesifik*; consent must be a separate affirmative act, not bundled into the privacy notice. No consent record → tools touching personal data are not dispatched. Fails closed, same principle as the ability filter. |
| Cross-border transfer (Pasal 56) | Not engaged. | **A recorded transfer basis is required** on the active `AiProviderConfig` — adequacy, binding safeguards, or subject consent. Routers refused (§4.6). |
| Impact assessment (Pasal 34) | Not engaged by the tools track. | **DPIA required** before production. Automated processing of sensitive data at scale is squarely in scope. |
| Processor contract (Pasal 51) | A DPA is still wanted for the conversation content itself, as today. | **Signed DPA is mandatory**, per readiness §5. |
| Medical-record disclosure (PMK 24/2022) | Not engaged — record content does not leave the facility. | Sending record content to an external party reads as *pembukaan / transfer isi rekam medis*, which the regulation frames as requiring a written, need-limited request. This needs a legal answer, not an engineering one. |
| Admin channel (§2.1.2) | Aggregates carry no patient data, so the channel adds **no patient exposure in either mode**. `get_daily_cashier_report` carries practitioner names — *data pribadi umum* about staff, not *spesifik* about patients — stated in §2.1.2 rather than left to be found in a payload. | ← plus the staff-name transfer |
| Scope integrity | A tool requires a permission **at a stated scope** (§4.1.1). An actor whose ability resolves the action to `ANY` is not offered an `OWN`-scoped tool, so a doctor tool cannot be borrowed into clinic-wide reach. | ← and this is what stops a whole roster crossing the border in a single turn |
| Minimization | Tool results are **projections, not records**, enforced by a per-tool allowlist (§4.3) that fails closed. `get_patient_summary` returns display name, age band, assignment status, next appointment — never MRN, NIK, BPJS number, address, or notes. List tools carry a page cap so "list my patients" cannot become a bulk export. Identifiers already have their own door: `getPatientIdentifiers` requires `patient.read-identifier`, audits every disclosure by field name, and **no tool may call it** — an identifier reaching a foreign processor would be an unauditable disclosure by construction. | Same, and now load-bearing rather than belt-and-braces. |
| Record of processing | Every tool call persists a `SYSTEM` turn with the exact projected payload, in both modes, before any transmission decision. Same mechanism, same 25-year retention as today. In Mode A the turn records an internal lookup; in Mode B it records a transfer. | ← |
| Data subject rights | Unchanged — the transcript is already the authoritative record; tool turns join it. | ← |
| Prompt injection via tool result | Structurally impossible — the result never re-enters the model's context. | Bounded by the 3-call cap and tested at `P15-T15`. |
| Retrieval (§5) | Clinic documents carry no personal data, so retrieval adds **no exposure**. Retrieved chunks are persisted as a `SYSTEM` turn before transmission like any other context. Patient-record retrieval is deferred (§5.1). | ← |
| Memory (§6) | Cross-session memory is a typed allowlist of preference fields about the asking user, never free text and never about a patient — so the retention, access, and erasure questions have concrete answers instead of "whatever the model wrote". | ← |
| Minimization | Tool results are **projections, not records**, enforced by a per-tool allowlist (§4.3) that fails closed. `get_patient_summary` returns display name, age band, assignment status, next appointment — never MRN, NIK, BPJS number, address, or notes. List tools carry a page cap so "list my patients" cannot become a bulk export. Identifiers already have their own door: `getPatientIdentifiers` requires `patient.read-identifier`, audits every disclosure by field name, and **no tool may call it** — an identifier reaching a foreign processor would be an unauditable disclosure by construction. |
| Record of processing | Every tool call persists a `SYSTEM` turn with the exact redacted payload **before** it is transmitted. Same mechanism, same 25-year retention as today. |
| Data subject rights | Unchanged — the transcript is already the authoritative record; tool turns join it. |
| Processor transparency | Unchanged, with one caveat: behind a router the recorded `providerKind` is the router, not the eventual backend. That was already true and matters more once real patient data is in play. |
| Retrieval (§5) | Clinic documents carry no personal data, so retrieval adds **no exposure**. Retrieved chunks are persisted as a `SYSTEM` turn before transmission like any other context. Patient-record retrieval is deferred (§5.1). |
| Memory (§6) | Cross-session memory is a typed allowlist of preference fields about the asking user, never free text and never about a patient — so the retention, access, and erasure questions have concrete answers instead of "whatever the model wrote". |

### 7.3 The honest risk, restated

An earlier version of this section said: *"Tools end that — a doctor asking about their patient sends that patient's name to a foreign processor."* Under Mode A that is no longer true, and the sentence is replaced rather than softened.

What remains true: **Mode B ends it**, and Mode B is a decision a clinic takes deliberately, with four things in hand (consent, transfer basis, DPIA, DPA) rather than one. The value of splitting the modes is that the useful part of this phase — a doctor getting real answers from real data — ships without any of them.

What is still exposed in Mode A, and always was: the user's own typed message. A doctor typing *"apa jadwal Budi besok"* has put a name in the prompt themselves. Mode A does not fix that, no design can, and it is unchanged from Phase 13.

### 7.4 Enablement

Three flags, each defaulting off, each gating a different thing.

| Flag | Default | Cleared when |
| ---- | ------- | ------------ |
| `AI_CHAT_TOOLS_ENABLED` | `false` | The dispatch loop has run in staging. Gates the tool track as a whole. |
| `AI_CHAT_TOOL_RESULT_TO_PROVIDER` | `false` | **Consent model live, transfer basis recorded, DPIA filed, DPA signed** — all four. Router kinds refused. |
| `AI_CHAT_CONTEXT_ENRICHMENT_ENABLED` | `false` | Unchanged from readiness §5 — SATUSEHAT linkage verified. Independent of both above. |

Sequencing inside the tool track: ship the two pharmacy tools first (`P15-T05`) — they touch **no personal data whatsoever**, so they prove the entire loop (wire, dispatch, transcript, rendering) with zero UU PDP exposure in either mode. The three patient tools (`P15-T06`) follow, in Mode A only. Mode B (`P15-T07`) is last and may sit unenabled indefinitely without blocking anything.

Note what this reorders: the signed-DPA gate that readiness §5 makes load-bearing for patient tools now attaches to `AI_CHAT_TOOL_RESULT_TO_PROVIDER`, not to `P15-T06`. That is the point — the legal track and the delivery track stop blocking each other.

## 8. Deliberate omission: clinical notes

`encounter.read:own` is granted to `DOCTOR` and the module exists, so a `get_encounter_notes` tool is a small change. It is left out on purpose.

A count or a name is a fact about a patient. A SOAP note is the clinical narrative — the most sensitive category the system holds, and the hardest to argue is minimal when the alternative is that the doctor opens the encounter screen they already have. If it is ever added it should be its own task, its own flag, and its own decision record, not a sixth entry in a table.

**§4.4 Mode A weakens half of this argument, and that should be said out loud.** The transfer objection — *shipping SOAP narrative to a foreign processor is a different risk class* — does not apply when the narrative is rendered to the asking doctor and never transmitted. What survives is the second objection: a chat surface is a worse way to read a clinical note than the encounter screen built for it, and a `get_encounter_notes` tool would exist mainly to make the assistant look capable. **Still omitted, now for a product reason rather than a legal one** — and permanently incompatible with Mode B, which is the cleaner way to state the constraint.

## 9. Delivery tasks

Branch naming `feature/p15-t<task>-<short-desc>`.

1. `P15-T01` Doctor-channel output guard (§2.3): tag without replacing on a diagnosis match, prescription guard and patient channel unchanged, `ai-chatbot.md` §2.2 amended in the same PR. **Independent of everything below** — it can ship first and stands on its own, because the current behaviour is already the weakest part of the doctor channel.
2. `P15-T02` Tool interface, registry, ability filtering, Zod arg schemas in shared-types. No wire changes. Specs prove an unpermitted tool is never offered and never dispatched, **and both §4.1.1 rules**: an `ADMIN` opening a `channel: 'DOCTOR'` session is offered zero tools, and an actor whose `patient.read` resolves to `ANY` is not offered `list_my_patients`. Both assert on the offered list *and* on dispatch — the filter is not the only gate.
3. `P15-T03` Adapter tool support (both adapters) + normalized HMS shape. Wire-shape specs per vendor.
4. `P15-T04` Dispatch loop in `AiChatbotService`, **Mode A only** (§4.4): argument validation, `SYSTEM` turn per call, projection, results returned in `meta.toolResults`. No `role: 'tool'` message is ever constructed in this task. Quota accounting for tool calls lands **here, not later** — the loop must never exist without it. A spec asserts the outbound request body contains no tool result, and is the regression test for invariant 4.
5. `P15-T05` The two pharmacy tools + `AI_CHAT_TOOLS_ENABLED` (default off). No personal data — the loop proven end to end at zero UU PDP exposure in either mode.
6. `P15-T06` The three patient tools, output allowlists defined field by field, specs asserting MRN/NIK/BPJS/notes cannot appear even when the backing service starts returning them. **Ships in Mode A**, so it no longer waits on the DPA gate — that gate moves to `P15-T07`.
7. `P15-T07` **Mode B behind `AI_CHAT_TOOL_RESULT_TO_PROVIDER` (default off)**: `role: 'tool'` / `tool_result` emission, the 3-call cap, router-kind refusal (§4.6), circuit-breaker and timeout behaviour under a multi-call turn, cost/latency measurement of a worst-case four-round-trip message. **Do not enable in any environment** until §7.4's four conditions are met; the code may merge before they are.
8. `P15-T08` Frontend: per-tool result components rendering `meta.toolResults`. In Mode A this **is** the answer surface, not a transparency affordance (§4.5) — so it is on the critical path for `P15-T06`, not a follow-up. Empty and failed results render as themselves.

9. `P15-T19` Intent accuracy (§4.7): tool descriptions written to §4.7.1 (including Indonesian trigger phrasing and explicit *do not use for*), `.describe()` on every argument field, the **unsourced-claim guard** (§4.7.2) in `SafetyPolicyService` with `unsourced_claim` tagging, and the bilingual eval set with its five metrics **run per `AiProviderKind`**. The eval is what says whether a given provider config may enable tools at all — a model that cannot select them is refused the surface rather than allowed to answer from training data. Lands with `P15-T05`, not after `P15-T06`: the pharmacy tools are enough to measure selection, and measuring before patient tools exist is the point.

**Admin channel (§2.1.2) — independent of the patient tools, and the cheapest track here:**

10. `P15-T17` `ChatChannel.ADMIN`: enum migration, `chatChannelSchema` in shared-types, an admin system prompt (operational framing, no clinical-safety copy written for a clinician), patient-channel output-guard treatment per §2.3, and RBAC binding so only `ADMIN` / `SUPER_ADMIN` may open the channel. Blocks `T18`.
11. `P15-T18` The five admin tools: `get_queue_board_summary` (allowlist drops `entries[]`), `get_daily_cashier_report` (`byDoctor` retained and documented), `get_appointment_load`, plus the two pharmacy tools shared with the doctor channel. Specs assert no patient-identifying field survives any projection, including one where `getQueueBoard` returns a full `entries[]` array and none of it appears. **No personal patient data in either mode**, so this ships without waiting on `P15-T16`.

**Retrieval (§5) — independent of the tool track, and shippable in parallel:**

12. `P15-T09` **Infrastructure first**: `pgvector/pgvector:pg16` in `docker-compose.dev.yml` and `.github/workflows/ci.yml`, production Postgres extension confirmed, `CREATE EXTENSION vector` migration. This blocks `T10`–`T12` and is the task most likely to surface an environment surprise — do it before writing retrieval code, not alongside it.
13. `P15-T10` Document store on the shared `document-management` service (§5.5): `Document` / `DocumentChunk` with `ownerType`/`ownerId`, channel visibility (clinic corpus), language tag, `embeddingModel` / `embeddingVersion`, vector + `tsvector` columns; clinic-corpus admin CRUD behind `document.write:any`; chunking and embedding on ingest via Ollama (`bge-m3`). Shared with the WA/Telegram channel's `PCS-T01`/`T02` ([customer-service strategy](../customer-service/wa-telegram-customer-service-strategy.md) §9) — whichever phase lands first builds the module, the other extends it; the schema above is the superset both need.
14. `P15-T11` Hybrid retrieval (§5.3): vector + full-text, fused with RRF, scope-filtered per §5.5 (clinic corpus by channel visibility ∪ asker's own corpus), prepended as a `SYSTEM` turn in the completion path, citations in the reply (marking clinic vs personal source), answer-language-follows-question, non-fatal on miss.
15. `P15-T20` Personal knowledge bases (§5.1 A, §5.5): owner-scoped CRUD behind `document.write:own` / `document.read:own` for `DOCTOR` and `ADMIN`, upload UI with the no-patient-data notice, ingestion reusing `T10`'s pipeline, and isolation specs — a doctor's KB chunk must not appear in another doctor's candidate set (asserted at the repository query, not on the ranked output), nor in any patient-channel or WA/Telegram answer.
15. `P15-T12` Retrieval evaluation: a fixed question set with expected documents, scored — and **explicitly including cross-lingual pairs in both directions** (Indonesian question → English document, and the reverse). Those pairs are the reason vectors were chosen; if they are not tested, the decision is unverified. Also establishes the ongoing recall baseline that triggers 2–4 in §5.2 are judged against.

**Memory (§6):**

16. `P15-T13` Conversation compaction: rolling summary of turns dropped past the 20-turn replay window, stored per session, replayed as one `SYSTEM` turn.
17. `P15-T14` Typed cross-session preferences (language, response length, default location) — migration-defined fields only, about the asking user only, user-visible and user-erasable.

**Gate:**

18. `P15-T15` Readiness review, in the shape of `P13-T11`: injection-through-tool-result *and* injection-through-retrieved-document cases (including a document in a **personal** KB — an uploaded PDF carrying instructions is the same attack with a self-service upload path), an attempt to reach another doctor's patient, an attempt to retrieve another user's personal KB, a spot-check of personal KBs for patient data (§5.1 A's one rule), a staff-only SOP chunk proven unreachable from the patient channel, transcript completeness, the diagnosis-tag rate before and after `P15-T01`, and — the central check — **a captured outbound request body for a patient-tool turn in Mode A, showing no patient field present**. Also measures how often Mode A's rendered shape was insufficient (§4.4), which is the evidence Mode B is judged against.

**Mode B prerequisites — legal track, not code, and not blocking anything above:**

19. `P15-T16` The four conditions in §7.4 for `AI_CHAT_TOOL_RESULT_TO_PROVIDER`: an explicit-consent model for AI processing (per patient, per purpose, versioned, revocable) checked in the dispatch loop and failing closed; a `transferBasis` / jurisdiction column on `AiProviderConfig`; a DPIA in `docs/legal/`; a signed DPA with the chosen vendor. Tracked here so the dependency is visible, owned outside this phase.

## 10. Definition of Done

- A doctor can ask "which of my patients have appointments today" and "do we have amoxicillin in stock" and get answers grounded in HMS data.
- A doctor asking about a patient who is not theirs gets the same not-found the REST API gives, and the attempt is visible in the transcript.
- An admin can ask "how many people are waiting" and "what did we take today" and get answers from live HMS data, in a channel of its own, with **no patient named in any result**.
- An admin who opens a doctor-channel session is offered no tools, and an `ANY`-scoped actor is never offered an `OWN`-scoped tool — both proven by spec, not by the tool table's wording.
- An admin asking about bed occupancy is told the clinic does not track it, rather than given a plausible number.
- A reply asserting a count, name, date, or amount when no tool ran is tagged `unsourced_claim` and never rendered as an answer — proven by a spec where the provider returns "you have 3 patients today" with no tool call.
- Tool-selection accuracy is a **measured number per provider kind**, not an assumption, and a config that fails it cannot enable tools.
- No agent framework is in `package.json`; the loop, the registry, and RRF fusion are this repository's own code.
- A doctor's reply is no longer discarded for discussing a patient clinically, and `diagnosis_attempt` is still counted on every such turn.
- No tool exists that writes.
- **With `AI_CHAT_TOOL_RESULT_TO_PROVIDER=false`, a captured outbound request body for a patient-tool turn contains no patient field.** This is the acceptance test for the whole tool track.
- The doctor sees the looked-up data rendered, and the assistant's own text never asserts a fact about a result it was not shown.
- Every provider-bound byte from a tool appears in `chat_messages` first — and in Mode A there are none.
- A tool result can contain only fields its own allowlist names, proven by a spec where the backing service returns an identifier and it does not survive.
- Enabling Mode B is a flag flip over already-merged code, and is refused while the active provider config is a router kind.
- A clinic-policy question is answered from the clinic's own documents, with a citation, rather than from the model's training data.
- **An Indonesian question retrieves the English document that answers it, and is answered in Indonesian** — and the reverse. This is the acceptance test for the whole retrieval track.
- An exact drug name or ICD code retrieves the right passage, proving the full-text half of the hybrid still earns its place.
- A staff-only document chunk cannot appear in a patient-channel answer.
- A doctor and an admin can each maintain their **own** knowledge base, and a personal document surfaces only in its owner's answers — another user's retrieval never has it in the candidate set, proven by spec at the repository query.
- A conversation past 20 turns does not contradict its own earlier answers.
- Cross-session memory holds only migration-defined fields about the asking user, and its subject can see and erase it.
- Every flag off (`AI_CHAT_TOOLS_ENABLED`, `AI_CHAT_TOOL_RESULT_TO_PROVIDER`, retrieval, memory) reproduces Phase 13 behaviour exactly, including no `tools` field on the wire.

## 11. Related Documents

- [implementation-plan.md](./implementation-plan.md) §10 — Phase 15 sequencing and the rules that gate each track
- [ai-chatbot.md](./ai-chatbot.md) — Phase 13 scope, safety policy, provider gateway. **§2.2 is amended by §2.3 of this document**; its §4.2.1 carries the summary of the §4.4 dispatch split, its §3.1.7 the invariant behind it, and its §9.2 the two new flags. Keep the two in sync — that section is the entry point for a reader who never opens this file.
- [ai-chatbot-readiness.md](./ai-chatbot-readiness.md) — enablement conditions this phase inherits. **The signed-DPA gate moves**: it attaches to `AI_CHAT_TOOL_RESULT_TO_PROVIDER` (§7.4), not to the patient tools, because in Mode A they transmit nothing to gate.
- [rbac.md](../MVP/rbac.md) — permission and scope model the tools reuse
- [wa-telegram-customer-service-strategy.md](../customer-service/wa-telegram-customer-service-strategy.md) — the WA/Telegram channel and the shared `document-management` service (§4.3 there) that §5.5 stores every corpus in: clinic FAQ, WA-channel FAQ, and personal knowledge bases
- [database.md](../MVP/database.md) — schema conventions the new document/chunk models follow
