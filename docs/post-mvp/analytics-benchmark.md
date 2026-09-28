# Analytics query benchmark (P29-T03)

**Date:** 2026-09-28. **Ticket:** SJ-268. **PRD:** NFR-AN-01, goal G-3, risk R-2.

**Question.** Can the Sprint 1 analytics dashboards answer from the live tables, or do they need a nightly rollup table (R-2)?

**Answer.** They can answer from the live tables, with no new index.

Every dashboard request meets its gate on twelve months of clinic data:
- p95 must be under 1.5 s for 12 months, and under 400 ms for 30 days.
- The comparison period is included in every measured request.
- The slowest request, operations over 12 months filtered to one doctor, has a p95 of **87 ms**. That is about 17× under its gate.

The rollup fallback is not needed. Re-run this benchmark before building it.

## How to reproduce

The fixture and the runner are for **throwaway databases only**:
- The runner reads `ANALYTICS_BENCHMARK_DATABASE_URL`, never `DATABASE_URL`.
- It refuses any database whose name lacks `analytics_perf`.

```bash
docker run --rm -d --name hms-analytics-perf -e POSTGRES_PASSWORD=postgres \
  -p 127.0.0.1:55432:5432 pgvector/pgvector:pg16
docker exec hms-analytics-perf psql -U postgres -c "CREATE DATABASE hms_analytics_perf"
cd apps/api
export ANALYTICS_BENCHMARK_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/hms_analytics_perf
DATABASE_URL=$ANALYTICS_BENCHMARK_DATABASE_URL npx prisma migrate deploy
DATABASE_URL=$ANALYTICS_BENCHMARK_DATABASE_URL npx prisma db execute --file prisma/seed.sql
pnpm analytics:benchmark --seed --runs=20 --out=analytics-benchmark-report.md
docker stop hms-analytics-perf
```

The `--seed` step loads the fixture in about 7 s. Leave it off on later runs against the same database.

The later tickets that re-run this benchmark are T08, T11 and T12–T15. Each of them should:
- add its SQL to `src/scripts/analytics-benchmark-queries.ts`;
- update this page with the new numbers.

## Fixture

The fixture is `apps/api/prisma/fixtures/analytics-volume-fixture.sql`. It is deterministic (`setseed`) and loads in one transaction. It covers 1 October 2025 to 30 September 2026 in Asia/Jakarta.

| Table | Rows |
|---|---:|
| patient_profiles | 15 000 |
| appointments | 46 795 (≈40 000 attended, ≈7 000 no-show, cancelled or scheduled) |
| registrations | 52 000 (50 000 visits, 2 000 cancelled) |
| encounters | 50 000 (4 poli, 8 clinicians) |
| diagnoses | 63 583 |
| prescriptions | 35 085 |
| invoices | 60 000 |
| payments | 56 336 (one per paid invoice, which the schema requires) |
| lab_orders | 8 000 |
| satusehat_submissions | 50 000 |
| bpjs_submissions | 19 968 |

The database is 281 MB, larger than Postgres's default 128 MB `shared_buffers`.

## Method

**Environment.**
- pgvector/pgvector:pg16 in Docker on the development Mac, with default settings.
- A dashboard request means every query of that dashboard, run once for the range and once for its comparison period, which is what `compare=true` costs.

**Timed runs.**
- Each query runs the way `AnalyticsQueryRepository.runReadOnly` (P29-T02) runs it: `BEGIN READ ONLY`, a 10 s `statement_timeout`, and bound parameters.
- Each query gets 2 warm-up runs and then 20 timed runs. The percentiles are nearest-rank.
- Filters are measured three ways: none, one doctor, and one poli (General Practice).

**Cold start.**
- After `docker restart`, which empties Postgres's buffers, the two heaviest 12-month queries each ran once.
- Revenue took 58 ms and visits by doctor took 37 ms.
- That is about 2× their warm p95, still far inside the gate.

## Dashboard requests

| Dashboard | Range | Filter | p50 ms | p95 ms | Gate ms | Verdict |
|---|---|---|---:|---:|---:|---|
| operations | 30 days | none | 50.4 | 55.2 | < 400 | meets |
| operations | 30 days | one doctor | 39.3 | 43.6 | < 400 | meets |
| operations | 30 days | one poli | 42.5 | 43.8 | < 400 | meets |
| operations | 12 months | none | 75.6 | 77.9 | < 1500 | meets |
| operations | 12 months | one doctor | 85.7 | 87.0 | < 1500 | meets |
| operations | 12 months | one poli | 41.0 | 41.4 | < 1500 | meets |
| reporting | 30 days | none | 15.5 | 15.7 | < 400 | meets |
| reporting | 30 days | one doctor | 15.4 | 15.6 | < 400 | meets |
| reporting | 30 days | one poli | 15.4 | 15.9 | < 400 | meets |
| reporting | 12 months | none | 25.6 | 27.9 | < 1500 | meets |
| reporting | 12 months | one doctor | 25.3 | 25.9 | < 1500 | meets |
| reporting | 12 months | one poli | 25.6 | 27.7 | < 1500 | meets |
| finance | 30 days | none | 16.6 | 17.3 | < 400 | meets |
| finance | 30 days | one doctor | 16.6 | 17.3 | < 400 | meets |
| finance | 30 days | one poli | 16.8 | 18.8 | < 400 | meets |
| finance | 12 months | none | 28.3 | 29.4 | < 1500 | meets |
| finance | 12 months | one doctor | 27.9 | 28.5 | < 1500 | meets |
| finance | 12 months | one poli | 27.9 | 28.5 | < 1500 | meets |

## Per query

| Query | Range | Filter | p50 ms | p95 ms |
|---|---|---|---:|---:|
| visits-by-bucket-and-type | 30 days | none | 2.5 | 3.6 |
| new-vs-returning | 30 days | none | 8.9 | 10.3 |
| visits-by-poli | 30 days | none | 1.3 | 1.5 |
| visits-by-doctor | 30 days | none | 5.2 | 5.4 |
| appointment-outcomes | 30 days | none | 2.7 | 2.8 |
| booking-channel | 30 days | none | 2.9 | 3.0 |
| walk-in-visits | 30 days | none | 1.0 | 1.1 |
| satusehat-by-kind-and-status | 30 days | none | 2.5 | 2.6 |
| satusehat-oldest-pending | 30 days | none | 0.7 | 0.8 |
| bpjs-by-type-and-status | 30 days | none | 1.3 | 1.4 |
| finished-without-primary-diagnosis | 30 days | none | 3.2 | 3.4 |
| revenue-by-bucket-and-method | 30 days | none | 8.7 | 8.9 |
| visits-by-bucket-and-type | 30 days | one doctor | 2.6 | 2.7 |
| new-vs-returning | 30 days | one doctor | 6.9 | 6.9 |
| visits-by-poli | 30 days | one doctor | 2.1 | 2.2 |
| visits-by-doctor | 30 days | one doctor | 5.2 | 5.4 |
| appointment-outcomes | 30 days | one doctor | 0.5 | 0.6 |
| booking-channel | 30 days | one doctor | 0.5 | 0.8 |
| walk-in-visits | 30 days | one doctor | 1.7 | 1.8 |
| satusehat-by-kind-and-status | 30 days | one doctor | 2.5 | 2.6 |
| satusehat-oldest-pending | 30 days | one doctor | 0.7 | 0.8 |
| bpjs-by-type-and-status | 30 days | one doctor | 1.3 | 1.3 |
| finished-without-primary-diagnosis | 30 days | one doctor | 3.2 | 3.4 |
| revenue-by-bucket-and-method | 30 days | one doctor | 8.7 | 9.6 |
| visits-by-bucket-and-type | 30 days | one poli | 1.7 | 1.9 |
| new-vs-returning | 30 days | one poli | 6.5 | 6.9 |
| visits-by-poli | 30 days | one poli | 1.1 | 1.1 |
| visits-by-doctor | 30 days | one poli | 4.6 | 4.7 |
| appointment-outcomes | 30 days | one poli | 2.6 | 2.7 |
| booking-channel | 30 days | one poli | 2.6 | 2.7 |
| walk-in-visits | 30 days | one poli | 1.0 | 1.2 |
| satusehat-by-kind-and-status | 30 days | one poli | 2.4 | 2.5 |
| satusehat-oldest-pending | 30 days | one poli | 0.7 | 0.7 |
| bpjs-by-type-and-status | 30 days | one poli | 1.3 | 1.4 |
| finished-without-primary-diagnosis | 30 days | one poli | 3.2 | 3.3 |
| revenue-by-bucket-and-method | 30 days | one poli | 8.8 | 10.6 |
| visits-by-bucket-and-type | 12 months | none | 16.9 | 17.1 |
| new-vs-returning | 12 months | none | 19.4 | 19.9 |
| visits-by-poli | 12 months | none | 6.5 | 8.1 |
| visits-by-doctor | 12 months | none | 13.1 | 15.1 |
| appointment-outcomes | 12 months | none | 4.6 | 4.8 |
| booking-channel | 12 months | none | 7.1 | 7.2 |
| walk-in-visits | 12 months | none | 1.9 | 2.0 |
| satusehat-by-kind-and-status | 12 months | none | 5.5 | 5.6 |
| satusehat-oldest-pending | 12 months | none | 0.7 | 1.0 |
| bpjs-by-type-and-status | 12 months | none | 2.3 | 2.3 |
| finished-without-primary-diagnosis | 12 months | none | 8.4 | 9.2 |
| revenue-by-bucket-and-method | 12 months | none | 28.2 | 30.2 |
| visits-by-bucket-and-type | 12 months | one doctor | 15.6 | 16.3 |
| new-vs-returning | 12 months | one doctor | 23.7 | 25.2 |
| visits-by-poli | 12 months | one doctor | 13.4 | 13.9 |
| visits-by-doctor | 12 months | one doctor | 19.8 | 28.2 |
| appointment-outcomes | 12 months | one doctor | 1.2 | 1.2 |
| booking-channel | 12 months | one doctor | 1.5 | 1.6 |
| walk-in-visits | 12 months | one doctor | 8.2 | 8.7 |
| satusehat-by-kind-and-status | 12 months | one doctor | 5.5 | 5.6 |
| satusehat-oldest-pending | 12 months | one doctor | 0.7 | 0.8 |
| bpjs-by-type-and-status | 12 months | one doctor | 2.3 | 2.3 |
| finished-without-primary-diagnosis | 12 months | one doctor | 12.0 | 12.8 |
| revenue-by-bucket-and-method | 12 months | one doctor | 28.2 | 29.8 |
| visits-by-bucket-and-type | 12 months | one poli | 4.9 | 5.0 |
| new-vs-returning | 12 months | one poli | 11.6 | 11.9 |
| visits-by-poli | 12 months | one poli | 1.7 | 1.8 |
| visits-by-doctor | 12 months | one poli | 6.2 | 6.3 |
| appointment-outcomes | 12 months | one poli | 4.3 | 4.4 |
| booking-channel | 12 months | one poli | 5.1 | 5.2 |
| walk-in-visits | 12 months | one poli | 1.9 | 2.0 |
| satusehat-by-kind-and-status | 12 months | one poli | 5.5 | 5.6 |
| satusehat-oldest-pending | 12 months | one poli | 0.7 | 0.8 |
| bpjs-by-type-and-status | 12 months | one poli | 2.3 | 2.3 |
| finished-without-primary-diagnosis | 12 months | one poli | 12.2 | 12.5 |
| revenue-by-bucket-and-method | 12 months | one poli | 28.0 | 28.7 |

## Index decision: none added

The ticket allows an index only where a hot path does a sequential scan.

**12-month ranges.** Every sequential scan reads most of its table, because twelve months is the whole fixture. There a sequential scan is the correct plan, and an index would not be used.

**30-day ranges.** Four tables are still scanned whole:

| Scan | Why | Cost now (30 days) | Candidate index if it ever matters |
|---|---|---:|---|
| `appointments` | No index leads with `scheduled_at`. The existing ones lead with `status`, `doctor_id` or `booking_source`. | 2–3 ms | `appointments(scheduled_at)` |
| `satusehat_submissions` by `created_at` | No `created_at` index | 2 ms | `satusehat_submissions(created_at)` |
| `bpjs_submissions` by `created_at` | No `created_at` index | 1 ms | `bpjs_submissions(created_at)` |
| `invoices`, the hash side of revenue | The join reads every invoice to filter out `VOID` | ≈5 ms of 10 ms | Not needed. For a one-day range the planner already switches to a nested loop on the invoice primary key (checked with `EXPLAIN`). |

**Growth.**
- These scans grow with total history, not with the range.
- At five years, about 5× the fixture, the worst of them would be around 15 ms.
- That is still negligible next to the 400 ms gate, while every extra index costs on every write at the front desk.

**Already used as-is:** `registrations(status, registered_at)`, `encounters(status, started_at)`, `diagnoses_encounter_id_primary_key` (unique on `encounter_id` where the diagnosis is primary and not deleted), `payments(paid_at)` and `satusehat_submissions(status, next_attempt_at)`.

## Notes for the dashboard tickets

- **The "optional filter" pattern works.** The benchmark binds `$n::uuid IS NULL OR …` and got good plans, because node-postgres sends unnamed statements, so each execution is planned with its real values. If T04 switches to named or prepared statements, re-run the benchmark: a generic plan could stop using the indexes.
- **The doctor filter goes through the encounter.** On registration-based queries it is an `EXISTS` on `encounters.registration_id`, which is unique. It cost at most +14 ms over 12 months.
- **New vs returning** (`new-vs-returning`) finds each period patient's first visit ever. It reads the patients' whole history, so it is the query most sensitive to growth. Keep it on `registrations(patient_id, status)`.
- **Status pelaporan backlog.** The oldest-pending SATUSEHAT query is not bounded by the range: a backlog is current state, not history. It uses `satusehat_submissions(status, next_attempt_at)`.

## Plans, unfiltered variant

The plans for the one-doctor and one-poli variants are in the report the runner writes.

<details><summary>visits-by-bucket-and-type · 30 days · none</summary>

```
HashAggregate  (cost=2253.03..2333.99 rows=4048 width=16) (actual time=1.753..1.778 rows=88 loops=1)
  Group Key: date_trunc('day'::text, ((registered_at AT TIME ZONE 'UTC'::text) AT TIME ZONE 'Asia/Jakarta'::text)), type
  Batches: 1  Memory Usage: 217kB
  Buffers: shared hit=995
  ->  Bitmap Heap Scan on registrations r  (cost=176.72..2222.50 rows=4071 width=12) (actual time=0.178..1.466 rows=4027 loops=1)
        Recheck Cond: ((status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Filter: (deleted_at IS NULL)
        Heap Blocks: exact=957
        Buffers: shared hit=995
        ->  Bitmap Index Scan on registrations_status_registered_at_idx  (cost=0.00..175.71 rows=4071 width=0) (actual time=0.145..0.145 rows=4027 loops=1)
              Index Cond: ((status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
              Buffers: shared hit=38
Planning Time: 0.031 ms
Execution Time: 1.796 ms
```
</details>

<details><summary>new-vs-returning · 30 days · none</summary>

```
Aggregate  (cost=5463.98..5464.00 rows=1 width=8) (actual time=10.810..10.811 rows=1 loops=1)
  Buffers: shared hit=2939
  ->  HashAggregate  (cost=5078.78..5207.18 rows=12840 width=24) (actual time=10.489..10.703 rows=3344 loops=1)
        Group Key: v.patient_id
        Batches: 1  Memory Usage: 657kB
        Buffers: shared hit=2939
        ->  Hash Join  (cost=2283.37..5008.55 rows=14046 width=24) (actual time=1.512..9.002 rows=18217 loops=1)
              Hash Cond: (v.patient_id = r.patient_id)
              Buffers: shared hit=2939
              ->  Seq Scan on registrations v  (cost=0.00..2594.00 rows=49958 width=24) (actual time=0.157..4.176 rows=50000 loops=1)
                    Filter: ((deleted_at IS NULL) AND (status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])))
                    Rows Removed by Filter: 2000
                    Buffers: shared hit=1944
              ->  Hash  (cost=2238.24..2238.24 rows=3610 width=16) (actual time=1.351..1.352 rows=3344 loops=1)
                    Buckets: 4096  Batches: 1  Memory Usage: 189kB
                    Buffers: shared hit=995
                    ->  HashAggregate  (cost=2202.14..2238.24 rows=3610 width=16) (actual time=1.051..1.187 rows=3344 loops=1)
                          Group Key: r.patient_id
                          Batches: 1  Memory Usage: 369kB
                          Buffers: shared hit=995
                          ->  Bitmap Heap Scan on registrations r  (cost=176.72..2191.97 rows=4071 width=16) (actual time=0.174..0.692 rows=4027 loops=1)
                                Recheck Cond: ((status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
                                Filter: (deleted_at IS NULL)
                                Heap Blocks: exact=957
                                Buffers: shared hit=995
                                ->  Bitmap Index Scan on registrations_status_registered_at_idx  (cost=0.00..175.71 rows=4071 width=0) (actual time=0.144..0.144 rows=4027 loops=1)
                                      Index Cond: ((status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
                                      Buffers: shared hit=38
Planning Time: 0.068 ms
Execution Time: 10.842 ms
```
</details>

<details><summary>visits-by-poli · 30 days · none</summary>

```
HashAggregate  (cost=2212.32..2212.37 rows=4 width=20) (actual time=0.915..0.916 rows=4 loops=1)
  Group Key: specialty_id
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=995
  ->  Bitmap Heap Scan on registrations r  (cost=176.72..2191.97 rows=4071 width=16) (actual time=0.145..0.662 rows=4027 loops=1)
        Recheck Cond: ((status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Filter: (deleted_at IS NULL)
        Heap Blocks: exact=957
        Buffers: shared hit=995
        ->  Bitmap Index Scan on registrations_status_registered_at_idx  (cost=0.00..175.71 rows=4071 width=0) (actual time=0.117..0.117 rows=4027 loops=1)
              Index Cond: ((status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
              Buffers: shared hit=38
Planning Time: 0.021 ms
Execution Time: 0.921 ms
```
</details>

<details><summary>visits-by-doctor · 30 days · none</summary>

```
HashAggregate  (cost=4618.68..4618.78 rows=8 width=20) (actual time=6.537..6.538 rows=8 loops=1)
  Group Key: e.doctor_id
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=2720
  ->  Hash Join  (cost=2242.85..4599.11 rows=3914 width=16) (actual time=0.997..6.287 rows=4027 loops=1)
        Hash Cond: (e.registration_id = r.id)
        Buffers: shared hit=2720
        ->  Seq Scan on encounters e  (cost=0.00..2225.00 rows=50000 width=32) (actual time=0.111..2.782 rows=50000 loops=1)
              Filter: (deleted_at IS NULL)
              Buffers: shared hit=1725
        ->  Hash  (cost=2191.97..2191.97 rows=4071 width=16) (actual time=0.884..0.884 rows=4027 loops=1)
              Buckets: 4096  Batches: 1  Memory Usage: 221kB
              Buffers: shared hit=995
              ->  Bitmap Heap Scan on registrations r  (cost=176.72..2191.97 rows=4071 width=16) (actual time=0.143..0.684 rows=4027 loops=1)
                    Recheck Cond: ((status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
                    Filter: (deleted_at IS NULL)
                    Heap Blocks: exact=957
                    Buffers: shared hit=995
                    ->  Bitmap Index Scan on registrations_status_registered_at_idx  (cost=0.00..175.71 rows=4071 width=0) (actual time=0.115..0.116 rows=4027 loops=1)
                          Index Cond: ((status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
                          Buffers: shared hit=38
Planning:
  Buffers: shared hit=16
Planning Time: 0.056 ms
Execution Time: 6.546 ms
```
</details>

<details><summary>appointment-outcomes · 30 days · none</summary>

```
HashAggregate  (cost=2163.41..2163.46 rows=4 width=8) (actual time=2.192..2.192 rows=4 loops=1)
  Group Key: status
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=1443
  ->  Seq Scan on appointments a  (cost=0.00..2144.93 rows=3697 width=4) (actual time=0.073..1.978 rows=3755 loops=1)
        Filter: ((deleted_at IS NULL) AND (scheduled_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (scheduled_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Rows Removed by Filter: 43040
        Buffers: shared hit=1443
Planning Time: 0.022 ms
Execution Time: 2.196 ms
```
</details>

<details><summary>booking-channel · 30 days · none</summary>

```
HashAggregate  (cost=2218.87..2286.25 rows=2995 width=44) (actual time=2.419..2.428 rows=4 loops=1)
  Group Key: CASE WHEN (bpjs_booking_code IS NOT NULL) THEN 'MOBILE_JKN'::text WHEN (booking_source IS NULL) THEN 'STAFF'::text ELSE (booking_source)::text END
  Batches: 1  Memory Usage: 121kB
  Buffers: shared hit=1443
  ->  Seq Scan on appointments a  (cost=0.00..2163.41 rows=3697 width=36) (actual time=0.069..2.114 rows=3755 loops=1)
        Filter: ((deleted_at IS NULL) AND (scheduled_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (scheduled_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Rows Removed by Filter: 43040
        Buffers: shared hit=1443
Planning Time: 0.027 ms
Execution Time: 2.434 ms
```
</details>

<details><summary>walk-in-visits · 30 days · none</summary>

```
Aggregate  (cost=2193.56..2193.57 rows=1 width=4) (actual time=0.595..0.595 rows=1 loops=1)
  Buffers: shared hit=995
  ->  Bitmap Heap Scan on registrations r  (cost=175.94..2191.18 rows=950 width=0) (actual time=0.143..0.572 rows=832 loops=1)
        Recheck Cond: ((status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Filter: ((deleted_at IS NULL) AND (appointment_id IS NULL))
        Rows Removed by Filter: 3195
        Heap Blocks: exact=957
        Buffers: shared hit=995
        ->  Bitmap Index Scan on registrations_status_registered_at_idx  (cost=0.00..175.71 rows=4071 width=0) (actual time=0.115..0.115 rows=4027 loops=1)
              Index Cond: ((status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
              Buffers: shared hit=38
Planning Time: 0.018 ms
Execution Time: 0.599 ms
```
</details>

<details><summary>satusehat-by-kind-and-status · 30 days · none</summary>

```
HashAggregate  (cost=1494.86..1494.89 rows=3 width=12) (actual time=2.135..2.135 rows=3 loops=1)
  Group Key: kind, status
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=715
  ->  Seq Scan on satusehat_submissions s  (cost=0.00..1465.00 rows=3981 width=8) (actual time=0.001..1.880 rows=4027 loops=1)
        Filter: ((created_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (created_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Rows Removed by Filter: 45973
        Buffers: shared hit=715
Planning:
  Buffers: shared hit=9
Planning Time: 0.018 ms
Execution Time: 2.139 ms
```
</details>

<details><summary>satusehat-oldest-pending · 30 days · none</summary>

```
HashAggregate  (cost=786.89..786.90 rows=1 width=16) (actual time=0.380..0.380 rows=1 loops=1)
  Group Key: kind
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=641
  ->  Bitmap Heap Scan on satusehat_submissions s  (cost=43.35..776.19 rows=1427 width=12) (actual time=0.045..0.290 rows=1493 loops=1)
        Recheck Cond: (status = 'PENDING'::"SatusehatSubmissionStatus")
        Heap Blocks: exact=632
        Buffers: shared hit=641
        ->  Bitmap Index Scan on satusehat_submissions_status_next_attempt_at_idx  (cost=0.00..42.99 rows=1427 width=0) (actual time=0.028..0.028 rows=1493 loops=1)
              Index Cond: (status = 'PENDING'::"SatusehatSubmissionStatus")
              Buffers: shared hit=9
Planning:
  Buffers: shared hit=3
Planning Time: 0.014 ms
Execution Time: 0.385 ms
```
</details>

<details><summary>bpjs-by-type-and-status · 30 days · none</summary>

```
HashAggregate  (cost=596.76..596.83 rows=6 width=12) (actual time=0.892..0.892 rows=6 loops=1)
  Group Key: type, status
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=285
  ->  Seq Scan on bpjs_submissions b  (cost=0.00..584.52 rows=1632 width=8) (actual time=0.002..0.785 rows=1622 loops=1)
        Filter: ((created_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (created_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Rows Removed by Filter: 18346
        Buffers: shared hit=285
Planning:
  Buffers: shared hit=3
Planning Time: 0.015 ms
Execution Time: 0.896 ms
```
</details>

<details><summary>finished-without-primary-diagnosis · 30 days · none</summary>

```
Aggregate  (cost=5143.87..5143.88 rows=1 width=4) (actual time=4.570..4.570 rows=1 loops=1)
  Buffers: shared hit=1403
  ->  Merge Right Anti Join  (cost=2201.24..5141.55 rows=929 width=0) (actual time=0.946..4.566 rows=128 loops=1)
        Merge Cond: (d.encounter_id = e.id)
        Buffers: shared hit=1403
        ->  Index Only Scan using diagnoses_encounter_id_primary_key on diagnoses d  (cost=0.41..2784.32 rows=48527 width=16) (actual time=0.001..1.891 rows=48559 loops=1)
              Heap Fetches: 0
              Buffers: shared hit=512
        ->  Sort  (cost=2186.34..2196.15 rows=3924 width=16) (actual time=0.902..1.006 rows=3903 loops=1)
              Sort Key: e.id
              Sort Method: quicksort  Memory: 188kB
              Buffers: shared hit=891
              ->  Bitmap Heap Scan on encounters e  (cost=158.45..1952.12 rows=3924 width=16) (actual time=0.167..0.639 rows=3903 loops=1)
                    Recheck Cond: ((status = 'FINISHED'::"EncounterStatus") AND (started_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (started_at < '2026-09-30 17:00:00'::timestamp without time zone))
                    Filter: (deleted_at IS NULL)
                    Heap Blocks: exact=861
                    Buffers: shared hit=891
                    ->  Bitmap Index Scan on encounters_status_started_at_idx  (cost=0.00..157.47 rows=3924 width=0) (actual time=0.133..0.133 rows=3903 loops=1)
                          Index Cond: ((status = 'FINISHED'::"EncounterStatus") AND (started_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (started_at < '2026-09-30 17:00:00'::timestamp without time zone))
                          Buffers: shared hit=30
Planning:
  Buffers: shared hit=16
Planning Time: 0.051 ms
Execution Time: 4.576 ms
```
</details>

<details><summary>revenue-by-bucket-and-method · 30 days · none</summary>

```
HashAggregate  (cost=5166.13..5266.32 rows=4453 width=48) (actual time=9.791..9.823 rows=120 loops=1)
  Group Key: date_trunc('day'::text, ((p.paid_at AT TIME ZONE 'UTC'::text) AT TIME ZONE 'Asia/Jakarta'::text)), p.method
  Batches: 1  Memory Usage: 273kB
  Buffers: shared hit=3079
  ->  Hash Join  (cost=2001.90..5121.60 rows=4453 width=18) (actual time=7.760..9.380 rows=4567 loops=1)
        Hash Cond: (i.id = p.invoice_id)
        Buffers: shared hit=3079
        ->  Seq Scan on invoices i  (cost=0.00..2932.00 rows=58778 width=16) (actual time=0.171..4.762 rows=58768 loops=1)
              Filter: ((deleted_at IS NULL) AND (status <> 'VOID'::"InvoiceStatus"))
              Rows Removed by Filter: 1232
              Buffers: shared hit=2182
        ->  Hash  (cost=1945.08..1945.08 rows=4546 width=34) (actual time=1.012..1.012 rows=4567 loops=1)
              Buckets: 8192  Batches: 1  Memory Usage: 363kB
              Buffers: shared hit=897
              ->  Bitmap Heap Scan on payments p  (cost=142.89..1945.08 rows=4546 width=34) (actual time=0.167..0.711 rows=4567 loops=1)
                    Recheck Cond: ((paid_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (paid_at < '2026-09-30 17:00:00'::timestamp without time zone))
                    Heap Blocks: exact=866
                    Buffers: shared hit=897
                    ->  Bitmap Index Scan on payments_paid_at_idx  (cost=0.00..141.75 rows=4546 width=0) (actual time=0.134..0.135 rows=4567 loops=1)
                          Index Cond: ((paid_at >= '2026-08-31 17:00:00'::timestamp without time zone) AND (paid_at < '2026-09-30 17:00:00'::timestamp without time zone))
                          Buffers: shared hit=31
Planning:
  Buffers: shared hit=19
Planning Time: 0.072 ms
Execution Time: 9.837 ms
```
</details>

<details><summary>visits-by-bucket-and-type · 12 months · none</summary>

```
HashAggregate  (cost=3603.22..4493.30 rows=44504 width=16) (actual time=17.864..18.010 rows=36 loops=1)
  Group Key: date_trunc('month'::text, ((registered_at AT TIME ZONE 'UTC'::text) AT TIME ZONE 'Asia/Jakarta'::text)), type
  Batches: 1  Memory Usage: 1561kB
  Buffers: shared hit=1944
  ->  Seq Scan on registrations r  (cost=0.00..3228.61 rows=49948 width=12) (actual time=0.115..14.525 rows=50000 loops=1)
        Filter: ((deleted_at IS NULL) AND (status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2025-09-30 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Rows Removed by Filter: 2000
        Buffers: shared hit=1944
Planning Time: 0.026 ms
Execution Time: 18.025 ms
```
</details>

<details><summary>new-vs-returning · 12 months · none</summary>

```
Aggregate  (cost=6627.94..6627.96 rows=1 width=8) (actual time=25.233..25.234 rows=1 loops=1)
  Buffers: shared hit=3888
  ->  HashAggregate  (cost=6242.74..6371.14 rows=12840 width=24) (actual time=24.027..24.808 rows=13874 loops=1)
        Group Key: v.patient_id
        Batches: 1  Memory Usage: 1809kB
        Buffers: shared hit=3888
        ->  Hash Join  (cost=3267.77..5992.95 rows=49958 width=24) (actual time=10.411..19.055 rows=50000 loops=1)
              Hash Cond: (v.patient_id = r.patient_id)
              Buffers: shared hit=3888
              ->  Seq Scan on registrations v  (cost=0.00..2594.00 rows=49958 width=24) (actual time=0.140..4.280 rows=50000 loops=1)
                    Filter: ((deleted_at IS NULL) AND (status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])))
                    Rows Removed by Filter: 2000
                    Buffers: shared hit=1944
              ->  Hash  (cost=3107.27..3107.27 rows=12840 width=16) (actual time=10.270..10.270 rows=13874 loops=1)
                    Buckets: 16384  Batches: 1  Memory Usage: 779kB
                    Buffers: shared hit=1944
                    ->  HashAggregate  (cost=2978.87..3107.27 rows=12840 width=16) (actual time=8.865..9.585 rows=13874 loops=1)
                          Group Key: r.patient_id
                          Batches: 1  Memory Usage: 1553kB
                          Buffers: shared hit=1944
                          ->  Seq Scan on registrations r  (cost=0.00..2854.00 rows=49948 width=16) (actual time=0.064..4.493 rows=50000 loops=1)
                                Filter: ((deleted_at IS NULL) AND (status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2025-09-30 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
                                Rows Removed by Filter: 2000
                                Buffers: shared hit=1944
Planning Time: 0.081 ms
Execution Time: 25.292 ms
```
</details>

<details><summary>visits-by-poli · 12 months · none</summary>

```
HashAggregate  (cost=3103.74..3103.79 rows=4 width=20) (actual time=7.667..7.667 rows=4 loops=1)
  Group Key: specialty_id
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=1944
  ->  Seq Scan on registrations r  (cost=0.00..2854.00 rows=49948 width=16) (actual time=0.095..4.795 rows=50000 loops=1)
        Filter: ((deleted_at IS NULL) AND (status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2025-09-30 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Rows Removed by Filter: 2000
        Buffers: shared hit=1944
Planning Time: 0.021 ms
Execution Time: 7.676 ms
```
</details>

<details><summary>visits-by-doctor · 12 months · none</summary>

```
HashAggregate  (cost=6075.26..6075.36 rows=8 width=20) (actual time=17.942..17.944 rows=8 loops=1)
  Group Key: e.doctor_id
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=3669
  ->  Hash Join  (cost=2850.00..5835.12 rows=48027 width=16) (actual time=5.972..14.951 rows=50000 loops=1)
        Hash Cond: (r.id = e.registration_id)
        Buffers: shared hit=3669
        ->  Seq Scan on registrations r  (cost=0.00..2854.00 rows=49948 width=16) (actual time=0.158..4.831 rows=50000 loops=1)
              Filter: ((deleted_at IS NULL) AND (status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2025-09-30 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
              Rows Removed by Filter: 2000
              Buffers: shared hit=1944
        ->  Hash  (cost=2225.00..2225.00 rows=50000 width=32) (actual time=5.809..5.809 rows=50000 loops=1)
              Buckets: 65536  Batches: 1  Memory Usage: 3637kB
              Buffers: shared hit=1725
              ->  Seq Scan on encounters e  (cost=0.00..2225.00 rows=50000 width=32) (actual time=0.127..3.188 rows=50000 loops=1)
                    Filter: (deleted_at IS NULL)
                    Buffers: shared hit=1725
Planning:
  Buffers: shared hit=16
Planning Time: 0.066 ms
Execution Time: 17.954 ms
```
</details>

<details><summary>appointment-outcomes · 12 months · none</summary>

```
HashAggregate  (cost=2378.86..2378.91 rows=4 width=8) (actual time=5.792..5.793 rows=4 loops=1)
  Group Key: status
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=1443
  ->  Seq Scan on appointments a  (cost=0.00..2144.93 rows=46786 width=4) (actual time=0.077..3.179 rows=46795 loops=1)
        Filter: ((deleted_at IS NULL) AND (scheduled_at >= '2025-09-30 17:00:00'::timestamp without time zone) AND (scheduled_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Buffers: shared hit=1443
Planning Time: 0.026 ms
Execution Time: 5.797 ms
```
</details>

<details><summary>booking-channel · 12 months · none</summary>

```
HashAggregate  (cost=3080.65..3245.32 rows=7319 width=44) (actual time=8.272..8.289 rows=4 loops=1)
  Group Key: CASE WHEN (bpjs_booking_code IS NOT NULL) THEN 'MOBILE_JKN'::text WHEN (booking_source IS NULL) THEN 'STAFF'::text ELSE (booking_source)::text END
  Batches: 1  Memory Usage: 217kB
  Buffers: shared hit=1443
  ->  Seq Scan on appointments a  (cost=0.00..2378.86 rows=46786 width=36) (actual time=0.078..4.733 rows=46795 loops=1)
        Filter: ((deleted_at IS NULL) AND (scheduled_at >= '2025-09-30 17:00:00'::timestamp without time zone) AND (scheduled_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Buffers: shared hit=1443
Planning Time: 0.028 ms
Execution Time: 8.296 ms
```
</details>

<details><summary>walk-in-visits · 12 months · none</summary>

```
Aggregate  (cost=2711.90..2711.91 rows=1 width=4) (actual time=1.783..1.783 rows=1 loops=1)
  Buffers: shared hit=1025
  ->  Bitmap Heap Scan on registrations r  (cost=526.36..2682.75 rows=11658 width=0) (actual time=0.169..1.505 rows=10205 loops=1)
        Recheck Cond: (appointment_id IS NULL)
        Filter: ((deleted_at IS NULL) AND (status = ANY ('{CHECKED_IN,COMPLETED}'::"RegistrationStatus"[])) AND (registered_at >= '2025-09-30 17:00:00'::timestamp without time zone) AND (registered_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Rows Removed by Filter: 2000
        Heap Blocks: exact=1010
        Buffers: shared hit=1025
        ->  Bitmap Index Scan on registrations_appointment_id_key  (cost=0.00..523.44 rows=12137 width=0) (actual time=0.126..0.126 rows=12205 loops=1)
              Index Cond: (appointment_id IS NULL)
              Buffers: shared hit=15
Planning Time: 0.019 ms
Execution Time: 1.787 ms
```
</details>

<details><summary>satusehat-by-kind-and-status · 12 months · none</summary>

```
HashAggregate  (cost=1839.92..1839.96 rows=3 width=12) (actual time=6.754..6.754 rows=3 loops=1)
  Group Key: kind, status
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=715
  ->  Seq Scan on satusehat_submissions s  (cost=0.00..1465.00 rows=49990 width=8) (actual time=0.001..3.597 rows=50000 loops=1)
        Filter: ((created_at >= '2025-09-30 17:00:00'::timestamp without time zone) AND (created_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Buffers: shared hit=715
Planning:
  Buffers: shared hit=9
Planning Time: 0.018 ms
Execution Time: 6.758 ms
```
</details>

<details><summary>satusehat-oldest-pending · 12 months · none</summary>

```
HashAggregate  (cost=786.89..786.90 rows=1 width=16) (actual time=0.379..0.380 rows=1 loops=1)
  Group Key: kind
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=641
  ->  Bitmap Heap Scan on satusehat_submissions s  (cost=43.35..776.19 rows=1427 width=12) (actual time=0.047..0.289 rows=1493 loops=1)
        Recheck Cond: (status = 'PENDING'::"SatusehatSubmissionStatus")
        Heap Blocks: exact=632
        Buffers: shared hit=641
        ->  Bitmap Index Scan on satusehat_submissions_status_next_attempt_at_idx  (cost=0.00..42.99 rows=1427 width=0) (actual time=0.029..0.029 rows=1493 loops=1)
              Index Cond: (status = 'PENDING'::"SatusehatSubmissionStatus")
              Buffers: shared hit=9
Planning:
  Buffers: shared hit=3
Planning Time: 0.015 ms
Execution Time: 0.385 ms
```
</details>

<details><summary>bpjs-by-type-and-status · 12 months · none</summary>

```
HashAggregate  (cost=734.25..734.32 rows=6 width=12) (actual time=2.470..2.470 rows=6 loops=1)
  Group Key: type, status
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=285
  ->  Seq Scan on bpjs_submissions b  (cost=0.00..584.52 rows=19964 width=8) (actual time=0.001..1.200 rows=19968 loops=1)
        Filter: ((created_at >= '2025-09-30 17:00:00'::timestamp without time zone) AND (created_at < '2026-09-30 17:00:00'::timestamp without time zone))
        Buffers: shared hit=285
Planning:
  Buffers: shared hit=3
Planning Time: 0.014 ms
Execution Time: 2.474 ms
```
</details>

<details><summary>finished-without-primary-diagnosis · 12 months · none</summary>

```
Finalize Aggregate  (cost=6234.73..6234.74 rows=1 width=4) (actual time=8.857..9.773 rows=1 loops=1)
  Buffers: shared hit=3775
  ->  Gather  (cost=6234.62..6234.73 rows=1 width=8) (actual time=8.795..9.771 rows=2 loops=1)
        Workers Planned: 1
        Workers Launched: 1
        Buffers: shared hit=3775
        ->  Partial Aggregate  (cost=5234.62..5234.63 rows=1 width=8) (actual time=8.297..8.297 rows=1 loops=2)
              Buffers: shared hit=3775
              ->  Parallel Hash Anti Join  (cost=2811.33..5217.75 rows=6746 width=0) (actual time=4.201..8.274 rows=697 loops=2)
                    Hash Cond: (e.id = d.encounter_id)
                    Buffers: shared hit=3775
                    ->  Parallel Seq Scan on encounters e  (cost=0.00..2239.71 rows=28491 width=16) (actual time=0.162..2.191 rows=24240 loops=2)
                          Filter: ((deleted_at IS NULL) AND (started_at >= '2025-09-30 17:00:00'::timestamp without time zone) AND (started_at < '2026-09-30 17:00:00'::timestamp without time zone) AND (status = 'FINISHED'::"EncounterStatus"))
                          Rows Removed by Filter: 760
                          Buffers: shared hit=1725
                    ->  Parallel Hash  (cost=2454.52..2454.52 rows=28545 width=16) (actual time=3.931..3.931 rows=24283 loops=2)
                          Buckets: 65536  Batches: 1  Memory Usage: 2816kB
                          Buffers: shared hit=1987
                          ->  Parallel Seq Scan on diagnoses d  (cost=0.00..2454.52 rows=28545 width=16) (actual time=0.103..2.456 rows=24283 loops=2)
                                Filter: ((deleted_at IS NULL) AND (type = 'PRIMARY'::"DiagnosisType"))
                                Rows Removed by Filter: 7508
                                Buffers: shared hit=1987
Planning:
  Buffers: shared hit=16
Planning Time: 0.087 ms
Execution Time: 9.781 ms
```
</details>

<details><summary>revenue-by-bucket-and-method · 12 months · none</summary>

```
HashAggregate  (cost=11026.12..12577.14 rows=40190 width=48) (actual time=35.933..36.011 rows=48 loops=1)
  Group Key: date_trunc('month'::text, ((p.paid_at AT TIME ZONE 'UTC'::text) AT TIME ZONE 'Asia/Jakarta'::text)), p.method
  Planned Partitions: 4  Batches: 1  Memory Usage: 817kB
  Buffers: shared hit=3916
  ->  Hash Join  (cost=3283.24..6783.46 rows=55189 width=18) (actual time=9.208..30.812 rows=56336 loops=1)
        Hash Cond: (i.id = p.invoice_id)
        Buffers: shared hit=3916
        ->  Seq Scan on invoices i  (cost=0.00..2932.00 rows=58778 width=16) (actual time=0.198..5.654 rows=58768 loops=1)
              Filter: ((deleted_at IS NULL) AND (status <> 'VOID'::"InvoiceStatus"))
              Rows Removed by Filter: 1232
              Buffers: shared hit=2182
        ->  Hash  (cost=2579.04..2579.04 rows=56336 width=34) (actual time=9.002..9.002 rows=56336 loops=1)
              Buckets: 65536  Batches: 1  Memory Usage: 4199kB
              Buffers: shared hit=1734
              ->  Seq Scan on payments p  (cost=0.00..2579.04 rows=56336 width=34) (actual time=0.158..4.451 rows=56336 loops=1)
                    Filter: ((paid_at >= '2025-09-30 17:00:00'::timestamp without time zone) AND (paid_at < '2026-09-30 17:00:00'::timestamp without time zone))
                    Buffers: shared hit=1734
Planning:
  Buffers: shared hit=22
Planning Time: 0.107 ms
Execution Time: 36.033 ms
```
</details>

