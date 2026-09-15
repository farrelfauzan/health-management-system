# Klinik Bidan: BPJS bidan jejaring non-capitation claims spike (P25-T13)

Researched on **15 September 2026**, from the repository on `main` (`6be85bc7`) and from the primary
sources listed at the end: the official Permenkes 3/2023 PDF (BPK JDIH download, read with `pdf-parse`),
Perpres 82/2018 and its three amendments, Peraturan BPJS Kesehatan 7/2018, Permenkes 28/2014, Permenkes
71/2013, and the BPJS eClaim application's own release notes on `bpjs-kesehatan.go.id`. It answers the
questions the midwife-practice addendum (`docs/product/prd-klinik-bidan-midwife-practice.md`, FR-JKN-01
and Q12, landing with P25-T01) leaves for this ticket. Each answer is marked **VERIFIED** or
**STILL UNKNOWN**, with the source and, for the tariffs, the page of the official PDF.

No web summary is quoted for a figure. Where a secondary page pointed at a source, the source itself was
downloaded and read. No credentials and no personal names appear in this file.

## Summary

| #   | Question                                                                  | Answer                                                                                                                                                                                                                                                                                                                                  | Status                                         | Unblocks / blocks                            |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| Q1  | Does a bidan jejaring have its own PCare credentials and `kdProviderPpk`? | **Its own eClaim (PCare web app) login exists**, tied to the induk's code: BPJS shipped "Login Bidan Jejaring" and pulls the FPK "berdasarkan kode FKTP Induk". **No evidence of web-service credentials** (`consId`/`userKey`) for a jejaring; every published credential set is per FKTP with a PKS                                   | PARTLY VERIFIED (login yes, API unknown)       | P25-T16 scope                                |
| Q2  | Where are ANC, delivery and PNC claims entered today?                     | **In the eClaim web app** (`pcarejkn.bpjs-kesehatan.go.id/eclaim`, "ECLAIM - Primary Care", version 8.12.0), which has "Inputan Jenis Pelayanan Non Kapitasi" and a bidan-jejaring mode. **No `klaim`/`tindakan` write endpoint** is known in the PCare REST catalogue; the official catalogue portal did not answer from here          | VERIFIED (web app) / STILL UNKNOWN (API)       | P25-T16 route                                |
| Q3  | Required supporting documents and the claim deadline                      | Documents: **Peraturan BPJS 7/2018 Pasal 12–14** (FPK, rekap, kuitansi, SPTJM signed by the FKTP head; KIA book sheet, partograf copy, surat keterangan kelahiran, KB book/consent). Deadline: **"paling lambat tanggal 10 bulan berikutnya"** is Permenkes 28/2014 (still in force); the binding cut-off is **6 months** after service | VERIFIED                                       | P25-T16 checklist, FR-JKN-01                 |
| Q4  | Are the addendum's tariff figures right?                                  | **Rp70.000 ANC and Rp50.000 PNC per visit for a bidan jejaring: correct** (Permenkes 3/2023 pp. 13, 15). **Rp1.200.000 delivery is the non-puskesmas FKTP rate with a doctor on the team; a two-midwife team with no doctor is Rp800.000** (p. 14). ANC is **per visit**, not a package. Full table in §4                               | VERIFIED, one correction                       | Changes FR-JKN-01                            |
| Q12 | Is the pilot PMB a network member of an induk clinic, and which?          | Not reachable from the repository or public sources                                                                                                                                                                                                                                                                                     | STILL UNKNOWN, owner Product, asked 2026-09-15 | Blocks any P25-T16 test against a real induk |
| —   | P25-T16 recommendation                                                    | **Recap export for the induk**, shaped like the eClaim entry plus the Pasal 12–14 document checklist. Not PCare submission; not drop                                                                                                                                                                                                    | Recommendation                                 | P25-T16                                      |

## 0. What the repository has today (re-verified 15 September 2026)

The ticket's premise holds on `main`:

- `BpjsSubmissionType` is `PENDAFTARAN`, `KUNJUNGAN`, `PENDAFTARAN_DELETE`, `OBAT` plus the Antrean
  types (`apps/api/prisma/schema.prisma`, `enum BpjsSubmissionType`). The submission service posts to
  `pendaftaran`, `kunjungan` and `obat/kunjungan` only
  (`apps/api/src/modules/bpjs-pcare/service/bpjs-submission.service.ts`).
- The `kunjungan` payload carries diagnoses, vitals, discharge status, referral and `kdTkp` (fixed to the
  outpatient bucket); it has **no tindakan and no tariff field**
  (`apps/api/src/common/bpjs-pcare/build-bpjs-kunjungan-payload.ts`).
- `TINDAKAN` exists only as a reference catalogue, synced per `kdTkp` bucket from
  `tindakan/kdTkp/{group}/{start}/{limit}` (`apps/api/src/common/bpjs-pcare/bpjs-pcare-reference-catalogs.ts`,
  `enum BpjsReferenceCatalog`).
- `grep -rniE "kapitasi|klaim|jejaring|faskes induk|capitation"` over `apps/api/src`, `apps/web`,
  `packages` and `docs` matches one chatbot spec fixture and nothing else.
- `BpjsPcareConfig` has `consId`, `kdProviderPpk`, `pcareUsername`, the three ciphertexts and test
  metadata; **no induk field** (`schema.prisma`, `model BpjsPcareConfig`).
- No encounter, registration or invoice has a payer type. A visit reaches the PCare outbox when the patient
  has a `bpjsNumberCiphertext` **and** an active `BpjsPcareConfig` row exists (`enqueueBpjsPendaftaran` in
  `apps/api/src/modules/registration-flow/repository/registration-flow.repository.ts`, `enqueueBpjsKunjungan`
  in `apps/api/src/modules/emr/repository/encounter.repository.ts`). A PMB with no PCare config therefore
  enqueues nothing, and the monthly reconciliation (`bpjs-report.service.ts`) counts only the outbox.
- `docs/post-mvp/bpjs-pcare.md` scopes VClaim out (its scope line) and lists the PCare surface in §4:
  `peserta`, `pendaftaran`, `kunjungan`, `obat`, `rujukan` and the reference lookups. `tindakan` appears only
  on the reference row.

## 1. Credentials: does a bidan jejaring have its own PCare access? (Q1)

**What the regulations say about the relationship.**

- Permenkes 71/2013 Pasal 8 (p. 7): BPJS Kesehatan may contract a _praktik bidan_ directly (1) where the
  district health office declares a kecamatan has no doctor, or (2) "dalam rangka pemberian pelayanan
  kebidanan di suatu wilayah tertentu". The requirements include "perjanjian kerja sama dengan dokter atau
  puskesmas pembinanya" (Pasal 8 ayat (3) huruf c). So even the direct route runs through a supervising
  doctor or puskesmas.
- Permenkes 28/2014, lampiran p. 38–39 ("Bidan Jejaring dari FKTP"): in JKN the bidan providing kebidanan
  and neonatal care "merupakan jejaring dari FKTP yang telah bekerjasama dengan BPJS Kesehatan". A
  non-government FKTP "dapat mengenakan biaya pembinaan dengan besaran maksimal 10% dari total klaim". Where
  the bidan is networked to a government FKTP, "klaim dilakukan melalui FKTP milik Pemerintah Daerah", which
  then pays the bidan in full. BPK JDIH lists this Permenkes as **Berlaku** on 15 September 2026.
- Peraturan BPJS 7/2018 Pasal 12 (p. 10): every FKTP claim needs an FPK and a _surat tanggung jawab
  mutlak_ "yang ditandatangani oleh Pimpinan FKTP". The signatory is the induk, not the midwife.

**What BPJS's own application says.** The eClaim login page on `pcarejkn.bpjs-kesehatan.go.id` ("ECLAIM -
Primary Care", application version 8.12.0 on 15 September 2026) publishes its release history. The bidan
jejaring entries, verbatim:

| Version | Date             | Note                                                                                                                                                                                                                                               |
| ------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.2.0   | 06 Mei 2019      | "Pembukaan Akses PCare sebagai Bidan Jejaring"                                                                                                                                                                                                     |
| 3.4.0   | 21 Mei 2019      | "Penagihan Klaim Bidan Jejaring"                                                                                                                                                                                                                   |
| 3.4.1   | 19 Juni 2019     | "Login Bidan Jejaring, Faskes asal perujuk terisi otomatis sesuai dengan Faskes terdaftar." / "Pada menu verifikasi KC, ketika pencarian FPK ditarik berdasarkan kode FKTP Induk." / "Validasi Jenis Kelamin Laki-Laki pada login Bidan Jejaring." |
| 4.0.0   | 1 Agustus 2019   | "BMHP, Suhu, Inputan Jenis Pelayanan Non Kapitasi" / "Pelayanan Tindakan Kapitasi"                                                                                                                                                                 |
| 4.1.0   | 1 September 2019 | "Penyesuaian Persalinan Normal Emergensi Dasar Disamakan Dengan Persalinan Normal"                                                                                                                                                                 |
| 4.5.0   | 10 April 2020    | "Implementasi Bidan Jejaring Skala Nasional"                                                                                                                                                                                                       |
| 4.6.0   | 29 April 2020    | "Poli KIA dan KB otomatis muncul pada Bidan Jejaring"                                                                                                                                                                                              |

**Answer.**

- **VERIFIED:** a bidan jejaring can hold its **own eClaim web-app login**, nationally since April 2020. The
  login is bound to an induk: the referring facility is filled from "Faskes terdaftar", and at the branch
  office the FPK is searched "berdasarkan kode FKTP Induk". So the midwife may key her own visits, but the
  claim is the induk's (its code, its FPK, its signatures).
- **STILL UNKNOWN:** whether that login comes with **web-service credentials** (`consId`, `secretKey`,
  `userKey`) or a `kdProviderPpk` of its own. Nothing on a government domain describes one. Every bridging
  credential set this repository documents is issued per FKTP with a PKS by the kantor cabang
  (`docs/post-mvp/bpjs-pcare.md` §1), and the eClaim notes speak only of a _login_. **Asked:** Product, to
  put to the induk and its BPJS kantor cabang together with Q12, 2026-09-15.

## 2. Where non-capitation ANC, delivery and PNC claims are entered (Q2)

| Route                                                                                    | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Status                                  |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **eClaim web app** (`https://pcarejkn.bpjs-kesehatan.go.id/eclaim/Login`)                | Exists, titled "ECLAIM - Primary Care", section "Fasilitas Kesehatan", version 8.12.0. Its notes list "Inputan Jenis Pelayanan Non Kapitasi" (4.0.0), FPK verification menus, ANC features (2.0.1: "Perbaikan Bug fitur ANC"), delivery rules (4.1.0) and the bidan jejaring mode (§1). This is the non-capitation entry point BPJS operates.                                                                                                                                                                                                                                            | VERIFIED                                |
| **PCare REST v3.0 web service** (the integration this repository holds)                  | The catalogue in `docs/post-mvp/bpjs-pcare.md` §4 has no `klaim` endpoint and `tindakan` only as a lookup. The community client the repository pins for its protocol facts (D-022) exposes `tindakan/kdTkp/{kdTkp}` and `tindakan/kunjungan/{noKunjungan}` as **GET only**, and `kunjungan` add/edit/delete with no tariff field. `GET tindakan/kunjungan/{noKunjungan}` shows tindakan lines _live on a kunjungan_, but no write for them is published. An unauthenticated GET on `https://new-api.bpjs-kesehatan.go.id/pcare-rest-v3.0/` returned "Application Server - Error report". | STILL UNKNOWN (no write endpoint found) |
| **Official catalogue** (`https://dvlp.bpjs-kesehatan.go.id:8888/trust-mark/portal.html`) | Connection timed out from this network on 15 September 2026 (twice, 40 s). Could not be read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | STILL UNKNOWN                           |
| **A separate "Aplikasi Klaim Non-Kapitasi"**                                             | Not found on any government domain. The older `pcare.bpjs-kesehatan.go.id/eclaim/` address timed out; search engines title it "Pcare Eclaim Pindah Alamat", which matches the move to `pcarejkn`. eClaim _is_ the non-capitation application.                                                                                                                                                                                                                                                                                                                                            | VERIFIED (no third application)         |

**Callable with the credentials we hold?** No. The credentials in `BpjsPcareConfig` are the contracting
FKTP's. A PMB that is a jejaring holds none in this model, and even for the induk no published endpoint
turns a `kunjungan` into a non-capitation tariff line. Peraturan BPJS 7/2018 Pasal 28 (p. 20) only says
BPJS "mengembangkan sistem pengelolaan klaim secara elektronik" and "dapat meminta dokumen kelengkapan
administrasi klaim dalam bentuk softcopy dan/atau melalui transaksi data elektronik"; that system is eClaim.

## 3. Supporting documents and the claim deadline (Q3)

### 3.1 Documents, from Peraturan BPJS Kesehatan 7/2018 (BN 2018/1712, status **Berlaku**)

Classification (Pasal 11, p. 9): ANC, PNC and pra rujukan are **RJTP** claims; persalinan is **RITP**.

**General, every FKTP claim (Pasal 12, p. 10):**

- formulir pengajuan klaim (FPK) signed by the Pimpinan FKTP or an authorised officer;
- rekapitulasi pelayanan;
- kuitansi asli bermaterai;
- surat tanggung jawab mutlak bermeterai signed by the Pimpinan FKTP;
- bukti pelayanan signed by the Peserta or a family member;
- the per-claim supporting documents below.

**ANC, PNC, pra rujukan (Pasal 13 huruf b, p. 11):**

- salinan lembar pelayanan pada buku KIA for the service given; **or**
- kartu ibu or another service record replacing the KIA book, signed by the mother and the attending
  officer, when the Peserta has no KIA book;
- pra rujukan additionally: surat keterangan rujukan with the patient's condition at referral and the
  tindakan and therapy given, from the referring doctor.

**Persalinan (Pasal 14 huruf b, p. 12):**

- salinan buku KIA for the service given;
- kartu ibu (or replacement) signed by the mother and the officer when there is no KIA book;
- **salinan partograf** signed by the birth attendant, or another statement describing the delivery;
- **surat keterangan kelahiran**;
- for emergensi dasar and tindakan pasca persalinan: a statement of the tindakan given.

**KB (Pasal 13 huruf d, p. 11):** salinan buku peserta KB; and, for implant, IUD and MOP, the signed
consent form.

### 3.2 Deadline

| Source                                     | Rule                                                                                                                                                                                                                                                          | Status                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Perpres 82/2018 Pasal 75 ayat (2) (p. 54)  | "FKTP mengajukan klaim nonkapitasi kepada BPJS Kesehatan secara periodik dan lengkap." No calendar date. Ayat (3): BPJS pays within 15 working days after the file is declared complete; ayat (5): 1% per month penalty for late payment (p. 55).             | VERIFIED                               |
| Perpres 82/2018 Pasal 77 (p. 56)           | Claims may be filed "paling lambat 6 (enam) bulan sejak pelayanan kesehatan selesai diberikan"; once passed, "klaim tidak dapat diajukan kembali". Perpres 75/2019, 64/2020 and 59/2024 do not amend Pasal 75 or Pasal 77 (checked in each amendment's text). | VERIFIED                               |
| Peraturan BPJS 7/2018 Pasal 29 (pp. 20–21) | Same "periodik dan lengkap"; a returned (incomplete) claim may be re-filed "paling lambat pada pengajuan klaim bulan berikutnya" (ayat (4)); payment 15 working days after completeness (ayat (5)); 1% per month penalty (ayat (7)).                          | VERIFIED                               |
| Peraturan BPJS 7/2018 Pasal 40 (pp. 26–27) | The same 6-month expiry, with exceptions for pre-2018 services, disputes and unclear drug coverage.                                                                                                                                                           | VERIFIED                               |
| Permenkes 28/2014 lampiran, p. 31 point 8  | "Fasilitas Kesehatan mengajukan klaim setiap bulan secara reguler paling lambat tanggal 10 bulan berikutnya, kecuali kapitasi". BPK JDIH status **Berlaku** on 15 September 2026.                                                                             | VERIFIED                               |
| The induk's PKS with BPJS                  | The operational filing date lives in each FKTP's PKS. No PKS template was found on a government domain; a figure seen on a non-government page is not cited here.                                                                                             | STILL UNKNOWN (ask the induk with Q12) |

**Answer.** The addendum's "10th of the following month" **is a real rule**, but it is a Kemenkes pedoman
(Permenkes 28/2014) rather than the Perpres, and the induk's PKS may set its own monthly date. The binding
cut-off is **six months after the service**; a claim filed later is lost. Plan the recap around the induk's
monthly date and never let a month roll past six.

## 4. Tariffs, from the official Permenkes 3/2023 PDF (Q4)

Source: `Permenkes Nomor 3 Tahun 2023.pdf`, BPK JDIH download 334015, 721 pages, status **Berlaku**
(promulgated 9 January 2023). Read with `pdf-parse`; page numbers below are the PDF's pages, which
match the printed folio ("-13-" is page 13). **The FKTP non-capitation tariffs are in the batang tubuh
(BAB II, Pasal 18–22, pages 12–16), not in the lampiran.** BPK's own note reads "batang tubuh hlm 1 sd 30;
lampiran hlm 31 sd 721"; pages 31–721 are the INA-CBG and non-INA-CBG tables for FKRTL and contain no
kebidanan line for FKTP (checked by grep for "bidan", "kebidanan", "ante natal", "post natal" beyond page 30).

### 4.1 Verified figures

| Service                                                                  | Puskesmas                               | FKTP selain puskesmas                        | Bidan jejaring      | Article, page                                         |
| ------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------- | ------------------- | ----------------------------------------------------- |
| ANC per visit, dokter + USG                                              | Rp140.000                               | Rp160.000                                    | —                   | Pasal 19 ayat (2), p. 13                              |
| ANC per visit, dokter                                                    | Rp80.000                                | Rp90.000                                     | —                   | Pasal 19 ayat (2), p. 13                              |
| ANC per visit, bidan                                                     | Rp60.000                                | Rp70.000                                     | **Rp70.000**        | Pasal 19 ayat (2) huruf c, p. 13                      |
| Pra rujukan, komplikasi kehamilan (jasa pelayanan, "paling banyak")      | Rp180.000                               | Rp200.000 "termasuk bidan jejaring"          | **Rp200.000** max   | Pasal 19 ayat (5)–(6), p. 14                          |
| Persalinan, team with ≥1 doctor + 2 nakes                                | Rp1.000.000                             | **Rp1.200.000**                              | (through the induk) | Pasal 20 ayat (2) huruf a–b, p. 14                    |
| Persalinan, team of ≥2 nakes, no doctor at the facility, no complication | —                                       | **Rp800.000**                                | (through the induk) | Pasal 20 ayat (1) huruf b and ayat (2) huruf c, p. 14 |
| Persalinan with emergensi dasar at FKTP PONED, 2 days / 3 days           | Rp1.250.000 / Rp1.500.000               | (PONED status set by Pemda, ayat (5), p. 15) | —                   | Pasal 20 ayat (3), p. 14                              |
| Tindakan pasca persalinan at FKTP PONED                                  | Rp180.000                               | —                                            | —                   | Pasal 20 ayat (4), p. 14                              |
| PNC per visit                                                            | Rp40.000                                | Rp50.000                                     | **Rp50.000**        | Pasal 21 ayat (5), p. 15                              |
| KB: AKDR insert and/or removal                                           | Rp105.000                               | Rp105.000                                    | (no separate line)  | Pasal 22 ayat (2) huruf a, p. 16                      |
| KB: implant insert and/or removal                                        | Rp105.000                               | Rp105.000                                    | (no separate line)  | Pasal 22 ayat (2) huruf b, p. 16                      |
| KB: suntik, per injection                                                | Rp20.000                                | Rp20.000                                     | (no separate line)  | Pasal 22 ayat (2) huruf c, p. 16                      |
| KB: komplikasi                                                           | Rp125.000                               | Rp125.000                                    | (no separate line)  | Pasal 22 ayat (2) huruf d, p. 16                      |
| KB: MOP / vasektomi                                                      | Rp370.000                               | Rp370.000                                    | (no separate line)  | Pasal 22 ayat (2) huruf e, p. 16                      |
| SHK sample collection                                                    | "termasuk dalam paket tarif persalinan" | same                                         | same                | Pasal 15 ayat (4) huruf d, p. 12                      |

### 4.2 Rules that shape the recap

- **ANC is paid per visit, not as a package** ("dibayarkan per kunjungan", Pasal 19 ayat (2), p. 13). The
  standard schedule is 6 visits: 1 in trimester one by a doctor with USG, 2 in trimester two by doctor or
  bidan, 3 in trimester three by doctor or bidan with the fifth visit by a doctor with USG (ayat (1), p. 13).
  Where there is no doctor or no USG, the first and fifth visits "dapat dilakukan oleh bidan" and are
  paid at the same table (ayat (3)–(4), p. 14). So a midwife-only ANC is claimable, at the bidan rate.
- **Delivery tariff depends on the team.** Pasal 20 ayat (1) (p. 14): either a team of at least one doctor
  and two nakes, or "tim paling sedikit 2 (dua) orang tenaga kesehatan … dalam kondisi tidak ada dokter pada
  fasilitas kesehatan untuk pelayanan persalinan tanpa komplikasi". Ayat (2) prices the first at
  Rp1.000.000 (puskesmas) / Rp1.200.000 (other FKTP) and the second at Rp800.000. **A PMB where two
  midwives deliver with no doctor present falls under Rp800.000.** The addendum's Rp1.200.000 assumes a
  doctor on the team.
- **PNC is four payable visits.** The mother is seen at least 4 times (6 h–2 d, 3–7 d, 8–28 d, 29–42 d) and
  the newborn at least 3 times (ayat (2)–(3), p. 15); the tariff "dilaksanakan dengan 3 (tiga) kali
  kunjungan ibu nifas dan bayi baru lahir serta 1 (satu) kali kunjungan ibu nifas keempat" (ayat (4)),
  each at Rp50.000 for a bidan jejaring (ayat (5) huruf c).
- **Pra rujukan is a ceiling**, "paling banyak" Rp200.000 for non-puskesmas FKTP "termasuk bidan jejaring"
  (Pasal 19 ayat (6), p. 14).
- **KB has no bidan-jejaring column**; the rate is the same for every FKTP (Pasal 22, p. 16). Peraturan BPJS
  7/2018 Pasal 3 ayat (2) huruf g (pp. 5–6) confirms KB by a bidan is a non-capitation service.
- **The induk may keep up to 10%** as biaya pembinaan when it is not government-owned (Permenkes 28/2014,
  p. 39). What the midwife receives is a contract matter between her and the induk.

## 5. The pilot PMB's induk (Q12)

**STILL UNKNOWN.** Whether the pilot PMB is a jejaring of an induk clinic, which one, whether that induk is
government-owned (which changes who files, Permenkes 28/2014 p. 39), whether the PMB holds its own eClaim
bidan-jejaring login (§1), and the filing date in the induk's PKS (§3.2) all need the pilot. Owner: Product.
Requested 2026-09-15. Until answered, P25-T16 cannot be tested against a real filing.

## 6. Recommendation for P25-T16

**Build the recap export for the induk. Do not build PCare submission. Do not drop.**

Why not PCare submission: no write endpoint for tindakan or claims is published anywhere we can read
(§2), the credentials we hold are the FKTP's and a jejaring has none in the model (§1), and the claim is
legally the induk's document set signed by its head (§3.1). Building against an endpoint nobody has seen is
the mistake P24 avoided with Antrean.

Why not drop: the tariffs are real and per visit (§4), the induk needs exactly the per-visit lines and the
document checklist to file by its monthly date, and the midwife's income depends on nothing being missed
before the six-month expiry.

What the recap should be, so T16 can scope it:

1. **One export per calendar month** of maternal and KB services for patients with a BPJS number, keyed
   off the encounter and admission records, **not** off the PCare outbox (a PMB with no PCare config
   enqueues nothing, §0).
2. **One line per payable unit** matching how eClaim is keyed: ANC visit _n_ of 6 with who examined
   (doctor/bidan, USG or not); persalinan with the team composition (doctor present or not) so the right
   Pasal 20 line applies; PNC visit 1–3 (mother + newborn) and visit 4 (mother); pra rujukan; KB item.
   Each line carries the Permenkes 3/2023 rate for a bidan jejaring / non-puskesmas FKTP from §4.1 and the
   article reference, so the induk can check it.
3. **A document checklist per line** from §3.1: KIA sheet copy or signed kartu ibu; partograf copy and
   surat keterangan kelahiran for a delivery; referral letter for pra rujukan; KB book and consent for
   implant/IUD/MOP. The FPK, kuitansi and SPTJM are the induk's own and are not generated.
4. **Deadline banner**: the induk's filing date (PKS; default the 10th from Permenkes 28/2014) and the
   six-month expiry per line (Perpres 82/2018 Pasal 77).
5. Keep it a file the induk can attach to its rekapitulasi pelayanan (Pasal 12 huruf a angka 2). Nothing is
   sent to BPJS by us.

Revisit PCare submission only if the official catalogue shows a tindakan/claim write endpoint **and** the
PMB (or the induk, on our behalf) can obtain credentials that cover it.

**No decision record.** The recommendation is the ticket's default, so scope does not change and neither
D-036 nor D-037 is taken here. If P25-T16 later wants HMS to file claims itself, that is the decision to
record, as **D-037** (D-036 may be taken by P25-T01 in parallel).

## 7. Addendum changes (apply to `docs/product/prd-klinik-bidan-midwife-practice.md` once P25-T01 merges)

The addendum is not on `main` yet; these are the edits for its owner.

1. **FR-JKN-01 tariff figures.** Replace the summary-sourced figures with §4.1, citing
   "Permenkes 3/2023 Pasal 19–22, pp. 13–16 (batang tubuh, not lampiran)". Keep Rp70.000 ANC and
   Rp50.000 PNC per visit for a bidan jejaring. Change the delivery line to: "Rp1.200.000 (FKTP selain
   puskesmas, team with a doctor) or **Rp800.000** (team of two nakes with no doctor at the facility,
   uncomplicated delivery) — Pasal 20 ayat (1)–(2), p. 14". Add pra rujukan (max Rp200.000) and the KB
   rates (Rp105.000 / Rp105.000 / Rp20.000 / Rp125.000 / Rp370.000).
2. **FR-JKN-01 wording "claims … monthly".** Keep, and make the route explicit: "the induk files through
   BPJS eClaim; the PMB may hold its own eClaim bidan-jejaring login under the induk's code; there is no
   PCare web-service route for these claims". Add: "ANC per visit (6-visit schedule), PNC four payable visits,
   delivery priced by team composition".
3. **FR-JKN-01 deadline.** Replace "10th of the following month (secondary source)" with: "Permenkes 28/2014
   lampiran p. 31 point 8 sets the 10th of the following month; the induk's PKS may set its own date; the
   binding expiry is six months after the service (Perpres 82/2018 Pasal 77, Peraturan BPJS 7/2018 Pasal 40)".
4. **FR-JKN-01 supporting documents.** Add the §3.1 list with "Peraturan BPJS 7/2018 Pasal 12–14, pp. 10–12".
5. **Q12.** Keep as STILL UNKNOWN, owner Product, requested 2026-09-15, and widen it to three sub-questions:
   (a) which induk, and is it government-owned; (b) does the PMB hold its own eClaim bidan-jejaring login;
   (c) the filing date in the induk's PKS.
6. **Open-questions table.** Add a row: "Does the official PCare catalogue publish any tindakan/claim
   write endpoint? STILL UNKNOWN — portal unreachable on 2026-09-15; ask the induk's kantor cabang."

## Sources

Primary, all downloaded and read on 15 September 2026 (files kept outside the repository):

- Permenkes 3/2023, Standar Tarif Pelayanan Kesehatan dalam Penyelenggaraan Program Jaminan Kesehatan —
  `https://peraturan.bpk.go.id/Download/334015/Permenkes%20Nomor%203%20Tahun%202023.pdf` (detail page
  `https://peraturan.bpk.go.id/Details/275518/permenkes-no-3-tahun-2023`, status Berlaku). Also
  `https://peraturan.go.id/files/permenkes+-no-3-tahun-2023.pdf` (same text).
- Perpres 82/2018, Jaminan Kesehatan — `https://peraturan.bpk.go.id/Download/254897/Perpres%20Nomor%2082%20Tahun%202018.pdf`.
- Perpres 75/2019, 64/2020 and 59/2024 (amendments to Perpres 82/2018) — BPK JDIH downloads
  (`https://peraturan.bpk.go.id/Details/285181/perpres-no-59-tahun-2024` and the search pages for the
  other two); checked for changes to Pasal 75 and Pasal 77.
- Peraturan BPJS Kesehatan 7/2018, Pengelolaan Administrasi Klaim Fasilitas Kesehatan (BN 2018/1712) —
  `https://peraturan.go.id/files/bn1712-2018.pdf` (detail `https://peraturan.go.id/id/peraturan-bpjs-kesehatan-no-7-tahun-2018`,
  status Berlaku, revokes Peraturan BPJS 3/2017).
- Permenkes 28/2014, Pedoman Pelaksanaan Program JKN —
  `https://peraturan.bpk.go.id/Download/108352/Permenkes%20Nomor%2028%20Tahun%202014.pdf` (detail
  `https://peraturan.bpk.go.id/Details/117565/permenkes-no-28-tahun-2014`, status Berlaku).
- Permenkes 71/2013, Pelayanan Kesehatan pada JKN (BN 2013/1400) — `https://peraturan.go.id/files/bn1400-2013.pdf`.
- BPJS eClaim Primary Care login page and release notes — `https://pcarejkn.bpjs-kesehatan.go.id/eclaim/Login`.
- PCare REST v3.0 base — `https://new-api.bpjs-kesehatan.go.id/pcare-rest-v3.0/` (error page to an
  unauthenticated GET); Trust Mark portal `https://dvlp.bpjs-kesehatan.go.id:8888/trust-mark/portal.html`
  (timed out).

Repository:

- `docs/post-mvp/bpjs-pcare.md` (§1 credentials, §4 API surface, scope line on VClaim).
- `apps/api/prisma/schema.prisma`; `apps/api/src/modules/bpjs-pcare/**`;
  `apps/api/src/common/bpjs-pcare/build-bpjs-kunjungan-payload.ts`;
  `apps/api/src/common/bpjs-pcare/bpjs-pcare-reference-catalogs.ts`;
  `apps/api/src/modules/registration-flow/repository/registration-flow.repository.ts`;
  `apps/api/src/modules/emr/repository/encounter.repository.ts`.

Community reference (protocol facts only, the same pin as D-022; not used for any figure):
`https://github.com/awageeks/laravel-bpjs` (`src/PCare/Tindakan.php`, `src/PCare/Kunjungan.php`).
