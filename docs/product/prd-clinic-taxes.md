# PRD — Clinic Taxes (P27)

Billing · P27 · Draft 19 Sep 2026 · Research and scope for P27-T01 (SJ-242).

|                   |                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase             | P27 — Clinic Taxes (Development Board SJ-242..253; T01–T05 and T12 in Sprint 30)                                                                                                                                                                 |
| Decision          | `docs/post-mvp/decisions.md` **D-038** — cite it with the file; D-numbers collide across the two decision files                                                                                                                                  |
| Regulatory basis  | UU PPN Pasal 16B as amended by UU 7/2021 (HPP); PP 49/2022 Pasal 10–11, 29; PMK 131/2024, PMK 11/2025; PP 55/2022 as amended by **PP 20/2026**; PP 58/2023 and PMK 168/2023; PMK 141/2015; PMK 81/2024; UU KUP Pasal 7; UU 10/2020 (bea meterai) |
| Not a tax opinion | This document states what the product does and why. It is not tax advice; §6 lists what a tax consultant must confirm                                                                                                                            |

## 1. Summary

A clinic owes tax on what it sells and withholds tax on what it pays. Today the product records neither: an invoice has one money field (`Invoice.totalAmount`), a line is `quantity × unitPrice`, and the only tax fact stored anywhere is the clinic's NPWP as free text (`ClinicProfile.taxId`).

P27 adds, in order:

1. a **tax profile** for the clinic — who it is as a taxpayer (T02);
2. **tax codes** attached to every tariff and medication (T03);
3. **tax on invoices**, frozen at issue (T04);
4. **monthly report drafts** with CSV and PDF export (T05, T12);
5. later, clinician fee sharing, PPh 21 on those fees, Coretax XML files and a tax calendar (T06–T11).

The product **drafts and exports; it never files**. Coretax offers no filing API to a clinic system, and the clinic's signature on a return is not ours to give.

## 2. What the law says (research, 19 Sep 2026)

### 2.1 PPN on medical services — exempt, not out of scope

- Since UU HPP, medical services are a _jasa kena pajak_ that receives the **exemption facility** (UU PPN Pasal 16B; PP 49/2022 Pasal 10 huruf a and Pasal 11). They are not "non-JKP" any more.
- PP 49/2022 Pasal 11 ayat (3)–(4) covers services by doctors, dentists, specialists, midwives, nurses, psychiatrists and _ahli kesehatan_, and facility services of a _klinik kesehatan_, FKTP, FKTL, _laboratorium kesehatan_ and hospitals. Ayat (5) covers non-health-worker providers such as paramedics and psychologists.
- **Not covered:** beauty and aesthetic clinic services (Kring Pajak, reported by DDTC in August 2023); outpatient medicines (§2.2); ancillary income such as rent or administrative fees, which are not named in Pasal 11 (our inference, not a ruling). Canteen food and parking fall under local PBJT instead (UU 1/2022).
- **Consequence for a PKP.** An exempt supply is still a delivery. A clinic registered as PKP issues a faktur with **transaction code 08** for exempt services, and the related input VAT is **not creditable** (PP 49/2022 Pasal 29(1)). A clinic that also sells taxable medicines apportions its input VAT.
- **PKP threshold.** Turnover above **Rp4.8 billion** a year obliges registration **even when every rupiah is exempt** (DDTC konsultasi). Below it the clinic is a _pengusaha kecil_ and must not charge PPN.

### 2.2 PPN on medicines

- Rate: **12% × DPP nilai lain 11/12**, an effective 11% on non-luxury goods (PMK 131/2024 from 1 Jan 2025, consolidated by PMK 11/2025; unchanged for 2026). The faktur shows DPP = 11/12 × selling price and PPN = 12% × DPP, under **transaction code 04**.
- Worked example: a medicine priced Rp111,000 including tax → selling price Rp100,000, DPP nilai lain Rp91,667, PPN Rp11,000.
- **Outpatient medicines are taxable** (Kring Pajak, DDTC May 2024).
- A DJP extension article (pajak.go.id node 114461) says medicines given to **inpatient and emergency** patients are not subject to PPN because the pharmacy is part of the facility. It cites no regulation — see §6.
- Programme vaccines are exempt under PP 49/2022 (e.g. the national polio immunisation week).
- A retail patient may receive a faktur without buyer identity (_digunggung_), per PMK 81/2024.

### 2.3 PPh final 0.5% (PP 55/2022 as amended by PP 20/2026)

- **PP 20/2026** was signed and took effect on **22 April 2026** (LN 2026 No. 43).
- Individuals and PT perorangan may use 0.5% **without a time limit** (the old Pasal 59 limits are deleted). Koperasi keep a four-tax-year limit.
- **CV, firma and ordinary PT are no longer eligible.** A badan already on the scheme finishes the period it started under (Pasal II). Under PP 55/2022 that period was three tax years for a PT and four for a CV, firma or koperasi.
- The Rp4.8 billion threshold now aggregates business and _pekerjaan bebas_ revenue, domestic and foreign, together with the spouse's. Individuals keep the **Rp500 juta** yearly non-taxable omzet (PP 55/2022 Pasal 60(2)).
- **A doctor's own practice is excluded** (Pasal 56(4) huruf a: _tenaga ahli yang melakukan pekerjaan bebas … dokter … dan tenaga ahli sejenis lainnya_). Whether a bidan or perawat falls under _sejenis_ is unconfirmed — see §6.
- Payment: KAP **411128**, KJS **420**, by the 15th of the following month. A validated NTPN counts as the report.

### 2.4 PPh 21 on clinicians

- **Employees** (PP 58/2023, PMK 168/2023): monthly TER categories A/B/C, a December true-up at Pasal 17 rates; BPMP monthly and BPA1 yearly. **Out of P27** — the product has no payroll.
- **Non-employees (bukan pegawai)** — the doctor or midwife on fee sharing: **Pasal 17 rates × 50% × gross**, per payment or period, **non-cumulative** (PMK 168/2023 Pasal 5(1)(e)).
- Gross is the clinician's fee as the patient paid it, **before** the clinic's share is taken (DDTC worked example; DJP Kepri).
- The clinic withholds and issues one **BP21** per clinician per month.

### 2.5 Other obligations

- **PPh 23** at 2% (4% without NPWP) on services the clinic buys from a badan — a referral laboratory, cleaning, maintenance, IT (PMK 141/2015). **PPh 4(2)** at 10% final on building rent. The product has no vendor-bill model (T11 decides whether to add one).
- **Bea meterai** Rp10,000 on a receipt above Rp5 juta (UU 10/2020). The invoice already shows a materai area (`MATERAI_THRESHOLD_IDR`); e-Meterai stays out of scope.
- **Local taxes** (UU 1/2022): PBJT on a canteen or parking, PBB-P2, reklame — none touch billing.

### 2.6 Coretax (live since 1 Jan 2025)

- NPWP is **16 digits** (an individual's NIK serves as NPWP). **NITKU** is 22 digits: the NPWP plus a six-digit place-of-business suffix, `000000` for the head office (PMK 112/2022 as amended by PMK 136/2023).
- Payment deadlines (PMK 81/2024 Pasal 94): PPh by the **15th** of the following month; PPN by the end of the following month.
- Filing deadlines: SPT Masa PPh 21/26 and Unifikasi by the **20th**; SPT Masa PPN by the end of the following month; SPT Tahunan Badan by the end of April, orang pribadi by the end of March.
- Coretax assembles the monthly PPh return ("Buat Konsep SPT") from the bukti potong entered or imported. Bulk import is **XML only**, produced from DJP's Excel converters: BP21 v4, BPMP v3, BPPU v3, Faktur Keluaran v1.6 and others (pajak.go.id node 112031).
- Late-filing fines (UU KUP Pasal 7(1)): Rp500,000 for SPT Masa PPN, Rp100,000 for other SPT Masa.

### 2.7 Market

Kledo and Accurate export sales invoices as Coretax faktur XML. No Indonesian clinic system we found advertises a BP21 export for doctor fees — the report most small clinics actually file every month.

## 3. Goals and non-goals

**Goals**

- G1. An administrator records the clinic's taxpayer facts once, and every later computation reads them.
- G2. Every tariff and medication resolves to a tax treatment, and a missing one is visible rather than silently zero.
- G3. An issued invoice carries the tax it was issued with, forever.
- G4. Each month the clinic gets a draft of what to pay and report, with the numbers traceable to invoices.

**Non-goals (P27 first cut)**

- Filing anything with DJP, or holding DJP credentials.
- Employee PPh 21 (TER, BPMP, BPA1) — no payroll exists.
- PPh 23 / 4(2) on purchases — pending T11.
- SPT Tahunan, input-VAT apportionment, e-Meterai.

## 4. Tickets

| Ticket  | Board  | Scope                                                                                                       | Points | Sprint  |
| ------- | ------ | ----------------------------------------------------------------------------------------------------------- | ------ | ------- |
| P27-T01 | SJ-242 | This PRD and D-038                                                                                          | 2      | 30      |
| P27-T02 | SJ-243 | Clinic tax profile, "Pajak" settings page, NPWP 16 / NITKU validation                                       | 5      | 30      |
| P27-T03 | SJ-244 | Tax codes with effective-dated rates, category defaults, bulk assignment across every tariff and medication | 8      | 30      |
| P27-T04 | SJ-245 | Tax on invoices, frozen at issue                                                                            | 8      | 30      |
| P27-T05 | SJ-246 | Monthly report drafts: PP 55 omzet, PPN output                                                              | 5      | 30      |
| P27-T12 | SJ-253 | PDF export of a report draft                                                                                | 3      | 30      |
| P27-T06 | SJ-247 | Clinician fee sharing (jasa medis)                                                                          | 5      | Backlog |
| P27-T07 | SJ-248 | PPh 21 bukan pegawai and the BP21 draft                                                                     | 5      | Backlog |
| P27-T08 | SJ-249 | Coretax XML: BP21                                                                                           | 5      | Backlog |
| P27-T09 | SJ-250 | Coretax XML: Faktur Keluaran                                                                                | 5      | Backlog |
| P27-T10 | SJ-251 | Tax calendar, Rp4.8 bn monitor, PP 55 end-year warning                                                      | 3      | Backlog |
| P27-T11 | SJ-252 | Spike: vendor bills and PPh 23 / 4(2)                                                                       | 2      | Backlog |

The phase is **P27**, not P26: `P26-T01` already names the consultation-tariff-by-poli work in code (`schema.prisma`, D-037) although it never reached the board.

## 5. Rules the tickets build against

- R1. **Rates are data.** A tax code carries effective-dated rates; a new PMK is a new rate row, not a deploy. An invoice uses the rate in force on its issue date in the clinic's timezone.
- R2. **A non-PKP clinic never charges PPN.** Lines still record their treatment, so the day the clinic registers, history is already classified.
- R3. **Prices are always tax-inclusive** (product owner, 2026-09-19). The patient sees one price per line and, only when the invoice carries PPN, the note "Harga sudah termasuk PPN" — no subtotal, DPP or PPN rows. The before/after-PPN breakdown is for administrators, on the tariff and medicine price lists (P27-T04). There is no "PPN on top" setting.
- R4. **Issued means frozen.** Changing a setting, a code or a rate never rewrites an ISSUED, PAID or VOID invoice.
- R5. **PP 55 eligibility follows PP 20/2026.** Individuals and PT perorangan: no end year. Koperasi: start year + 3. PT: start year + 2, and CV: start year + 3, as a transition only, for a start year no later than 2026. Yayasan: never eligible. The tax profile refuses a regime the entity type cannot hold.
- R6. **PP 55 omzet is cash-basis** — payments received in the month — until the consultant says otherwise (§6).
- R7. **Drafts say they are drafts.** Every draft screen and document carries "Draft — bukan pelaporan resmi. Setor dan laporkan melalui Coretax DJP."
- R8. **NPWP is stored as 16 digits.** A new or changed value must normalise to 16 digits. An existing 15-digit value is kept and flagged, never rejected on an unrelated save.
- R9. **A tax code's treatment is fixed at creation** (P27-T03). Moving a code between exempt and taxed would re-tax every item using it, so a different treatment is a different code. A system code also keeps its faktur code; only its name, note and active flag change.
- R10. **Rates are append-only.** A rate applies from its `effectiveFrom` until the next rate's date; a new rate must start after the latest one. There is no `effectiveTo` column, because the next row is the end.
- R11. **An item resolves override → category default → unresolved.** Unresolved is counted on the assignment screen. It is never silently zero. A code still used by a default or an item cannot be deactivated. At invoice issue (P27-T04), an unresolved line is refused with `TAX_CODE_UNRESOLVED` **only for a PKP clinic**. A clinic that is not PKP charges no PPN, so the bill issues and the line keeps no tax code for the monthly report to flag. This also keeps billing working on a deployment whose seed has not been re-run.
- R13. **Invoice tax is carved out of the line, never added** (P27-T04). Each line stores its code, treatment, faktur code, price before PPN, DPP, rate and PPN. `Invoice.taxAmount` is their sum and `totalAmount` never changes because of tax. The draft shows today's figures, and **issue recomputes every line for the issue date and freezes it**. A line is taxed under its tariff's or medicine's own code, else the default for its item type; invoice item types equal the default targets.
- R14. **The patient sees "Harga sudah termasuk PPN" and nothing else** (P27-T04). The invoice renderer prints the note, like the materai area, whenever the invoice's `taxAmount` is above zero. No template needs editing and no DPP or PPN figure is printed. The before/after-PPN split is shown only to holders of `tax-code.read:any`, beside the price on the tariff and medicine lists (`GET /api/v1/tax/price-breakdowns`).
- R15. **Monthly drafts** (P27-T05, `/admin/taxes`) exist for the reports the tax profile calls for: PP 55 omzet on the 0.5% regime, PPN keluaran for a PKP. Asking for another is 409 `TAX_REPORT_NOT_APPLICABLE`.
  - **PP 55** takes payments received in the month (R6). The Rp500 juta yearly non-taxable omzet applies **only to an individual**, per PP 55/2022 Pasal 60(2); a PT perorangan is a badan. Tax is 0.5% of the omzet above that line, counting earlier months of the year. The draft shows KAP-KJS 411128-420 and the 15th-of-next-month deadline.
  - **PPN** reads the issue-time snapshot of invoices issued in the month, excluding VOID, grouped by faktur code. Every buyer is a retail patient, so the output is *digunggung*. Lines without a tax code (billed before T04) are counted apart and never guessed. It is due at the end of the next month.
  - **Lifecycle:** a DRAFT recomputes at will. **Finalize is allowed only after the month ends**, and it recomputes and freezes in one step. A finalized report is never rewritten; every read compares it with the books and lists each total that changed, so the grid shows "Tidak sesuai".
  - **CSV export:** each report exports as CSV, and every CSV value is escaped against formula injection. Finalize and export are audited.
- R12. **Tax codes are assigned on the Pajak page, not on the tariff and medicine forms** (P27-T03). The bulk screen covers one item as well as many, and P27-T04 adds the before/after-PPN columns to the tariff and medicine lists.

## 6. Questions for a tax consultant

None of these block T02–T05; each is behind a documented hook.

1. The legal basis for inpatient and emergency medicines being outside PPN, and how PPN applies to medicines bundled into BPJS kapitasi, non-kapitasi or INA-CBG packages.
2. Whether BPJS Kesehatan or a corporate client withholds PPh 23 on what it pays the clinic, and whether a medical check-up is a PPh 23 object.
3. Whether a bidan or perawat in independent practice is excluded from PP 55 under PP 20/2026 Pasal 56(4).
4. Where PMK 168/2023 states that a doctor's gross is measured before the clinic's share.
5. Cash or accrual basis for PP 55 omzet when an invoice is paid in a later month.
6. Whether a patient receipt that is not a faktur must state "PPN dibebaskan".
7. Whether an ambulance service falls under PP 49/2022 Pasal 11.

## 7. Sources

- pajak.go.id nodes 112031 (Coretax converters), 113453 (PMK 131/2024), 114038 (PMK 11/2025), 114461 (medicines for inpatients), 114931 (KEP-67/PJ/2025), 119950 and 120065 (PP 20/2026)
- pasal.id — PP 49/2022 Pasal 11
- peraturan.bpk.go.id — PMK 131/2024 (Details/311485), PP 20/2026 (Details/349415)
- jdih.kemenkeu.go.id — PMK 141/PMK.03/2015
- DDTC news 44227, 44684, 1794404, 1796606, 1799732, 1802956, 1811296, 1812992, 1820255
- Ortax — PMK 81/2024 payment deadlines; PP 20/2026 for individuals and PT perorangan; non-creditable input VAT
- PKN STAN tax centre — PP 20/2026 summary
