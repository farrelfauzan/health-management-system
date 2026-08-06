# FAQ Retrieval — Eval Set and Results (`PCS-T04` / `P15-T12`)

The measurement behind `search_faq`. One harness serves two tasks: `PCS-T04`
asks for a golden Q→chunk set over the clinic FAQ, and `P15-T12` asks for a
fixed question set with expected documents including cross-lingual pairs in
both directions. They are the same question about the same corpus, so this is
built once — the same arrangement `PCS-T01`/`T02` have with `P15-T10`.

Companion documents:
[wa-telegram-customer-service-strategy.md](./wa-telegram-customer-service-strategy.md)
§4.2 (the tool and its output allowlist),
[ai-chatbot-tools.md](../post-mvp/ai-chatbot-tools.md) §5.3–5.5 (hybrid
retrieval and the scope predicate),
[ai-chatbot-tool-selection-eval.md](../post-mvp/ai-chatbot-tool-selection-eval.md)
(the sibling eval, same shape).

---

## 1. Status: not yet run

> **No numbers have been measured.** The table in §5 is empty on purpose. An
> empty table is the honest state — not a placeholder to be filled with
> optimistic guesses, and not a reason to treat retrieval as verified.

Running it needs infrastructure CI does not have: `DATABASE_URL` on pgvector,
a reachable Ollama serving the configured model, and an S3-compatible bucket.
It takes minutes rather than seconds, because every document is genuinely
embedded and every question genuinely embedded again.

What **is** built and verified: the fixture corpus
(`apps/api/src/modules/document-management/eval/faq-retrieval-corpus.ts`), the
fixed question set (`faq-retrieval-eval-set.ts`), the scorer
(`score-faq-retrieval.ts`, 12 unit cases), and the runner
(`apps/api/src/scripts/run-faq-retrieval-eval.ts`).

## 2. How to run it

```bash
pnpm --filter @hms/api eval:faq-retrieval
```

It seeds the fixture corpus, ingests it, asks all 18 questions through
`FaqSearchService`, prints the metrics, and tears the corpus down again —
including on failure, because ten fixture documents left behind would join the
next run's candidate set, and a corpus that grows between runs makes the
baseline uncomparable.

**It queries `search_faq`, not `DocumentRetrievalService`.** That is
deliberate: the eval measures what the WhatsApp/Telegram channel can actually
see, through the same pinned `PATIENT` visibility and the same two-field
output allowlist, rather than a richer view only the eval is entitled to. It
is also why grading maps document *title* back to slug — titles are all the
channel gets.

## 3. The six metrics

| Metric | Denominator | What it catches |
| ------ | ----------- | --------------- |
| Recall | Answerable cases | The corpus had the answer and retrieval surfaced it at some rank |
| Precision@1 | Answerable cases | The *best* passage was the right one — the near-neighbour test |
| MRR | Answerable cases | How far down the right document sits; a miss contributes 0 |
| **Cross-lingual recall** | Answerable cases that cross a language | The reason vectors were chosen at all |
| False-answer rate | Out-of-scope cases | Passages returned for a question nothing answers |
| **Staff-only leak rate** | Staff-only cases | An internal SOP reaching the patient channel |

Denominators are per-metric on purpose. Dividing the leak rate by the whole
set would let a set with more answerable questions report a safer number for
identical behaviour.

**Two numbers matter more than the rest.**

*Cross-lingual recall* is the one the architecture rests on. Local `bge-m3`
was chosen over a hosted embedder specifically for Indonesian↔English quality
([ai-chatbot-tools.md](../post-mvp/ai-chatbot-tools.md) §5.4), and the lexical
half cannot cross languages at all — an Indonesian question and an English
passage share no lexeme. A healthy overall recall with a poor cross-lingual
recall means the corpus is being served by exact term matching, and the
embedding decision is unverified rather than validated.

*Staff-only leak rate* is not a quality metric and must be **zero**. A
non-zero value means the SQL scope predicate is broken, which is a defect, not
a tuning result. The corpus carries a `DOCTOR`-visibility SOP and the set
carries a question worded to match it as closely as possible — it should be
the single best semantic match in the corpus and must still never be
returned. Its assertion-shaped counterpart lives in
`document-retrieval.integration.spec.ts`, where the predicate is pinned
against real Postgres; this metric is the end-to-end confirmation of the same
property through the channel's own entry point.

`HIT_BELOW_ONE` is scored as a hit, not a half-failure: the passages all reach
the model together, so a correct document at rank three still grounds the
answer. It is tracked separately from `HIT_AT_ONE` because a corpus drifting
from rank one to rank three is degrading before it starts missing.

## 4. The corpus is a stand-in, and replacing it is the next step

`PCS-T04` asks for a golden set built from *the clinic's real FAQ*. Those
documents do not exist yet, and grading against documents nobody has written
would produce a number with nothing behind it. The ten fixture documents are
modelled on what an Indonesian primary clinic actually publishes — opening
hours, BPJS requirements, referral validity and renewal, fees, cancellation,
lab preparation, sick notes — so the shape, length, and vocabulary match what
the real corpus will contain.

**Swapping in the clinic's real documents is the intended next move.** Only
`FAQ_RETRIEVAL_EVAL_CORPUS` and the `expectedDocumentSlug` values in the
question set have to change; the scorer, the runner, and the metrics do not.
Until that happens, the numbers below measure the *retrieval stack* against a
representative corpus — which is worth having, and is not the same claim as
measuring it against the clinic's own content.

Three properties the fixture is built for: both languages on **distinct
topics** (parallel translations would let a cross-lingual question succeed by
matching its own language's copy, measuring nothing); two **near-neighbour
pairs** (referral validity against renewal, immunisation hours against general
opening hours) that semantic similarity will happily confuse; and one
**staff-only document**, without which a zero leak rate would prove only that
nothing was there to leak.

## 5. Results

Record every run rather than overwriting — the interesting number is how
retrieval moves between corpus changes and embedding-model changes.

| Date | Embedding model | Corpus | Recall | P@1 | MRR | Cross-lingual recall | False-answer | Leak |
| ---- | --------------- | ------ | ------ | --- | --- | -------------------- | ------------ | ---- |
| _not yet run_ | | | | | | | | |

## 6. The question set

18 cases over 10 documents:

- **7 same-language** — plain phrasing, paraphrase over keyword, and both
  sides of each near-neighbour pair.
- **7 cross-lingual** — 3 Indonesian→English, 4 English→Indonesian. Both
  directions, because a model can be good one way and poor the other.
- **3 out-of-scope** — a reasonable clinic question the corpus does not cover,
  a medical-advice question (out of scope per strategy §1.3), and one with
  vocabulary adjacent to two real documents without being answered by either.
- **1 staff-only** — graded on absence.

The set is **fixed**. It is checked in and changed deliberately, because a set
that drifts between runs measures nothing across releases. Adding cases is
fine; editing one because retrieval started failing it is not.

## 7. Related documents

- [wa-telegram-customer-service-strategy.md](./wa-telegram-customer-service-strategy.md) — §4.2 the tool, §4.3 the corpus, §9 delivery plan
- [ai-chatbot-tools.md](../post-mvp/ai-chatbot-tools.md) — §5.3 hybrid retrieval, §5.4 the embedding decision, §5.5 the scope predicate
- [ai-chatbot-tool-selection-eval.md](../post-mvp/ai-chatbot-tool-selection-eval.md) — tool selection's equivalent measurement, in the same shape
