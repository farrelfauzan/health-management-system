# Demo seed

One command turns a base-seeded database into one where the core clinic flow can be
demonstrated live, end to end, for a klinik pratama or a klinik bidan:

registration → check-in → examination (vitals, SOAP, ICD-10, ICD-9-CM, lab order,
prescription) → lab collect / results / release → the clinician reads the result and
closes the visit → pharmacy dispense → invoice generate / issue / pay → invoice PDF.

It creates staff logins, the clinicians behind them, prices, stock and patients. It
does **not** create encounters, invoices or appointments — the demo creates those live.

## Prerequisites

1. A migrated, base-seeded database:

   ```bash
   pnpm db:migrate:deploy
   pnpm db:seed          # seed.sql + lab catalog + wilayah + ICD-10 + ICD-9-CM
   ```

   The command refuses a database without the base seed's roles or privacy notice.

2. `apps/api/.env` configured for a normal local run, plus:
   - `PDF_RENDERER_BASE_URL` — Gotenberg renders the invoice PDF. Locally:
     `pnpm docker:dev:pdf` (`http://127.0.0.1:3010`).
   - `S3_*` — the rendered PDF is stored in object storage and downloaded through a
     presigned URL: local MinIO (`pnpm docker:dev:up`) or the dev bucket.
   - `MFA_ENFORCEMENT_GRACE_UNTIL` — ADMIN holds privileged permissions, so with
     `MFA_SECRET_ENCRYPTION_KEY` set its first login is sent to second-factor
     enrolment. Set a future instant (e.g. `2026-12-31T00:00:00+07:00`) and every demo
     login lands in the app. On a non-production machine, leaving
     `MFA_SECRET_ENCRYPTION_KEY` empty also disables enforcement. No code change needed.
   - `LAB_REQUIRE_PAYMENT_BEFORE_COLLECTION` — leave unset (or `false`). When `true`,
     the technician cannot collect until the visit is paid, which breaks this order.
   - `MAIL_TRANSPORT=log` — outgoing email (invoice delivery, notifications) is written
     to the API log instead of sent. With real SMTP in SES sandbox only verified
     recipients receive mail, and the demo patients' addresses are not real mailboxes.
   - `CLINIC_TIMEZONE` — defaults to `Asia/Jakarta`; the demo schedules are 07:00–22:00
     in this zone.
   - `NODE_ENV` — must not be `production`: the command refuses to run there.

## Run it

```bash
DEMO_SEED_PASSWORD='<a passphrase of at least 12 characters>' pnpm db:seed:demo
```

- `DEMO_SEED_PASSWORD` is required and is the password of every demo login. It must pass
  the same policy as the account screens (at least 12 characters, not in the breached
  password list). The repository is public: never commit it, never put it in `.env.example`.
- The command is idempotent. A second run reports every record as "already present" and
  writes nothing. Run it again after a rehearsal to top the pharmacy stock back up, to
  restore a demo login's password, or to re-grant a withdrawn email consent.
- It prints what it created, the logins (never the password) and the demo order. It never
  prints a NIK.

## What it seeds

Everything is written through the same services the screens use, acting as the person who
would do it at the counter (the super admin for staff setup, the demo ADMIN for patients,
the demo pharmacist for stock), so MRN allocation, NIK encryption, privacy-notice
evidence, audit rows and stock batches are the product's own.

### Logins

| Email                              | Role           | Used for                                                         |
| ---------------------------------- | -------------- | ---------------------------------------------------------------- |
| `admin.klinik@demo.salingjaga.com` | ADMIN          | Front desk, check-in, opening the visit, cashier                 |
| `dokter@demo.salingjaga.com`       | DOCTOR         | dr. Andi Pratama (dokter umum): examination, orders, lab release |
| `bidan@demo.salingjaga.com`        | MIDWIFE        | Ayu Lestari (bidan): ANC and KB visits                           |
| `lab@demo.salingjaga.com`          | LAB_TECHNICIAN | Specimen collection, receipt, result entry                       |
| `apoteker@demo.salingjaga.com`     | PHARMACIST     | Dispensing and stock                                             |

The bootstrap logins `admin@salingjaga.com` and `pharmacy@salingjaga.com` from `seed.sql`
have their password printed in that file. While nobody has signed in to them yet (their
hash is still the seed's bcrypt hash), the demo seed replaces it with
`DEMO_SEED_PASSWORD` and says so in its output. A password somebody already set is left
alone.

### Clinicians and clinic

- Complete doctor and midwife profiles (licence number, specialty, phone, NIK, STR and
  SIP), so neither login is held on the complete-profile page.
- A weekly schedule for both: every day, 07:00–22:00 clinic time, unlimited capacity.
  Practice sessions are materialised on the first booking, so none are pre-created.
- The midwife's `IUD_IMPLANT` authority (a demo penetapan valid until 2030), so an IUD or
  implant can be shown without the "no active authority" refusal.
- A clinic profile ("Klinik Pratama Sehat Bersama (Demo)") for the invoice letterhead —
  only when none exists; an existing profile is never overwritten.
- The `maternal-care` feature (ANC, KB, persalinan screens) switched on.
- Laboratory settings are left at their defaults.

### Prices

| Code                             | Category                  | Price (IDR)     | Collected onto the invoice                                    |
| -------------------------------- | ------------------------- | --------------- | ------------------------------------------------------------- |
| `KONSULTASI-UMUM` (base seed)    | Consultation, any doctor  | 50.000          | Automatically                                                 |
| `KONSULTASI-BIDAN`               | Consultation, MIDWIFE     | 35.000          | Automatically for a midwife's visit                           |
| `KIA-ANC`                        | Procedure `89.26`         | 75.000          | When the clinician records ICD-9-CM `89.26`                   |
| `KB-SUNTIK`                      | Procedure `99.24`         | 35.000          | When `99.24` is recorded                                      |
| `KB-IUD`                         | Procedure `69.7`          | 350.000         | When `69.7` is recorded                                       |
| `PERSALINAN-NORMAL`              | Procedure `73.59`         | 1.500.000       | When `73.59` is recorded                                      |
| `KB-PIL`, `KB-IMPLAN`            | Procedure, no code        | 20.000, 250.000 | Added by the cashier on the DRAFT invoice                     |
| `ADMINISTRASI`                   | Other                     | 10.000          | Added by the cashier on the DRAFT invoice                     |
| `LAB-<code>`, `LAB-PANEL-<code>` | Lab, one per test / panel | 10.000–150.000  | Automatically, for every active test and panel in the catalog |

The ICD-9-CM choices follow `docs/ops/midwife-practice-research.md` §4; `89.26` for ANC
and `73.59` for a spontaneous delivery are demo mappings the clinic should confirm with
its coders. A lab test or panel that already had a price keeps it.

### Pharmacy

- Two midwife-prescribable items: Tablet Tambah Darah (Fe + Asam Folat) and Suntik KB
  3 Bulan (DMPA). The base catalog has no item a bidan may prescribe.
- A goods receipt bringing every active medication to 500 units (batch `DEMO-<date>`,
  two-year expiry). A re-run only tops up items below 100.

### Patients

Six invented patients in Tebet, Jakarta Selatan, each with privacy-notice evidence
(acknowledged at the front desk), email delivery consent, and assigned to the demo
doctor. NIKs are fictional, match each patient's birth date and sex, and are checked
against every SATUSEHAT sandbox identity in the repository.

| Patient          | Story                                                         |
| ---------------- | ------------------------------------------------------------- |
| Budi Santoso     | Adult male — general consultation with lab and prescription   |
| Siti Rahmawati   | Adult female — general consultation                           |
| Dewi Anggraini   | Pregnant — the bidan's ANC visit (also assigned to the bidan) |
| Slamet Riyadi    | Elderly male — chronic-care follow-up                         |
| Rizky Firmansyah | Young adult — acute visit                                     |
| Sri Wahyuni      | Elderly female — hypertension and diabetes follow-up          |

## Demo click path

This order is the one verified end to end over HTTP. Follow it; the notes are the traps.

1. **ADMIN — register and check in.** Register the patient as a walk-in (no appointment)
   and check them in. Same-day session booking closes 60 minutes before the session
   starts, so an appointment for today cannot be made during the demo; a walk-in needs
   none. Registering a **new** patient live: pick the doctor (and the bidan, for a
   pregnant patient) in the patient form's doctor field — a clinician can only prescribe
   for a patient assigned to them.
2. **ADMIN — open the visit** from the queue, choosing the doctor or the bidan. Only the
   front desk opens visits.
3. **DOCTOR (or MIDWIFE) — examine:** vitals, SOAP, an ICD-10 diagnosis, an ICD-9-CM
   procedure (e.g. `99.21` injection, `89.26` ANC — both priced), a lab order (e.g.
   Darah Rutin + GDS), and a prescription.
4. **LAB_TECHNICIAN — collect, receive, enter results.** The technician cannot release
   (a second person signs out a result; `technicianMayVerify` is off by default).
5. **DOCTOR (or ADMIN) — release the results.** The bidan cannot release a lab result
   (D-034: MIDWIFE is DOCTOR minus `lab-result.verify`), so for the bidan's patient the
   doctor or the ADMIN releases. The clinician then reads the result and **closes the
   visit**.
6. **PHARMACIST — dispense BEFORE the invoice is generated.** Generation bills what has
   been dispensed at that moment, and an encounter can hold only one live invoice: a
   medicine dispensed after the invoice was generated is not on it, and the only way to
   add it is to void the DRAFT (with a reason) and generate again. For a normal
   (non-compound) line the dispense names the medication.
7. **ADMIN — generate the invoice**, check there are no pricing gaps, add "Administrasi"
   by hand if wanted, **issue**, **record the payment**, then open the **PDF**. There is
   no discount feature — do not promise one. With email consent seeded, the issued
   invoice can also be sent by email.

Other things to know on the day:

- The demo schedules end at 22:00 clinic time; a check-in against a booking later than
  that is refused as outside the session.
- Sign-in is limited to 10 attempts per minute from one IP address. Logging into all five
  roles is fine; repeated failed attempts on one account back off exponentially.
- To rehearse again, run `pnpm db:seed:demo` again: stock is topped up and demo logins
  are restored. Earlier visits and invoices stay in the history.
