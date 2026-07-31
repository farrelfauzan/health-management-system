# AI Chatbot Readiness Review (P13-T11)

Companion to [ai-chatbot.md](./ai-chatbot.md). This is the gate between "Phase 13 is built" and "a clinic may switch it on". It records what was verified, how, what was found, and what remains true only because a flag is off.

**Verdict: cleared for staging. Not cleared for production.** Two conditions in §5 must be met first, and neither is a code change.

## 1. What this review actually did

Not a re-read of the code. Each claim below is backed by a test that fails if the claim stops being true, or by a measurement taken against real Postgres. Where a check found nothing, that is stated; where it found something, §4 says what was done about it.

| Area | Method | Result |
| ---- | ------ | ------ |
| Safety rules (§3.1–3.3) | Behavioural specs per rule | Pass — §2 |
| Log and audit surface | Structural sentinels over every chatbot source file | Pass — §3.1 |
| Personal data reaching the provider | Denylist spec + transcript inspection | Pass — §3.2 |
| Rate limits | Load test against real Postgres, including simultaneous bursts | **Failed, fixed, re-verified** — §4.1 |
| Enablement posture | Flag audit | Pass with conditions — §5 |

## 2. Safety checklist

Each row names the control and the test that holds it. "Prompt" means the model is asked; "control" means the outcome does not depend on the model cooperating.

| § | Rule | Enforcement | Evidence |
| - | ---- | ----------- | -------- |
| 3.1.1 | No diagnosis | Control — output rewritten to a redirect, `diagnosis_attempt` tagged | `safety-policy.service.spec.ts`, plus an end-to-end case where the *provider* returns a diagnosis and the API returns the redirect |
| 3.1.2 | No prescribing | Control — same rewrite path; general drug-class text passes | `safety-policy.service.spec.ts` (positive and negative cases) |
| 3.1.3 | Disclaimer required | Structural — persisted `disclaimerShown: true` per assistant turn, text in envelope `meta`, never in content | Service, integration, and UI specs all assert the content does *not* contain it |
| 3.1.4 | Emergency escalation | Control — deterministic template, **provider never contacted** | Integration case asserts zero `fetch` calls |
| 3.1.5 | PII minimisation | Control — §5.3 projection then denylist sanitiser | `redact-chat-context.spec.ts`; source rows carry MRN/notes and none survive |
| 3.1.6 | Audit retention | Structural — append-only messages, no update or delete method exists | `ai-chatbot-repositories.integration.spec.ts` |
| 3.2 | Input guards | Control — length (schema), empty/binary, injection, impersonation | 33 cases, bilingual |
| 3.2 | Rate limits | Control — atomic at write time (§4.1) | `chat-rate-limit.integration.spec.ts` |
| 3.3 | Output guards | Control — markup stripped before rule matching, uncertainty appended | Includes an assertion hidden inside a tag |

**Honest limits of the guards.** They are pattern-based. They catch the clear cases deterministically and for free, and they run whether or not the provider cooperated — but they will not catch a diagnosis phrased in a way the denylist does not anticipate, and the emergency list is not a triage protocol. This is why every intervention writes a `safetyTags` value: staging use is meant to produce the data that says whether the patterns are adequate, rather than an assumption that they are. The doctor channel is lower-risk here (a clinician is the reader); the patient channel is where the staging evidence matters.

## 3. UU PDP log audit

### 3.1 What HMS records

Every chatbot log statement was enumerated and checked — there are three, and all carry identifiers only: a typed error code with request id, a context *field name* on a skipped read, and a retry attempt count with its error code. No prompt text, no reply text, no API key, no provider payload. `AiProviderConfigRepository` contains no logger at all, and `revealApiKey` has exactly three call sites, all inside the connection builder.

This is now a **structural regression test**, not a one-time reading: `pii-audit-regression.spec.ts` fails if any chatbot logger call gains a `content`, `prompt`, `apiKey`, `ciphertext`, `payload`, or `body` reference.

Provider-config mutations audit to `audit_logs` with **field names, never values** (`AI_PROVIDER_CONFIG_CREATED/UPDATED/ACTIVATED/DELETED`, `AI_PROVIDER_CONNECTION_TESTED`) — a rotation records that `apiKey` changed, never to what.

### 3.2 What reaches the processor, and the record of it

With `AI_CHAT_CONTEXT_ENRICHMENT_ENABLED=false` (the shipped default) the answer is: **only what the user typed**. No patient data leaves HMS.

With it on, the payload is the §5.3 projection — display name, next-appointment summary, queue number, counts — passed through a denylist that strips identifier, clinical, and credential keys and drops arrays outright. The source rows are *not* safe (appointment rows carry `patient.mrn`, `reason`, `notes`); the spec asserts none of it survives.

**The record of processing is the transcript itself.** Each exchange persists a `SYSTEM` turn containing the exact redacted payload sent, alongside the session's `providerKind` and `providerKey`. That answers the UU PDP question — *what personal data went to which processor, when, for whom* — with more fidelity than an `audit_logs` row would, and it inherits the 25-year PMK 24/2022 retention of the messages table.

**Accepted gap:** there is no `audit_logs` entry per chat exchange, so chat activity does not appear in a unified audit query alongside logins and record access. The transcript is the authoritative record; anyone auditing chat must read `chat_messages`. Adding a per-message audit action would duplicate the record at meaningful write cost. Documented here so the choice is visible rather than discovered.

## 4. Findings

### 4.1 Rate limits were bypassable (found, fixed, re-verified)

**Finding.** The quotas counted in one statement and wrote in another. Under concurrency every request in a burst read the same pre-limit count and all of them passed. Measured against real Postgres: **ten simultaneous requests with one slot remaining — all ten allowed**. Burst size was the only bound, so a scripted client could send an unbounded burst for one slot's worth of budget. Since the quotas are the only thing between one account and an unbounded provider bill, this was a bypass rather than a rounding error.

**Fix.** The count and the write now happen in a single transaction guarded by a per-user Postgres advisory lock (`appendUserMessageWithinQuota`, `createSessionWithinQuota`). Only the *same* user's concurrent requests serialize, so an honest clinic never contends, and the lock releases with the transaction. `SafetyPolicyService` keeps the policy (windows, limits, error text); the repository enforces it atomically — the split that makes the guarantee structural instead of a convention.

**Re-verified.** Twenty simultaneous requests with one slot remaining now yield exactly one success and exactly `limit` persisted rows; the session quota holds identically at 20-for-3. The emergency bypass survives the change: an escalated turn routes to the unguarded append, because a quota must never be the reason someone is not shown the ambulance number.

### 4.2 Observations accepted without change

- **Pattern-based guards** — see §2. Mitigated by staging evidence, not by more patterns written blind.
- **No per-exchange `audit_logs` row** — see §3.2.
- **Provider-side retention is the vendor's.** HMS controls what it sends and keeps its own copy; what the vendor retains is governed by the clinic's contract with them. That belongs in the §5 procurement condition, not in code.

## 5. Enablement posture

Both flags ship **off**, and each stays off until a different thing is true.

| Flag | Default | Cleared for staging when | Cleared for production when |
| ---- | ------- | ------------------------ | --------------------------- |
| `AI_CHAT_ENABLED` | `false` | A provider config is active and `/test` passes | A clinic has accepted the §2 pattern-guard limits **in writing**, and a data-processing agreement with the chosen vendor is signed |
| `AI_CHAT_CONTEXT_ENRICHMENT_ENABLED` | `false` | Never enable before the row above | **SATUSEHAT master-data linkage verified** (the delivery plan's own gate) — until then the context has no verified identity to be about |

Staging enablement steps are in the [deployment runbook](../ops/deployment-runbook.md) §5.4. The [release readiness checklist](../ops/release-readiness-checklist.md) §8 carries the per-release boxes.

**The honest summary:** the code is ready to be exercised by real users in staging. What is not ready is the evidence that pattern guards are sufficient for patient-facing clinical conversation, and that evidence cannot be manufactured by writing more tests — it has to be collected from `safetyTags` on real traffic.
