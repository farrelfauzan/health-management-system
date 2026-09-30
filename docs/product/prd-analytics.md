# PRD — Analytics

Sep 27, 2026 · @Farrel Fauzan

Analytics (phase **P29**) gives the clinic owner and admin one place to see how the clinic is running — visits, revenue, pharmacy, lab, payer mix and reporting health — computed from records MetaKlinik already keeps, with no new data entry.

|  |  |
| --- | --- |
| Status | Accepted — built in Sprints 37–39 (SJ-266..282); Q-1 to Q-3 answered |
| Target | P29, after P28 (session reschedule) |
| Feature key | `analytics` (new entry in the feature-entitlement catalogue) |
| Stakeholders | Product owner, clinic owner / admin (pilot clinics), engineering |

## 1. Problem and goals

Today a clinic owner cannot answer "how was last month?" inside MetaKlinik. The admin dashboard shows four live counters for today only, one of its cards carries a hard-coded specialty breakdown, and the Recent Activity feed is dummy data. Two invented analytics cards on the patients page were already removed after pilot testers mistook them for real numbers (P19-T07).

The data exists but is scattered across single-purpose reports: the daily cashier report (one day, cash drawer only), the maternal cohort reports (Kohort Ibu/Bayi/KB, monthly KIA), the BPJS non-capitation recap and the tax reports. The workaround is exporting lists and counting in a spreadsheet, which is slow, error-prone and leaks patient rows into files outside the system.

| ID | Goal | Metric | Target |
| --- | --- | --- | --- |
| G-1 | Owner sees the month at a glance | Time to answer "visits and revenue last month vs the month before" | Under 30 s, zero exports |
| G-2 | Numbers match the source screens | Analytics totals vs cashier report / invoice list for the same period | 100% match on seeded fixtures; 0 reconciliation bugs in pilot |
| G-3 | Dashboards load fast on a small clinic server | p95 API latency for a 12-month range | Under 1.5 s on 50k encounters |
| G-4 | No patient data leaves through analytics | Rows identifying a patient in any analytics response or export | 0 (aggregates only) |
| G-5 | Pilot clinics actually use it | Weekly active viewers among ADMIN users | At least 1 per clinic per week by 4 weeks after release |

## 2. Users and access

The seeded roles are `SUPER_ADMIN`, `ADMIN`, `DOCTOR`, `MIDWIFE`, `PHARMACIST`, `LAB_TECHNICIAN` and `PATIENT`; there is no owner or cashier role, so the clinic owner uses `ADMIN`. Each dashboard gets its own permission key so a clinic can hand finance to one person and pharmacy to another.

| Permission key (new) | Dashboard | ADMIN | DOCTOR / MIDWIFE | PHARMACIST | LAB\_TECHNICIAN | SUPER\_ADMIN |
| --- | --- | --- | --- | --- | --- | --- |
| `analytics.read-operations:any` | Visits and flow | Yes | — | — | — | Yes |
| `analytics.read-finance:any` | Revenue and payers | Yes | — | — | — | Yes |
| `analytics.read-clinical:any` | Case mix (aggregates) | Yes | — | — | — | No |
| `analytics.read-pharmacy:any` | Pharmacy | Yes | — | Yes | — | Yes |
| `analytics.read-lab:any` | Laboratory | Yes | — | — | Yes | Yes |
| `analytics.read-practice:own` | My practice | — | Yes | — | — | No |
| `analytics.export:any` | CSV export of any dashboard the user can read | Yes | — | — | — | No |

- **Aggregates only.** No analytics endpoint returns a patient name, MRN, NIK or record id, and no chart drills down to a patient list. Drilling into records stays on the existing screens, under their own permissions.
- **Case mix is not the clinical record.** D-033 restricts record *content* to examining clinicians. Clinic-wide counts of ICD-10 codes are not a patient's record, but a count of 1 in a small clinic can identify someone, so every clinical cell under 5 is shown as "<5" (see NFR-AN-03). `SUPER_ADMIN` is left out of clinical and export keys, consistent with D-033.
- **`:own` trap.** `SUPER_ADMIN` is built as a union of the catalogue, and an `:own` key shadows `:any` (PR #424). The practice key is `:own` only and must not reach `SUPER_ADMIN`.
- **Web allowlist.** Each new action must be added to the web `SUPPORTED_ACTIONS` list and the `ADMIN` preset, or the menu entry never renders.

## 3. Scope

In scope for P29:

- A new **Analytics** area at `/admin/analytics` with six dashboards (operations, finance, case mix, pharmacy, laboratory, reporting health) plus a **My practice** view for clinicians.
- A shared filter bar: date range (presets: today, 7 days, this month, last month, 3/6/12 months, custom up to 24 months), compare to the previous period, poli, doctor, payer.
- Period-over-period deltas on every headline number.
- CSV export of each dashboard's aggregate tables.
- Replacing the dashboard's hard-coded specialty breakdown and dummy Recent Activity feed with real data.

Non-goals (and where they may come back):

- **Cross-clinic or platform analytics.** One deployment is one clinic today; multi-tenancy is still a proposal. Platform analytics would be an ETL job into a warehouse (multi-tenancy doc).
- **A data warehouse or BI tool** (Metabase, Superset). Postgres aggregates are enough at single-clinic volume; revisit if G-3 fails.
- **Custom report builder or saved queries.** Fixed dashboards first; learn from pilot usage.
- **Forecasting, AI insights, anomaly alerts.** Could reuse the AI assistant later; not in P29.
- **Regulatory reports** (SP2TP/LB1, RL, Kohort). The maternal reports and tax reports already own their formats; analytics links to them and does not re-implement them.
- **Scheduled email/WhatsApp digests.** Could build on the notification module in a later phase.
- **Patient-level drill-down** of any kind (G-4).

## 4. Metric catalogue

Every metric below is computed from a column that exists on `main` today, except payer mix, which needs the new `Registration.payerType` (FR-FDN-08). Nothing on Registration, Encounter or Invoice records BPJS vs general vs insurance; the only proxies are a BPJS number on the patient, BPJS submission rows and `PaymentMethod.INSURANCE`.

Conventions: a **visit** is a `Registration` in `CHECKED_IN` or `COMPLETED`, bucketed by `registeredAt`; **revenue** is `Payment.amount` bucketed by `Payment.paidAt` (there is no `paidAt` on Invoice); all buckets use the clinic's local calendar (NFR-AN-04).

### 4.1 Operations — visits and flow (`analytics.read-operations:any`)

| ID | Metric | Definition | Priority |
| --- | --- | --- | --- |
| FR-OPS-01 | Visits | Count of visits per bucket, split by `Registration.type` (consultation, lab only, admission) | MUST |
| FR-OPS-02 | New vs returning patients | New = the patient's first visit ever falls in the period | MUST |
| FR-OPS-03 | Visits by poli and by doctor | Poli from `Registration.specialtyId`; doctor from `Encounter.doctorId` | MUST |
| FR-OPS-04 | Appointment outcomes | `Appointment` by status on `scheduledAt`; no-show rate = NO\_SHOW / (COMPLETED + NO\_SHOW) | MUST |
| FR-OPS-05 | Booking channel | Staff (`bookingSource` null), WhatsApp, Telegram, Mobile JKN (`bpjsBookingCode` set), walk-in (visit without appointment) | SHOULD |
| FR-OPS-06 | Session utilisation | Booked appointments / `AppointmentSession.maxPatients`, sessions with a cap only; moved and cancelled sessions from `AppointmentSessionChange` | SHOULD |
| FR-OPS-07 | Wait and consult time | Median and p90 of `checkedInAt → Encounter.startedAt` and `startedAt → endedAt`; intervals over 8 h are excluded and counted | SHOULD |
| FR-OPS-08 | Busiest hours | Check-ins by weekday × local hour (heatmap) | COULD |
| FR-OPS-09 | Inpatient | Admissions, discharges, average length of stay, bed occupancy % (occupied bed-days from `BedAssignment` / bed-days available), discharge disposition. Shown only when `room-management` is on | SHOULD |
| FR-OPS-10 | Demographics | Visiting patients by sex × age band (0–4, 5–14, 15–24, 25–44, 45–64, 65+) and top 10 regencies; cells under 5 hidden | COULD |

### 4.2 Finance — revenue and payers (`analytics.read-finance:any`)

| ID | Metric | Definition | Priority |
| --- | --- | --- | --- |
| FR-FIN-01 | Revenue | Issued and paid invoices per bucket by invoice date (Q-3); cash received is shown beside it by payment date, and one day of cash equals the cashier report for that day (NFR-AN-05) | MUST |
| FR-FIN-02 | By payment method | Cash, transfer, QRIS, insurance | MUST |
| FR-FIN-03 | By item type | Issued and paid invoices' `InvoiceItem.amount` by type (consultation, procedure, medication, accommodation, lab, other); tax shown separately from `taxAmount` | MUST |
| FR-FIN-04 | By doctor and poli | Same attribution as the cashier report, including its unattributed bucket | MUST |
| FR-FIN-05 | Outstanding invoices | `ISSUED` invoices: count, total, aged 0–7 / 8–30 / over 30 days from `issuedAt` | MUST |
| FR-FIN-06 | Revenue per visit | Revenue / visits with a paid invoice | SHOULD |
| FR-FIN-07 | Payer mix | Visits and revenue by `payerType` (general, BPJS, insurance, not recorded) | SHOULD |
| FR-FIN-08 | Voids | Count and value of `VOID` invoices by `voidedAt` | SHOULD |
| FR-FIN-09 | Top services | Top 10 service tariffs by revenue | COULD |
| FR-FIN-10 | Clinician fees | Gross fee and clinic share per doctor per month from `ClinicianFeeEntry` (accruals minus reversals) | COULD |

### 4.3 Case mix (`analytics.read-clinical:any`)

| ID | Metric | Definition | Priority |
| --- | --- | --- | --- |
| FR-CLN-01 | Top diagnoses | Top 10 primary ICD-10 codes by finished encounters, with share of total | MUST |
| FR-CLN-02 | Coding completeness | % of finished encounters with a primary ICD-10 diagnosis — the gap that blocks SATUSEHAT and BPJS submissions | MUST |
| FR-CLN-03 | By ICD-10 category | Encounters grouped by `Icd10Code.category` | SHOULD |
| FR-CLN-04 | Top procedures | Top 10 ICD-9-CM codes | SHOULD |
| FR-CLN-05 | Diagnosis trend | Weekly count for up to 3 chosen ICD-10 codes (e.g. seasonal dengue or diarrhoea) | COULD |
| FR-CLN-06 | Maternal headline | K1, K4 and deliveries for the period, taken from the existing monthly KIA report service and linking to it. Only when `maternal-care` is on | COULD |

### 4.4 Pharmacy (`analytics.read-pharmacy:any`)

| ID | Metric | Definition | Priority |
| --- | --- | --- | --- |
| FR-PHR-01 | Prescription flow | Issued, dispensed, partly dispensed, cancelled; median issue → dispense time | MUST |
| FR-PHR-02 | Top medications | Top 20 by dispensed quantity (`DispenseItem.quantity` on `DISPENSED` records) | MUST |
| FR-PHR-03 | Stock health (now) | Medications at or below `reorderLevel` (stock = sum of `remainingQuantity`); batches expiring in 30/60/90 days, reusing the expiry report | MUST |
| FR-PHR-04 | Medication revenue | Paid `MEDICATION` invoice lines | SHOULD |
| FR-PHR-05 | Days of stock left | Stock / average daily dispensed over the last 30 days | COULD |

### 4.5 Laboratory (`analytics.read-lab:any`)

| ID | Metric | Definition | Priority |
| --- | --- | --- | --- |
| FR-LAB-01 | Orders | By status and by source (encounter, walk-in, external referral) | MUST |
| FR-LAB-02 | Turnaround time | Median and p90 of `orderedAt → releasedAt`, overall and per test | MUST |
| FR-LAB-03 | Top tests | Top 10 tests ordered | SHOULD |
| FR-LAB-04 | Rework | Recollection rate (`recollectCount` > 0) and cancellation rate | SHOULD |

### 4.6 Reporting health (`analytics.read-operations:any`)

| ID | Metric | Definition | Priority |
| --- | --- | --- | --- |
| FR-INT-01 | SATUSEHAT | Submissions by status and kind; age of the oldest pending; failed count. Errors are counted, never shown as text (`lastError` may carry payload detail) | MUST |
| FR-INT-02 | BPJS | Submissions by type and status, reusing the monthly BPJS report grouping. Only when a BPJS key is on | MUST |
| FR-INT-03 | Fix-it links | Each failed count links to the existing submission list, pre-filtered | SHOULD |

### 4.7 My practice (`analytics.read-practice:own`)

| ID | Metric | Definition | Priority |
| --- | --- | --- | --- |
| FR-PRC-01 | Patients seen | My finished encounters per bucket | MUST |
| FR-PRC-02 | My appointments | Outcomes and no-show rate for my sessions | SHOULD |
| FR-PRC-03 | My case mix | Top 10 primary diagnoses in my own encounters | SHOULD |
| FR-PRC-04 | My fees | My gross clinician fee per month (open question Q-4) | COULD |

Out of reach with today's data: **pharmacy margin** (no purchase cost on `Medication` or stock receipts) and **patient satisfaction** (nothing collects it).

## 5. Data flow

Analytics is one new API module that reads other modules' tables through its own read-only repository and returns aggregates; it writes nothing except the export audit row.

&#91;embedded content: analytics data flow · 6 sources, 1 module, 3 outputs\]

Why query live instead of nightly rollup tables: one clinic produces at most a few hundred visits a day, so indexed aggregate SQL over 12 months stays inside NFR-AN-01, and live numbers never disagree with the cashier report. If a pilot clinic breaks the budget, a materialized daily rollup is the fallback (R-2), not the starting point.

Cross-module rule: the repo says cross-module access goes through services, never another module's repository. Analytics is the one read-only exception — aggregate SQL across seven modules through their services would mean N+1 loads. This is recorded as a decision (**D-049**) so it is not copied into write paths.

### Where analytics lives (D-050)

Analytics lives inside the HMS portal as its own sidebar group (`/admin/analytics`, `/doctor/analytics`), not in a separate BI portal. The users are the same staff who already sign in daily; every number links to the screen where it is acted on; and the existing `proxy.ts` gate, CASL permissions, feature keys and D-033 apply without a second copy.

Split into a separate BI portal only when one of these happens:

- An owner of several clinics needs cross-clinic totals — with one database per clinic, that means ETL into a warehouse.
- MetaKlinik needs platform analytics (feature usage per clinic) — internal only, never inside a clinic's HMS.
- Analytics load slows registration or the cashier even after moving queries to a read replica.

The seam that keeps the split cheap: own module, read-only repository, stable response contract, own route group and feature key.

## 6. Non-functional requirements

| ID | Area | Requirement | Verified by |
| --- | --- | --- | --- |
| NFR-AN-01 | Performance | p95 under 1.5 s per dashboard endpoint for a 12-month range on 50k encounters and 60k invoices; p95 under 400 ms for 30 days | Integration spec with a seeded volume fixture + `EXPLAIN` of each query in the PR |
| NFR-AN-02 | Privacy | Responses carry aggregates only: no patient name, MRN, NIK, phone or record id; the response schemas in `@hms/shared-types` have no field that could carry one | Contract spec asserting the Zod schemas; integration spec scanning payloads for seeded patient names |
| NFR-AN-03 | Privacy | Case-mix and demographic cells with a count of 1–4 are returned as `{ suppressed: true }` and shown as "<5"; totals are computed before suppression and never let a hidden cell be derived by subtraction within one table | Unit spec on the suppression helper, including the one-hidden-cell subtraction case |
| NFR-AN-04 | Time | Every day, week and month bucket is the clinic's local calendar (`CLINIC_TIMEZONE`, Asia/Jakarta by default), never UTC. A payment at 23:30 WIB on the 31st counts in that month | Unit spec at the 17:00 UTC boundary |
| NFR-AN-05 | Correctness | Revenue counts issued and paid invoices by invoice date (Q-3); cash received counts payments by payment date, matching the daily cashier report; voided invoices never count, sums run in integer cents, and day bounds reuse the shared getStartOfCalendarDateInTimeZone helper — the same rules as the cashier report | Integration spec: analytics cash for one day equals `GET /reports/cashier-daily` for that day |
| NFR-AN-06 | Freshness | Data is live (queried on request) with a 5-minute cache per filter set; the page shows "as of HH:mm" and a refresh button | Web spec on the as-of label |
| NFR-AN-07 | Load | Analytics queries run read-only and are capped by a statement timeout (10 s); a timed-out query returns `ANALYTICS_QUERY_TIMEOUT`, never a 500, and never blocks registration or cashier writes | Integration spec with a forced timeout |
| NFR-AN-08 | Audit | Each CSV export writes an `AuditLog` row with action EXPORT (actor, dashboard, filters, row count). Viewing a dashboard is not audited: it reads no patient record | Integration spec on the audit row |
| NFR-AN-09 | Entitlement | The whole area sits behind the `analytics` feature key; with the key off, the menu hides and the API returns the standard feature-disabled error | Guard spec, and the key is added to the feature-guard coverage list |
| NFR-AN-10 | i18n / a11y | All copy through `next-intl` (id + en); every chart has a text table fallback and an `aria-label`; colour is never the only signal of up/down | Web vitest + manual screen-reader pass |
| NFR-AN-11 | UI copy | No internal codes (FR ids, decision numbers, enum names) in any label or empty state | Messages spec that already forbids them |

## 7. Epics and user stories

### E1 — Foundation (FDN)

Outcome: one analytics module, one filter contract and one permission set that every dashboard plugs into.

| ID | Priority | Requirement |
| --- | --- | --- |
| FR-FDN-01 | MUST | New `analytics` feature key in the catalogue; menu entry and routes hidden when off |
| FR-FDN-02 | MUST | Seven permission keys (section 2) seeded, added to web `SUPPORTED_ACTIONS` and the `ADMIN` preset |
| FR-FDN-03 | MUST | Shared filter schema in `@hms/shared-types/analytics`: `from`, `to` (local dates), `compare`, `specialtyId?`, `doctorId?`, `payerType?`; range at most 24 months; `to` not before `from` |
| FR-FDN-04 | MUST | One range helper: local dates → UTC `[start, end)`, and granularity (day up to 45 days, week up to 26 weeks, month beyond) — instead of a 31st copy of `DEFAULT_CLINIC_TIME_ZONE` |
| FR-FDN-05 | MUST | Response shape `{ data: { totals, series, breakdowns, comparison? }, meta: { from, to, timezone, granularity, generatedAt } }` |
| FR-FDN-06 | MUST | Small-cell suppression helper (NFR-AN-03) |
| FR-FDN-07 | MUST | `GET /analytics/{dashboard}/export` returns CSV (UTF-8 with BOM for Excel), filename `metaklinik-<dashboard>-<from>-<to>.csv`, audited |
| FR-FDN-08 | SHOULD | `Registration.payerType` captured at registration, with backfill (data model below) |
| FR-FDN-09 | SHOULD | Home dashboard: remove the hard-coded specialty numbers and the dummy Recent Activity card; show visits so far today vs the same weekday last week |

- **US-FDN-01** — As an admin, I want one filter bar that every dashboard respects, so that I compare like with like.
  - Given the clinic timezone is Asia/Jakarta and a payment was made at 2026-08-31 23:30 WIB, when I filter 1–31 August, then that payment is in August's total.
  - Given I choose 1 Jan 2024 – 30 Sep 2026, when I apply, then the API answers 400 with a message that the range is at most 24 months.
- **US-FDN-02** — As an admin, I want to export a dashboard to CSV, so that I can share it with the owner or accountant.
  - Given I hold `analytics.export:any`, when I export Finance for September, then I get a CSV of the same aggregates on screen and one EXPORT audit row with the filters.
  - Given a user without the export key, when they call the export route, then they get 403 and no file.
- **US-FDN-03** — As a clinic whose plan excludes analytics, I should not see a broken menu.
  - Given the `analytics` key is off, when an admin opens `/admin/analytics`, then the menu hides it and the API returns the feature-disabled error.

Data model delta: new enum `PayerType { GENERAL, BPJS, INSURANCE }` and `Registration.payerType PayerType?` (`payer_type`), indexed with `registeredAt`. Registration forms ask for it, defaulting to BPJS when a Mobile JKN booking code is present. Backfill: registrations with a BPJS `KUNJUNGAN` submission or a Mobile JKN booking code become `BPJS`; the rest stay null and show as "Not recorded". No new analytics tables.

API surface (all `GET`, under `/api/v1/analytics`): `/operations`, `/finance`, `/case-mix`, `/pharmacy`, `/laboratory`, `/reporting-health`, `/my-practice`, and `/{dashboard}/export`.

### E2 — Operations and reporting health (OPS, INT)

Outcome: the owner sees how many patients came, from where, how long they waited and whether reports reached SATUSEHAT and BPJS.

- **US-OPS-01** — As an owner, I want visits this month vs last month by poli, so that I know which poli is growing.
  - Given 120 visits in August and 150 in September at Poli Umum, when I view September with compare on, then Poli Umum shows 150 and +25%.
  - Given a registration was cancelled, when visits are counted, then it is not included.
- **US-OPS-02** — As an admin, I want the no-show rate by booking channel, so that I can decide whether WhatsApp booking stays open.
  - Given 40 WhatsApp bookings with 30 completed and 10 no-show, when I view the period, then WhatsApp shows a 25% no-show rate.
- **US-OPS-03** — As an admin, I want median waiting time, so that I can staff the busiest hours.
  - Given one check-in with an encounter starting 9 h later, when the median is computed, then that visit is excluded and counted under "excluded outliers".
- **US-INT-01** — As an admin, I want to see failed SATUSEHAT submissions, so that nothing stays unreported.
  - Given 3 failed encounter submissions, when I open Reporting health, then I see 3 and a link to the submission list filtered to FAILED; no error text is shown.

RBAC: `analytics.read-operations:any`. UX: `/admin/analytics` (overview) and `/admin/analytics/reporting-health`. Edge cases: sessions without `maxPatients` are left out of utilisation; the inpatient and BPJS blocks disappear when their feature keys are off.

### E3 — Finance (FIN)

Outcome: revenue that reconciles to the cash drawer, sliced by method, service, doctor and payer.

- **US-FIN-01** — As an owner, I want monthly revenue that matches the cashier report, so that I trust the numbers.
  - Given the cashier report for 2026-09-15 totals Rp 4.250.000, when I view Finance for that day, then revenue is Rp 4.250.000.
  - Given an invoice was voided, when revenue is computed, then it is excluded and appears under Voids.
- **US-FIN-02** — As an owner, I want unpaid invoices by age, so that I can chase them.
  - Given an invoice issued 10 days ago and unpaid, when I view Outstanding, then it counts in the 8–30 day bucket.
- **US-FIN-03** — As an owner, I want revenue by payer, so that I know how dependent I am on BPJS.
  - Given registrations without a payer, when I view payer mix, then they appear as "Not recorded", never guessed.

RBAC: `analytics.read-finance:any`. UX: `/admin/analytics/finance`. Edge cases: integer-cent sums; the unattributed-doctor bucket labelled "No doctor"; tax shown apart from revenue.

### E4 — Case mix (CLN)

Outcome: the clinic knows what it treats and how complete its coding is, without exposing any patient.

- **US-CLN-01** — As an owner, I want the top 10 diagnoses this month, so that I can plan stock and services.
  - Given J06.9 has 84 finished encounters out of 300, when I view the month, then J06.9 shows 84 (28%).
  - Given a code has 3 encounters, when it appears in a breakdown, then it shows "<5".
- **US-CLN-02** — As an admin, I want coding completeness, so that I can fix encounters before SATUSEHAT rejects them.
  - Given 300 finished encounters and 270 with a primary ICD-10, when I view the month, then completeness is 90%.

RBAC: `analytics.read-clinical:any` (not `SUPER_ADMIN`). UX: `/admin/analytics/case-mix`. Edge cases: diagnoses without an `icd10CodeId` count as "Uncoded"; cancelled encounters excluded.

### E5 — Pharmacy and laboratory (PHR, LAB)

Outcome: pharmacists and lab staff see throughput and stock risk in their own view.

- **US-PHR-01** — As a pharmacist, I want medications below reorder level and batches near expiry, so that I order in time.
  - Given amoxicillin has 40 left and a reorder level of 50, when I open Pharmacy, then it is listed under "Reorder".
- **US-LAB-01** — As a lab technician, I want turnaround time per test, so that I can spot slow tests.
  - Given 10 released CBC orders with a median of 45 min, when I view the week, then CBC shows 45 min.

RBAC: `analytics.read-pharmacy:any`, `analytics.read-lab:any`. UX: `/admin/analytics/pharmacy` and `/admin/analytics/laboratory`, also gated by the `pharmacy` and `laboratory` feature keys.

### E6 — My practice (PRC)

Outcome: a doctor or midwife sees their own workload, and only theirs.

- **US-PRC-01** — As a doctor, I want patients I saw per week, so that I can track my workload.
  - Given I finished 60 encounters and a colleague 80, when I open My practice, then I see 60 and nothing about the colleague.
  - Given a doctor calls `/analytics/my-practice?doctorId=<other>`, then the parameter is ignored and their own data is returned.

RBAC: `analytics.read-practice:own`. UX: `/doctor/analytics` in the clinician shell.

## 8. Delivery plan

P29 fits three sprints at the team's usual 24–27 points, with the riskiest parts (query speed, reconciliation) proved first.

&#91;embedded content: P29 delivery · 3 sprints, 3 gates\]

| Ticket | Sprint | Scope | Points | Depends on |
| --- | --- | --- | --- | --- |
| P29-T01 | 1 | Module skeleton, `analytics` feature key, 7 permission keys in `seed.sql`, web allowlist and `ADMIN` preset (FR-FDN-01, 02) | 3 | — |
| P29-T02 | 1 | Filter schema, range helper, response shape, suppression helper (FR-FDN-03 to 06) | 5 | T01 |
| P29-T03 | 1 | Volume fixture (50k encounters) and `EXPLAIN` per query; indexes if needed (NFR-AN-01) | 3 | T02 |
| P29-T04 | 1 | Operations endpoint (FR-OPS-01 to 05) | 5 | T02 |
| P29-T05 | 1 | `/admin/analytics` shell: filter bar, stat tiles, charts, compare, as-of label | 8 | T04 |
| P29-T06 | 1 | Reporting health endpoint and tab (FR-INT-01 to 03) | 3 | T05 |
| P29-T07 | 2 | `Registration.payerType` migration, registration form, backfill (FR-FDN-08) | 5 | — |
| P29-T08 | 2 | Finance endpoint (FR-FIN-01 to 06, 08) with a reconciliation spec against the cashier report | 8 | T02, T07 |
| P29-T09 | 2 | Finance tab | 5 | T08 |
| P29-T10 | 2 | CSV export and EXPORT audit for every dashboard (FR-FDN-07) | 3 | T04 |
| P29-T11 | 2 | Session utilisation, wait times, busiest hours, inpatient (FR-OPS-06 to 09) | 5 | T04 |
| P29-T12 | 3 | Case mix endpoint and tab (FR-CLN-01 to 04) | 5 | T02 |
| P29-T13 | 3 | Pharmacy endpoint and tab (FR-PHR-01 to 04) | 5 | T02 |
| P29-T14 | 3 | Laboratory endpoint and tab (FR-LAB-01 to 04) | 5 | T02 |
| P29-T15 | 3 | My practice endpoint and `/doctor/analytics` (FR-PRC-01 to 03) | 5 | T02 |
| P29-T16 | 3 | Home dashboard cleanup (FR-FDN-09) | 3 | T04 |
| P29-T17 | 3 | D-049 decision record; mark the inpatient note in the AI tools doc as outdated | 1 | — |

Definition of done for every ticket: lint, typecheck, unit and integration specs, build and `prisma validate` green in CI; contract synced with `pnpm api:contract:sync`; `db:seed` re-run noted in the PR for new keys; T07 notes its migration and backfill.

Not in these three sprints (COULD, next phase if pilots ask): demographics (FR-OPS-10), top services and clinician fees (FR-FIN-09, 10), diagnosis trend and maternal headline (FR-CLN-05, 06), days of stock left (FR-PHR-05), my fees (FR-PRC-04).

## 9. Risks and open questions

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R-1 | Payer mix is mostly "Not recorded" for past months | High | Medium | Backfill from BPJS submissions and Mobile JKN codes; show the unrecorded share openly | Engineering |
| R-2 | Live aggregates are too slow on a busy clinic | Low | High | Volume fixture and `EXPLAIN` in Sprint 1; fallback is a nightly daily-rollup table | Engineering |
| R-3 | Small counts identify a patient | Medium | High | Suppression under 5, no drill-down, privacy review as the release gate | Product owner |
| R-4 | Analytics disagrees with the cashier or tax report | Medium | High | Shared definitions and a reconciliation spec against the cashier report | Engineering |
| R-5 | The cross-module read exception spreads to write paths | Low | Medium | D-049 limits it to the read-only analytics repository | Engineering |
| R-6 | A heavy query slows the front desk | Low | High | 10 s statement timeout, read-only queries, 5-minute cache | Engineering |

| # | Question | Owner | Needed by | Blocking? |
| --- | --- | --- | --- | --- |
| Q-1 | May `ADMIN` (the owner) see clinic-wide case mix, given D-033 keeps record content to clinicians? Answered 2026-09-30: yes, as statistics that cannot point at a patient | Product owner | Sprint 3 planning | Yes, E4 |
| Q-2 | Are general, BPJS and insurance enough payer values, or do company contracts need their own? Answered 2026-09-28: those three for now | Product owner | Sprint 2 planning | Yes, T07 |
| Q-3 | Revenue on payment date (cash basis, matches the drawer) or on invoice date? Answered 2026-09-28: invoice date (accrual); cash is shown beside it by payment date | Product owner | Sprint 2 planning | Yes, T08 |
| Q-4 | May doctors and midwives see their own clinician fee in My practice? | Product owner | Sprint 3 planning | No |
| Q-5 | Is analytics in the base plan (key on by default) or a paid add-on? | Product owner | Sprint 1 planning | No |
| Q-6 | Is 5 the right suppression threshold for a small clinic, and should it also apply to revenue per doctor? | Product owner with legal review | Sprint 3 planning | No |

Sources: repository `main` at 8ca85958 — `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.sql`, `apps/api/src/modules/billing/service/cashier-report.service.ts`, `apps/web/lib/dashboard/`, `docs/post-mvp/decisions.md` (D-033), `docs/post-mvp/multi-tenancy.md`; Development Board ticket P19-T07.
