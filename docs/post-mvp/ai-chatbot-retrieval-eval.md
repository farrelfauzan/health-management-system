# Retrieval Quality — Eval Set and Results (P15-T12)

Measures whether hybrid retrieval finds the document that answers a question,
per [ai-chatbot-tools.md](./ai-chatbot-tools.md) §5.2.

**The cross-lingual pairs are the point of this document.** §5.2 withdrew an
earlier recommendation to start with Postgres full-text search and adopted
pgvector on day one, on one specific ground: the corpus is Indonesian and
English, users ask in either language, and `tsvector` cannot bridge that at
any tuning effort because "chest pain" and "nyeri dada" share no lexeme. That
is an architecture decision resting on a claim about retrieval behaviour — and
**until the pairs below are run, the claim is untested and the decision is
unverified.**

## 1. Status: not yet run

> **No baseline exists.** The results table in §4 is empty on purpose. It is
> the honest state, not a placeholder to be filled with plausible numbers.
>
> Running it needs a pgvector `DATABASE_URL` **and a reachable Ollama with
> `bge-m3` pulled**. Neither is available in CI, and the local Ollama this was
> developed against has no models pulled, so the harness has been exercised
> only through its unit tests.

What **is** built and verified: the 13-case fixed question set and its
6-document fixture corpus
(`apps/api/src/modules/document-management/eval/retrieval-eval-set.ts`), the
scorer (`score-retrieval.ts`, 13 unit cases including derived checks that
every expected document exists in the corpus and that the cross-lingual flag
matches the fixture languages), and the runner
(`apps/api/src/scripts/run-retrieval-eval.ts`).

## 2. How to run it

```bash
DATABASE_URL=postgresql://... \
  pnpm --filter @hms/api exec ts-node src/scripts/run-retrieval-eval.ts
```

The script **seeds its own corpus and tears it down**. An evaluation run
against whatever documents happened to be in the database measures that
database rather than the retriever, and could not be compared against a run on
another machine.

Each fixture document is written as a single chunk: they are short enough that
chunking them would measure the splitter rather than the retrieval, and the
splitter has its own unit tests.

Runs on the **doctor channel**, so `DOCTOR`-visibility fixtures are reachable.
A patient-channel run would measure the visibility filter, which is proven
separately in `document-retrieval.integration.spec.ts`.

## 3. The metrics

| Metric | What it says |
| ------ | ------------ |
| **Recall** | An expected document appeared *anywhere* in the results. **The headline.** |
| Ranked first | An expected document was ranked first |
| MRR | Mean of `1 / best rank`, 0 on a miss |
| **Cross-lingual recall** | Recall over the cross-lingual cases only |
| Same-language recall | Recall over the rest, so the gap is readable |

**Recall leads because retrieval here feeds a generator, not a results page.**
A passage ranked third still reaches the model and can still ground the
answer; a passage never retrieved cannot. A change that trades rank for recall
is an improvement. Rank-first and MRR say how much prompt budget is being
spent to get there.

**Cross-lingual is scored separately, never averaged in.** An aggregate that
mixed them can hide a retriever that works only within a language — which is
exactly the failure vectors were chosen to avoid, and which would read as a
merely mediocre overall score.

## 4. Results

| Date | Embedding model | Recall | Ranked first | MRR | Cross-lingual recall | Same-language recall |
| ---- | --------------- | ------ | ------------ | --- | -------------------- | -------------------- |
| _not yet run_ | — | — | — | — | — | — |

**Proposed thresholds, to be confirmed against the first real run** rather
than treated as settled:

- **Cross-lingual recall ≥ 80%** — the hard gate. Below this the §5.2 decision
  has not paid for itself and the tradeoff should be re-argued rather than
  assumed.
- Overall recall ≥ 85%.
- MRR ≥ 0.6.
- Same-language recall should not exceed cross-lingual recall by more than
  ~15 points. A large gap means the embedding model is not doing the one job
  it was selected for, and `multilingual-e5-large` is the documented
  alternative to try before anything else changes.

This is also the baseline the four adoption triggers in §5.2 are judged
against over time — paraphrase gap, production zero-hit rate, corpus growth.

## 5. The set

13 cases over 6 fixture documents, checked in and changed deliberately.

- **5 same-language semantic cases**, including one whose answer sits in a
  topic-adjacent document (`id-rujukan-berlaku` is answered by the
  registration SOP, not the referral SOP) so a near-miss scores as one.
- **5 cross-lingual cases in both directions** — two ID→EN, three EN→ID.
  `x-id-to-en-nyeri-dada` is the case §5.2 was written for.
- **3 lexical cases** — a drug name with a strength, an ICD-10 mention, and a
  proper noun (`PCare`). These exist because a purely semantic set would pass
  even if the full-text half were silently dropped from the fusion, and §5.3
  is explicit that exact identifiers are where embeddings are weakest.

Every case carries a `rationale`, and the scorer's own specs assert the
fixture is self-consistent: no case expects a document nobody seeds, and the
`isCrossLingual` flag is checked against the fixture languages rather than
trusted, because it drives a headline metric.

## 6. Related documents

- [ai-chatbot-tools.md](./ai-chatbot-tools.md) §5.2–§5.4 — why vectors, why hybrid, why local embeddings
- [ai-chatbot-tool-selection-eval.md](./ai-chatbot-tool-selection-eval.md) — the tool track's equivalent measurement
- [implementation-plan.md](./implementation-plan.md) §10 — Phase 15 delivery tasks
