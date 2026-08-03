# Tool-Selection Accuracy — Eval Set and Results (P15-T19)

Measures whether a given AI provider picks the right lookup, per
[ai-chatbot-tools.md](./ai-chatbot-tools.md) §4.7.3.

**This eval is a gate, not a report card.** Tool-calling competence varies
enormously between models — `llama3.2` on a clinic's own Ollama is not
`claude-sonnet` or `gpt-4o` — and the clinic chooses its provider through
`AiProviderConfig`. So tool-calling reliability is a **per-config property**,
and the numbers below are what say whether a given configuration may have
`AI_CHAT_TOOLS_ENABLED` at all. A model that cannot select tools should be
refused the tool surface rather than allowed to degrade into §4.7.2's failure
of answering from training data.

## 1. Status: not yet run

> **No provider has been measured.** The table in §4 is empty on purpose, and
> an empty table is the honest state — not a placeholder to be filled with
> optimistic guesses, and not a reason to treat the gate as passed.
>
> Running it needs a configured, active `AiProviderConfig` with live vendor
> credentials, and it spends real tokens (25 cases × one completion each per
> provider). That is why it is a script rather than a CI job.

What **is** built and verified: the fixed bilingual question set
(`apps/api/src/modules/ai-chatbot/eval/tool-selection-eval-set.ts`), the
scorer that turns observations into the five metrics
(`score-tool-selection.ts`, 14 unit cases), and the runner
(`apps/api/src/scripts/run-tool-selection-eval.ts`).

## 2. How to run it

```bash
AI_CHAT_ENABLED=true AI_CHAT_TOOLS_ENABLED=true \
  pnpm --filter @hms/api exec ts-node src/scripts/run-tool-selection-eval.ts
```

It measures whichever `AiProviderConfig` is **active**. To compare providers,
activate each in turn through the admin provider API and re-run; record every
result in §4 rather than overwriting, because the interesting number is how a
provider moves between model versions.

Each case is sent as a fresh single-turn exchange carrying the doctor system
prompt and the full tool catalogue and nothing else — no history, no context
enrichment, no retrieval. Every additional input is a confound that makes two
runs incomparable.

The synthetic caller holds `DOCTOR`'s real grants **plus** `inventory.read:any`,
so all five tools are offered and the expiry case is scorable. A plain doctor
is not offered expiry at all, and scoring an unoffered tool would measure the
ability filter rather than the model.

## 3. The five metrics

| Metric | Denominator | What it catches |
| ------ | ----------- | --------------- |
| Correct-tool rate | Cases expecting a tool | The right lookup was chosen |
| Correct-args rate | Cases that chose the right tool | Date, name, or patient id extracted correctly |
| False-tool rate | Cases expecting **no** tool | A tool was called when none was needed |
| **Missed-tool rate** | Cases expecting a tool | Answered from training data when a lookup existed — the §4.7.2 failure |
| Clarify rate | Ambiguous cases only | Asked back instead of guessing — **counted as success** |

Denominators are per-metric on purpose. Dividing missed-tool by the whole set
would let a set with more negative cases report a better score for identical
behaviour.

**Missed-tool is the number to watch.** A wrong tool is visible — Mode A
renders a card naming the tool and its arguments, so a clinician who asked
about today and sees `list_my_appointments · 2026-08-02` catches it
immediately. A *missing* tool call is invisible, and the reply is
indistinguishable from a real answer until someone checks it against the
database. The unsourced-claim guard is the production-side control over the
same failure; this metric is its pre-release counterpart.

## 4. Results

| Date | Provider kind | Model | Correct-tool | Correct-args | False-tool | Missed-tool | Clarify | Verdict |
| ---- | ------------- | ----- | ------------ | ------------ | ---------- | ----------- | ------- | ------- |
| _not yet run_ | — | — | — | — | — | — | — | — |

**Proposed thresholds for a passing verdict**, to be confirmed against the
first two or three real runs rather than treated as settled now:

- Missed-tool rate **≤ 10%** — the hard gate, since it is the invisible failure.
- Correct-tool rate **≥ 85%**.
- Correct-args rate **≥ 85%**.
- False-tool rate **≤ 15%** — a wasted lookup is cheap and self-evident.
- Clarify rate is reported, not gated. A low rate with a low false-tool rate
  is fine; a low rate with a high false-tool rate means the model guesses
  instead of asking.

A configuration failing the missed-tool gate must not run with
`AI_CHAT_TOOLS_ENABLED=true`.

## 5. The eval set

25 cases, checked in and changed deliberately — a set that drifts between runs
measures nothing across releases. Adding cases is fine; editing one to make a
provider look better is what this sentence exists to make awkward.

Three properties it is built for:

1. **Both languages on the same underlying intents.** Users type Indonesian and
   tool descriptions are written in English, which is cross-lingual matching on
   a different surface from §5.2's. A provider that scores well in English and
   badly in Indonesian is the failure this pairing exists to expose, and it is
   invisible in a monolingual set.
2. **The adjacent pair is over-represented.** `list_my_patients` and
   `get_patient_summary` are the one genuinely confusable pair, separated by
   whether a specific patient is named. `appointments-id-2` ("Siapa saja pasien
   saya besok?") deliberately says *pasien* while meaning the schedule — the
   date is the signal, not the noun.
3. **Negative cases are first-class.** Roughly a third expect no tool: general
   clinical knowledge, out-of-scope questions (bed occupancy, which §3 says is
   an unbuilt domain), and genuinely ambiguous ones. Without them a model that
   calls a tool for everything scores perfectly on correct-tool rate while
   being unusable.

Each case carries a `rationale` field explaining why it is in the set, so a
future reader can tell a deliberate trap from a typo.

## 6. Related documents

- [ai-chatbot-tools.md](./ai-chatbot-tools.md) §4.7 — intent classification, the levers, and the unsourced-claim guard
- [implementation-plan.md](./implementation-plan.md) §10 — Phase 15 delivery tasks
- Retrieval's equivalent measurement is `P15-T12`, in the same shape
