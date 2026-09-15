# PRD addendum — Midwife Practice (P25)

Klinik Bidan · P24 → P25 · Draft 14 Sep 2026 · Markdown port of the "Midwife Practice Addendum" artifact (P25-T01).

| | |
|---|---|
| Parent document | `docs/product/prd-satusehat-klinik-bidan.md` |
| Proposed phase | P25 — Midwife Practice (filed on the Development Board as SJ-224..240; T01–T04, T11 and T13 in Sprint 29) |
| Regulatory basis | Permenkes 28/2017 (revoked by Permenkes 13/2025 Pasal 309 cc; still the authority reference via 13/2025 Pasal 305(1)), PP 28/2024 Pasal 742–745, Permenkes 13/2025 Pasal 174 and 182–187, Permenkes 21/2021 (masa hamil, persalinan, nifas; contraception parts revoked by Permenkes 2/2025), Permenkes 2/2025, 3/2026 (immunisation), 3/2023 (tariffs) — see P25-T01 |
| Status of P24 | T01–T06 merged; T07–T17 in backlog (T12 pulled into Sprint 29) |
| Research | `docs/ops/midwife-practice-research.md` (P25-T01) answers Q9–Q11 |

## 1. Summary

After P24 a midwife can log in as a clinician, is reported to SATUSEHAT as herself, and prescribes only what the clinic has flagged. She still cannot record most of what she does all day. Her work is organised around a **pregnancy episode** with fixed visit schedules (K1–K6, KF1–KF4, KN1–KN3), a short list of **legally enumerated** actions and medicines, **per-midwife authorities** granted by the district health office, and **paper registers** that feed a monthly report to the puskesmas.

This addendum proposes eight epics. Two are small and safety-relevant and ship first (E6 authorities, E7 formulary). The maternal episode (E8–E10) is the product decision deferred on 11 September; the registers (E12) and BPJS network claims (E13) are what make a klinik bidan pay for the product.

> **Before designing E8 — answered by P25-T01 (2026-09-15).** (1) Permenkes 28/2017 is formally revoked (Permenkes 13/2025 Pasal 309 cc) but its authority list remains the reference through 13/2025 Pasal 305(1); the mechanism for programme authority and the doctor's mandate now lives in PP 28/2024 Pasal 742–745 and 13/2025 Pasal 182–187 — see Q9 and D-036. (2) **Yes**, two of the six antenatal visits must be by a doctor or SpOG, in trimester 1 and 3, with USG (Permenkes 21/2021 Pasal 13(4)–(5)); FR-ANC-07 is a MUST and E8 must record doctor visits done at another facility. Trimester boundaries for K-numbering are 0–12, >12–24 and >24 weeks. Detail in `docs/ops/midwife-practice-research.md`.

## 2. The bidan's job, as the regulation defines it

Permenkes 28/2017 was revoked by Permenkes 13/2025 Pasal 309 huruf cc, but 13/2025 Pasal 305(1) makes the per-profession practice Permenkes the reference for a health worker's authority until a Konsil/Kolegium standar profesi is stipulated by the Minister (Pasal 174(3)). Its Pasal 18–27 therefore remain the most precise statement of what a midwife may do; the *mechanism* for programme authority, "no other worker" authority and the doctor's mandate is now PP 28/2024 Pasal 742–745 and Permenkes 13/2025 Pasal 182–187 (P25-T01, research doc §1).

| Basis | Authority | What it includes |
|---|---|---|
| Pasal 19 | Maternal care, own authority | Pre-pregnancy counselling, antenatal care for a normal pregnancy, normal delivery, normal nifas, breastfeeding, counselling between pregnancies. Episiotomy; suturing grade I–II tears; first emergency handling then referral; iron tablets in pregnancy; high-dose vitamin A postpartum; IMD and exclusive breastfeeding; uterotonics in active management of the third stage; antenatal classes; pregnancy and birth certificates. |
| Pasal 20 | Child care, own authority | Essential neonatal care: IMD, cord care, vitamin K1 injection, HB0 immunisation, newborn examination, danger signs, identity tag, timely referral. First handling of asphyxia, hypothermia in low birth weight, cord infection, gonococcal eye infection. Growth and development monitoring with weight, head circumference, height and KPSP. |
| Pasal 21 | Reproductive health and KB, own authority | Counselling; oral contraceptives, condoms and injectables — nothing else. |
| Pasal 23, 25 | Government programme, after training and a district decision | IUD and implant (insertion **and removal** — "pelayanan kontrasepsi" is defined in Permenkes 21/2021 Pasal 1(5) as "pemasangan atau pencabutan"); antenatal care integrated with disease-specific interventions; sick infants and toddlers under MTBS (0–59 months; MTBM 0–2 months); routine and supplementary immunisation; community work; STI detection and referral. Evaluated at the workplace within six months of training. **Now granted as a government penugasan after training or orientation, for a set period** (PP 28/2024 Pasal 744(2)(b), (4), (8); Permenkes 13/2025 Pasal 187). |
| Pasal 26 | No other health worker in the area | Broader authority set by the district, lapsing once another qualified worker is available. **Now** PP 28/2024 Pasal 744(2)(a), (3); Permenkes 13/2025 Pasal 186: the dinas declares the absence, training precedes the grant, the government sets the period. |
| Pasal 27 | Doctor's mandate | Written, from a doctor at the FKTP where she works, under that doctor's supervision, never a clinical decision, never continuous. The doctor carries responsibility. **Now** PP 28/2024 Pasal 745 and Permenkes 13/2025 Pasal 182–184: written, supervised, no decision-making, report back to the doctor; plus a **delegation** form where responsibility moves to the midwife while the doctor is absent 1–3 months. |
| Pasal 28 | Obligations | Systematic care records; reporting of practice including births and deaths; referral letters and birth certificates; referring what is outside her authority. |

### Her working rhythm

- **Antenatal:** at least six visits (one in trimester 1, two in trimester 2, three in trimester 3) under the 10T integrated standard — Permenkes 21/2021.
- **Delivery:** APN across kala I–IV; newborn IMD, vitamin K1, eye ointment, HB0; congenital hypothyroidism screening (SHK) heel prick at 48–72 hours.
- **Nifas:** KF1 6 h–2 d, KF2 3–7 d, KF3 8–28 d, KF4 29–42 d. **Neonatal:** KN1 6–48 h, KN2 3–7 d, KN3 8–28 d.
- **Records:** Buku KIA, kartu ibu, kohort ibu, register ibu, register bayi, MTBS charts, KPSP forms, informed consent, referral forms; monthly KIA report to the puskesmas coordinator, rolled into PWS KIA; e-Kohort KIA.
- **Money:** BPJS pays non-capitation per service (Permenkes 3/2023): antenatal about Rp70.000 per visit, normal delivery Rp1.200.000 at a non-puskesmas FKTP, postpartum Rp50.000 per visit (figures from a secondary source; P25-T13 verifies them against the lampiran). A PMB claims as a *bidan jejaring* through its induk FKTP, monthly, entered in PCare.

## 3. Coverage map

Status: **Built** = merged to main · **Planned** = filed in P24 · **Deferred** = product decision, 11 Sep · **Gap** = new in this addendum.

| Part of the job | Status | Where it lives |
|---|---|---|
| Clinician login and own patients | Built | P24-T02, P24-T03 |
| Reported to SATUSEHAT as herself | Built | P24-T02 (NIK lookup is profession-agnostic) |
| Prescribing boundary | Built | P24-T04 — flag per medication, clinic decides |
| Rooms, wards and beds on SATUSEHAT | Built | P24-T05, P24-T06 |
| Direct admission in labour; discharge disposition | Planned | P24-T08, P24-T09 |
| Newborn registration and SATUSEHAT identity | Planned | P24-T10, P24-T11, P24-T13 |
| Immunisation completeness | Planned | P24-T12 |
| Patient KYC at the desk | Planned | P24-T14–T16 |
| Pregnancy episode, K1–K6, 10T | Deferred | E8 |
| Partograf, delivery record, APGAR | Deferred | E9 |
| KF1–KF4 and KN1–KN3 schedules | Deferred | E10 |
| Family planning service record | Deferred | E11 |
| Per-midwife authorities (IUD/implant, MTBS, immunisation) | Gap | E6 |
| Doctor's mandate with a named supervisor | Gap | E6 |
| Legally enumerated default formulary | Gap | E7 |
| SHK sample and result tracking | Gap | E9 |
| Pregnancy and birth certificates; birth and death report | Gap | E8, E9, E12 |
| Kohort registers and the monthly KIA report | Gap | E12 |
| BPJS bidan jejaring non-capitation claims | Gap | E13 — coverage of our PCare integration unverified |

## 4. Goals and non-goals

| Goal | Measure | Target |
|---|---|---|
| A midwife never performs a programme-only action without an authority on file | IUD/implant procedures and MTBS encounters by a `MIDWIFE` without an active authority | 0 |
| A pregnancy is one record from K1 to KF4 | Closed pregnancy episodes with every visit linked, at pilot clinics | ≥ 90% |
| The monthly report writes itself | Pilot midwives who submit the KIA monthly report from the export without re-typing | 3 of 3 |
| ANC and PNC reach SATUSEHAT | Closed antenatal and nifas visits accepted by the ANC and PNC use cases | ≥ 95% |
| A PMB can bill BPJS through the product | Network claims for ANC, delivery and PNC prepared without leaving the app | 1 pilot month |

**Non-goals**

- Enforcing clinical protocols inside a visit (which drug, which dose) beyond the formulary and authority checks.
- A `NURSE` role, a `/bidan` URL alias, or renaming `DoctorProfile` (D-034 stands).
- Posyandu and community outreach tooling (Pasal 25e, 25i).
- Two-way e-Kohort sync before the P25-T11 spike confirms there is an interface to sync with.

## 5. Epics

Numbering continues the parent PRD (E1–E5). Requirement IDs use new prefixes so they never collide with FR-MW, FR-LOC or FR-NB.

### Naming as filed (differs from the first draft on purpose)

The tickets use the repo's vocabulary: the record is a **`DoctorAuthority`** (Indonesian *kewenangan*) hanging off `DoctorProfile`, permission keys are `doctor.authority.read:any` / `doctor.authority.write:any`, the refusal code is `MIDWIFE_AUTHORITY_REQUIRED`, and expiry thresholds are 60/30/0 days (the licence and vault pattern), not 60/14.

### E6 — Midwife authorities and the doctor's mandate (Gap)

A clinic records what each midwife is authorised to do beyond her own authority, and the product holds her to it. Basis: Permenkes 28/2017 Pasal 23–27. Resolves parent PRD Q3 for the actions the product can see.

| ID | Priority | Requirement |
|---|---|---|
| FR-AUTH-01 | MUST | A clinician authority record: kind (`IUD_IMPLANT`, `MTBS`, `PROGRAM_IMMUNIZATION`, `INTEGRATED_ANC`, `NO_OTHER_WORKER`), training certificate reference, the grant reference — a dinas penetapan, a government penugasan or the STR annotation of the added competence (D-036) — with its date, valid from/to (the period the government set), attached letter. Only for profiles with `profession = MIDWIFE`. (P25-T02) |
| FR-AUTH-02 | MUST | An IUD procedure (`69.7` insertion, `97.71` removal) recorded by a midwife without an active `IUD_IMPLANT` authority is refused with 422 `MIDWIFE_AUTHORITY_REQUIRED`, naming the kind. Implants have no ICD-9-CM code (P25-T01 §4) and are gated by method (FR-KB-02) or the procedure-form implant flag, never by `99.23`/`97.89`. (P25-T03) |
| FR-AUTH-03 | MUST | A midwife without `MTBS` cannot open a **sick-child** encounter for a child under 60 months; the encounter is opened with an explicit child-visit purpose (`WELL_CHILD`, `NEONATAL_FIRST_AID`, `SICK_CHILD`) and only `SICK_CHILD` is gated, so Pasal 20 own-authority work is never blocked. `NEONATAL_FIRST_AID` is allowed only for a patient ≤ 28 days old and must end in a referral or a recorded reason (P25-T01 §5). The form says why and offers referral. (P25-T03) |
| FR-AUTH-04 | MUST | A doctor's mandate record with form `MANDATE` or `DELEGATION` (PP 28/2024 Pasal 745; Permenkes 13/2025 Pasal 182–184): mandating doctor, the delegated action, date range (never open-ended; a delegation only while the doctor is absent 1–3 months), written instruction attached, report back to the doctor. Actions performed under a mandate show the supervising doctor on the record; under a delegation the midwife carries responsibility. (P25-T05) |
| FR-AUTH-05 | SHOULD | Expiry notices for authorities reuse the licence expiry pattern (P16), at 60, 30 and 0 days. (P25-T02) |
| FR-AUTH-06 | MUST | Every grant, revocation and refused action is audited with the actor; permission keys `doctor.authority.read:any` and `doctor.authority.write:any` for `ADMIN`, plus the web preset and resource map. (P25-T02, T03) |

- **US-AUTH-01** — As a clinic owner, I want a midwife without IUD training stopped before she records an insertion, so that the clinic is not exposed. GIVEN Bidan Sari has no active `IUD_IMPLANT` authority WHEN she records an IUD insertion THEN the API returns 422 `MIDWIFE_AUTHORITY_REQUIRED` and nothing is saved.
- **US-AUTH-02** — As a clinic admin, I want to upload Sari's district decision letter once, so that her authority is valid until the date on it. GIVEN a decision letter valid to 31 Dec 2027 WHEN the admin saves the authority THEN IUD insertions by Sari are accepted until that date and a notice is sent 60 days before.

### E7 — The midwife formulary template (Gap)

A clinic turns on the medicines a midwife may give in one step, instead of flagging a catalogue by hand from nothing. Basis: Pasal 19(3), 20(3), 21, 25. Extends P24-T04 without changing its rule that the clinic decides.

| ID | Priority | Requirement |
|---|---|---|
| FR-FORM-01 | MUST | A formulary template of own-authority items by KFA product: iron tablets for pregnancy, vitamin A 200.000 IU, oxytocin, vitamin K1 injection, HB0 vaccine, neonatal eye ointment, oral contraceptive, injectable contraceptive, condom. The seed ships the template, never applied. (P25-T04) |
| FR-FORM-02 | MUST | "Terapkan daftar bidan" on the medication catalogue matches template items to local medications by KFA code, shows what matched and what did not, and flags only after confirmation. (P25-T04) |
| FR-FORM-03 | SHOULD | Authority-bound items (IUD, implant, MTBS medicines, programme vaccines) are a second group that is only prescribable by a midwife holding the matching E6 authority. (P25-T05) |

### E8 — The pregnancy episode and antenatal care (Deferred)

A pregnancy is one record from the first visit to the end of nifas, and each antenatal visit captures 10T and reaches SATUSEHAT. Basis: Permenkes 21/2021; SATUSEHAT ANC playbook (EpisodeOfCare, 17 steps). Depends on the P25-T01 research outcome.

| ID | Priority | Requirement |
|---|---|---|
| FR-ANC-01 | MUST | A pregnancy episode on the mother: HPHT, estimated due date, gravida / para / abortus, risk factors, status (`ACTIVE`, `DELIVERED`, `ENDED`). One active episode per patient. |
| FR-ANC-02 | MUST | An antenatal visit links to the episode and is numbered K1–K6 from gestational age and visit order, with the trimester rule (1 / 2 / 3) shown as due or missed. Trimesters are 0–12, >12–24 and >24 weeks from HPHT (Permenkes 21/2021 Lampiran I); the first visit carries a derived `K1M` (≤12 weeks) or `K1A` (>12 weeks) flag, labelled as programme convention (no official definition found, P25-T01 §3.2); visits after the sixth are numbered but carry no SATUSEHAT ANC identifier. |
| FR-ANC-03 | MUST | A 10T checklist per visit: weight and height, blood pressure, nutritional status (LiLA), fundal height, foetal presentation and heart rate, TT/Td status, iron tablets, laboratory (Hb, HIV, syphilis, HBsAg, glucose, urine protein), case management, counselling. |
| FR-ANC-04 | MUST | An abnormal finding outside normal-pregnancy criteria prompts referral; the referral letter is generated from the visit. |
| FR-ANC-05 | MUST | Closed visits are sent through the SATUSEHAT ANC use case: EpisodeOfCare, obstetric Observations, foetal Observations, lab, Procedure, MedicationRequest. |
| FR-ANC-06 | MUST | A pregnancy certificate (surat keterangan kehamilan) is rendered from the episode, reprintable, filed as a clinical document. |
| FR-ANC-07 | MUST | Confirmed by P25-T01 (Permenkes 21/2021 Pasal 13(4)–(5)): the episode shows the two required doctor visits — one in trimester 1 (ideally the first contact, <12 weeks) and one in trimester 3 — each with a USG flag, and whether they happened. A doctor visit done at another facility is recorded on the episode as external (facility, date, USG done) so a klinik bidan without a doctor is not shown as non-compliant for a visit she referred. |

- **US-ANC-01** — As a bidan, I want to see which antenatal visit this is and what is still missing, so that no mother reaches term with a skipped trimester. GIVEN Ibu Rina at 29 weeks with K1 and K2 recorded WHEN the bidan opens the visit THEN it is numbered K3 and the episode shows two trimester-3 visits still due.

### E9 — Delivery, the newborn's first hours, and SHK (Deferred)

Basis: Pasal 19(3), 20(3)–(4); APN; SHK programme. Builds on P24-T09 (direct admission) and P24-T10 (newborn registration).

| ID | Priority | Requirement |
|---|---|---|
| FR-INC-01 | MUST | A delivery record on the episode: onset, kala I–IV times, mode (normal only for a midwife), episiotomy, tear grade (I–II within authority), uterotonic given, blood loss, placenta, referral if any. |
| FR-INC-02 | SHOULD | A partograf: cervical dilatation, descent, contractions and foetal heart rate on the WHO grid, with alert and action lines. |
| FR-INC-03 | MUST | Newborn essentials checklist with times: IMD, cord care, vitamin K1, eye ointment, HB0, examination, identity tag, APGAR at 1 and 5 minutes, weight, length, head circumference. |
| FR-INC-04 | MUST | SHK tracking: sample due at 48–72 hours, taken date, sent, result, recall if positive; a due-sample list for the clinic. |
| FR-INC-05 | MUST | A birth certificate (surat keterangan kelahiran) rendered from the delivery and newborn record; the delivery closes the pregnancy episode as `DELIVERED`. |

### E10 — Nifas and neonatal visit schedules (Deferred)

Basis: Permenkes 21/2021; SATUSEHAT PNC playbook.

| ID | Priority | Requirement |
|---|---|---|
| FR-PNC-01 | MUST | From the delivery time, generate KF1 (6 h–2 d), KF2 (3–7 d), KF3 (8–28 d), KF4 (29–42 d) for the mother and KN1 (6–48 h), KN2 (3–7 d), KN3 (8–28 d) for the baby, each with its window. |
| FR-PNC-02 | MUST | A visit recorded inside a window fulfils it; outside it is recorded but the window shows missed. |
| FR-PNC-03 | MUST | Nifas visits capture vital signs, involution, lochia, breastfeeding, vitamin A, KB counselling; closed visits go through the SATUSEHAT PNC use case. |
| FR-PNC-04 | SHOULD | A "due this week" worklist and a WhatsApp reminder to the mother through the existing channel gateway, with consent. |

### E11 — Family planning services (Deferred)

Basis: Pasal 21 and 25(1)a; BKKBN training rules.

| ID | Priority | Requirement |
|---|---|---|
| FR-KB-01 | MUST | A KB record per acceptor: method (pill, 1-month and 3-month injectable, condom, IUD, implant), new or continuing acceptor, start date, next due date, side effects, discontinuation reason. |
| FR-KB-02 | MUST | IUD and implant methods require the E6 authority when the provider is a midwife. |
| FR-KB-03 | SHOULD | Post-delivery KB (KB pasca salin) can be started from the delivery or KF visit. |

### E12 — Registers and the monthly KIA report (Gap)

Basis: Pasal 28(h); PMB technical standard (pencatatan dan pelaporan); PWS KIA; e-Kohort KIA.

| ID | Priority | Requirement |
|---|---|---|
| FR-RPT-01 | MUST | Kohort ibu, kohort bayi, kohort balita and kohort KB views built from E8–E11 data, filterable by month and village, printable in the puskesmas column layout. |
| FR-RPT-02 | MUST | A monthly KIA report export (K1, K4/K6, deliveries by health worker, KF, KN, KB acceptors, immunisation) in the format the pilot puskesmas accepts. |
| FR-RPT-03 | MUST | A birth and death report for the month, as Pasal 28(h) requires. |
| FR-RPT-04 | SHOULD | e-Kohort KIA submission, only if the P25-T11 spike finds an interface; otherwise an export matching its import. |

### E13 — BPJS bidan jejaring claims (Gap)

Basis: Permenkes 3/2023 standard tariffs; network midwife claims submitted through the induk FKTP by the 10th of the following month (secondary source; P25-T13 verifies).

| ID | Priority | Requirement |
|---|---|---|
| FR-JKN-01 | MUST | A spike (P25-T13) establishes what our PCare integration already sends for non-capitation maternal services, and whether a PMB submits itself or through its induk. |
| FR-JKN-02 | MUST | A monthly recap of claimable ANC, delivery and PNC services per BPJS participant with the Permenkes 3/2023 tariff, ready for the induk FKTP. |
| FR-JKN-03 | SHOULD | Services outside the claim window are flagged before the 10th. |

## 6. Sprint backlog (as filed, 2026-09-14)

Points use the board's Fibonacci scale. Board ids are SJ-224..240 (P25-T01..T17). Sprint 29 holds T01–T04, T11, T13 plus P24-T12; the rest are Backlog with no sprint.

| Ticket | Board id | Scope | Pts | Depends on |
|---|---|---|---|---|
| P25-T01 | SJ-224 | Research: PP 28/2024 vs Permenkes 28/2017 on midwife authority; the doctor-visit rule in Permenkes 21/2021; trimester/K1 definitions; implant codes; neonatal boundary; pilot puskesmas report format | 3 | — |
| P25-T02 | SJ-225 | E6 `DoctorAuthority` model, decree upload, admin card, audit, permissions, expiry notices (FR-AUTH-01, 05, 06) | 8 | — |
| P25-T03 | SJ-226 | E6 enforcement: IUD/implant refusal, child-visit purpose with MTBS gate, refusal audit, profession-mismatch report (FR-AUTH-02, 03) | 5 | T01, T02 |
| P25-T04 | SJ-227 | E7 formulary template, KFA match preview and "Terapkan daftar bidan" (FR-FORM-01, 02) | 3 | — |
| P25-T05 | SJ-228 | E6 doctor's mandate record and supervisor on delegated actions (FR-AUTH-04); E7 authority-bound items (FR-FORM-03) | 5 | T02, T04 |
| P25-T06 | SJ-229 | E8 pregnancy episode, K-visit numbering, trimester due view (FR-ANC-01, 02, 07) | 8 | T01 |
| P25-T07 | SJ-230 | E8 10T checklist, referral, pregnancy certificate (FR-ANC-03, 04, 06) | 8 | T06 |
| P25-T08 | SJ-231 | E8 SATUSEHAT ANC use case submission (FR-ANC-05) | 8 | T07 |
| P25-T09 | SJ-232 | E9 delivery record, newborn essentials, APGAR, birth certificate (FR-INC-01, 03, 05) | 8 | T06, P24-T09, P24-T10 |
| P25-T10 | SJ-233 | E9 SHK tracking and due-sample list (FR-INC-04) | 3 | T09 |
| P25-T11 | SJ-234 | Spike: e-Kohort KIA interface and import format (FR-RPT-04) | 2 | — |
| P25-T12 | SJ-235 | E10 KF/KN schedules, windows, PNC use case (FR-PNC-01–03) | 8 | T09 |
| P25-T13 | SJ-236 | Spike: PCare coverage of bidan jejaring non-capitation claims (FR-JKN-01) | 2 | — |
| P25-T14 | SJ-237 | E11 family planning record and next-due (FR-KB-01–03) | 5 | T03 |
| P25-T15 | SJ-238 | E12 kohort views, monthly KIA report, birth and death report (FR-RPT-01–03) | 8 | T07, T09, T12, T14 |
| P25-T16 | SJ-239 | E13 monthly claim recap and late-claim flags (FR-JKN-02, 03) | 5 | T13 |
| P25-T17 | SJ-240 | SHOULD items: partograf (FR-INC-02), due-this-week worklist and reminders (FR-PNC-04) | 8 | T09, T12 |

Total 94 points at the team's recent velocity of roughly 27 points per sprint.

## 7. Open questions

| ID | Question | Owner | Blocks | Answer |
|---|---|---|---|---|
| Q9 | Does PP 28/2024 or a newer Permenkes change midwife authority? Parent PRD Q4, now blocking. | Product, legal | E6, E7 | **VERIFIED (P25-T01, 2026-09-15).** Permenkes 28/2017 is revoked by Permenkes 13/2025 Pasal 309 huruf cc, but 13/2025 Pasal 305(1) keeps the per-profession practice Permenkes as the authority reference until a Pasal 174(3) standar profesi is stipulated by the Minister — so the Pasal 18–27 list still applies, by that route. The mechanism moved to PP 28/2024 Pasal 742–745 and 13/2025 Pasal 182–187: programme and no-other-worker authority are a government **penugasan** after training for a set period; training-added competence is written on the STR; the mandate gains a **delegation** form (responsibility moves to the midwife, doctor absent 1–3 months, written, reported back). The five FR-AUTH-01 kinds stand; evidence fields and FR-AUTH-04 change — `docs/post-mvp/decisions.md` D-036. Whether a standar profesi bidan has since been stipulated is STILL UNKNOWN (owner Product with legal). Detail: `docs/ops/midwife-practice-research.md` §1 |
| Q10 | Must two of the six antenatal visits be with a doctor, with ultrasound? Where does a klinik bidan get them? | Product, pilot bidan | FR-ANC-07 | **VERIFIED.** Permenkes 21/2021 Pasal 13(4)–(5): of the ≥6 visits, at least 2 by a dokter or SpOG, in trimester 1 and trimester 3, including USG; Lampiran I: the trimester-1 doctor visit at <12 weeks or the first contact (risk screening + USG), the trimester-3 one for birth planning (+ USG, planned referral). 21/2021 stays in force for masa hamil (Permenkes 2/2025 Pasal 85(d) revoked only its contraception and sexual-health parts). A klinik bidan without a doctor refers the mother for those two visits (Puskesmas, doctor, SpOG) and records them as done elsewhere; FR-ANC-07 is now MUST. Trimesters: 0–12 / >12–24 / >24 weeks (Lampiran I). Research doc §2–3 |
| Q11 | Which monthly report layout do the pilot puskesmas accept, and is it the same across districts? | Product, pilot bidan | E12 | **STILL UNKNOWN** — owner Product via the pilot bidan, requested 2026-09-15: blank or anonymised form, headers verbatim, paper/Excel/system, second district. Provisional, clearly labelled: a district open-data LB3-KIA Maternal sheet (antenatal lab block, 36 numbered columns) and the PWS-KIA 2010 indicator list, both in research doc §7. The Kemenkes "Kohort Ibu 2020" register PDF was unreachable (503) on the research day |
| Q12 | Does a pilot PMB claim BPJS itself or through an induk clinic, and which clinic? | Product, pilot bidan | E13 | _Pending P25-T13_ |
| Q13 | Does the pilot clinic want the partograf digital, or keep paper and record outcomes only? | Pilot bidan | FR-INC-02 | Open |

## 8. Risks

- **Existing midwife accounts registered as doctors.** The dev database already has one (MIDWIFE role, profile still `DOCTOR`), so the P24-T04 boundary does not apply to her. P25-T03 ships a profession-mismatch report to run on every pilot database before enforcement.
- **E8 is the largest clinical surface since the EMR.** Designing it before Q9 and Q10 are answered risks a rebuild.
- **Price competition.** The Ministry's free ASRI records app runs until 31 Dec 2026. E12 and E13 are what a midwife cannot get from it.
- **Reporting formats differ by district.** Pilot with one puskesmas and treat the export layout as configuration.

## 9. Sources

1. Permenkes 28/2017, Izin dan Penyelenggaraan Praktik Bidan — Pasal 5–31 read from the official gazette PDF (https://peraturan.go.id/files/bn954-2017.pdf); revoked by Permenkes 13/2025 Pasal 309 cc, still the authority reference via its Pasal 305(1) — see `docs/ops/midwife-practice-research.md`
2. Standar Teknis Praktik Mandiri Bidan, Dinkes Salatiga — rooms, equipment, pencatatan dan pelaporan (https://dinkes.salatiga.go.id/wp-content/uploads/2024/05/10.-STANDAR-TEKNIS-PRAKTIK-MANDIRI-BIDAN.pdf)
3. Permenkes 21/2021 — pregnancy, delivery, nifas (in force) and contraception (revoked by Permenkes 2/2025 Pasal 85 d) services (https://peraturan.go.id/files/bn853-2021.pdf)
3a. PP 28/2024 Pasal 742–745, Permenkes 13/2025 Pasal 174, 182–187, 305, 309; Permenkes 2/2025 Pasal 38–43, 85; Permenkes 3/2026 Pasal 9–11, 99; Permenkes 25/2014 Pasal 1, 8 — all read from the official PDFs listed in the research doc (P25-T01)
4. SATUSEHAT ANC playbook (https://satusehat.kemkes.go.id/platform/docs/id/interoperability/anc/) and PNC playbook (https://satusehat.kemkes.go.id/platform/docs/id/interoperability/pnc/)
5. 10T antenatal components; KF and KN windows (https://jurnal.poltekkeskupang.ac.id/index.php/jkp/article/download/596/333) and Pedoman Pelayanan Antenatal Terpadu (https://repository.kemkes.go.id/book/147)
6. Newborn care sequence and SHK timing (https://eprints.poltekkesjogja.ac.id/15793/4/Chapter%202.pdf)
7. Kohort and PWS KIA reporting (https://www.informasibidan.com/2022/06/pemantauan-wilayah-setempat-kia-pws-kia.html) and e-Kohort KIA training for PMB (https://dinkes.banjarmasinkota.go.id/2022/04/sosialisasi-penggunaan-e-kohort-kia.html)
8. Permenkes 3/2023 standard tariffs (https://luk.staff.ugm.ac.id/atur/Permenkes3-2023StandarTarif.pdf) and network midwife claims through the induk FKTP (https://jurnal.unprimdn.ac.id/index.php/jpms/article/download/974/2/2486)
9. IUD and implant authority for trained midwives (https://dinasppkbdanp3a.wonogirikab.go.id/web/detail/78/menkes_akan_surati_kepala_dinkes_agar_perbolehkan_bidan_layani_pasang_alat_kontrasepsi_iud_dan_implan)
10. Kepmenkes HK.01.07/MENKES/320/2020, Standar Profesi Bidan (https://repositori-ditjen-nakes.kemkes.go.id/294/)
11. ASRI, the free Ministry records app (https://blog.assist.id/rekam-medis-elektronik-gratis-di-indonesia/)
