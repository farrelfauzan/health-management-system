# Midwife practice: regulatory research spike (P25-T01)

Researched on **15 September 2026** from the official PDFs on peraturan.go.id and peraturan.bpk.go.id
(text extracted with `pdf-parse`; the scanned Lampiran of Permenkes 21/2021 was OCR'd page by page with
Tesseract and the quoted passages were read back from the OCR output). It answers Q9, Q10 and Q11 of the
Midwife Practice addendum (`docs/product/prd-klinik-bidan-midwife-practice.md` §7) and the four rule
questions P25-T03, P25-T06 and P25-T15 depend on. Each answer is **VERIFIED** (quoted from the pasal and
ayat of an official PDF) or **STILL UNKNOWN** (with the reason and the owner).

No summary of a legal text produced by a search engine or a model is quoted anywhere in this file. Where a
secondary source only pointed to the right pasal, the pasal is quoted and the secondary source is not
cited. No real person is named; the pilot puskesmas is not identified.

## Summary

| #   | Question                                                                    | Answer                                                                                                                                                                                                                                                                                                                                 | Status                  | Unblocks / changes                   |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------ |
| Q9  | Does PP 28/2024 or a later Permenkes replace Permenkes 28/2017 Pasal 18–28? | **Yes, formally.** Permenkes 13/2025 Pasal 309 huruf cc revokes Permenkes 28/2017 outright. Its Pasal 305 ayat (1) keeps the per-profession practice regulation as the reference for authority until a standar profesi under Pasal 174 ayat (3) is stipulated by the Minister. The five FR-AUTH-01 kinds survive; their legal basis and evidence move to PP 28/2024 Pasal 742–745 and Permenkes 13/2025 Pasal 182–187 | VERIFIED                | E6, E7; adds D-036                   |
| —   | Has a Pasal 174(3) standar profesi bidan been stipulated since?             | Not found on kki.go.id or jdih.kemkes.go.id. A secondary source reports a KKI decision on *standar kompetensi* dated 12 June 2026; not verifiable from a government PDF today                                                                                                                                                              | STILL UNKNOWN           | E6 evidence fields (owner: Product, legal) |
| Q10 | Must two of six antenatal visits be with a doctor, with ultrasound?         | **Yes.** Permenkes 21/2021 Pasal 13 ayat (4)–(5): at least 2 of the ≥6 visits by a dokter or SpOG, in trimester 1 and trimester 3, including USG. Lampiran I: the trimester-1 doctor visit is at <12 weeks or the first contact; the trimester-3 one plans the birth. Still in force for masa hamil (Permenkes 2/2025 revoked only the contraception and sexual-health parts) | VERIFIED                | FR-ANC-07 becomes MUST; P25-T06      |
| —   | What does a klinik bidan without a doctor do?                               | The duty sits on the mother ("ibu hamil harus kontak dengan dokter"); the midwife's own authority is antenatal care in a *normal* pregnancy and she must refer what is outside it. Lampiran I gives the same pattern for Td vaccine and lab: coordinate with dinkes/Puskesmas or refer. The product records the doctor visit done elsewhere | VERIFIED (by reading)   | P25-T06 model                        |
| —   | Trimester boundaries                                                        | **0–12 weeks / >12–24 weeks / >24 weeks to birth** — Permenkes 21/2021 Lampiran I BAB III (K4 and K6 definitions). The Buku KIA reading is correct                                                                                                                                                                                     | VERIFIED                | P25-T06 numbering                    |
| —   | K1 murni / K1 akses                                                         | Not defined in Permenkes 21/2021, PP 28/2024, the PWS-KIA 2010 pedoman or the SATUSEHAT ANC playbook. The programme convention (K1 murni = first contact in trimester 1, ≤12 weeks; K1 akses = first contact after 12 weeks) appears only in secondary sources                                                                             | STILL UNKNOWN (official) | P25-T06 uses the convention, flagged |
| —   | Name of the 7th or later ANC visit                                          | None. Lampiran I: "Kunjungan antenatal bisa lebih dari 6 (enam) kali sesuai kebutuhan"; the SATUSEHAT identifier list stops at K6                                                                                                                                                                                                       | VERIFIED (no name exists) | P25-T06, P25-T08                     |
| —   | Contraceptive procedure codes for P25-T03                                   | Gate `69.7` and `97.71` (both in the seed). IUD **removal is inside** the Pasal 25 authority. **No implant code exists** in ICD-9-CM 2010 or the seed; the `99.23`/`97.89` convention is unverified and those codes have other meanings, so implants are gated by method, not by code                                                     | VERIFIED / STILL UNKNOWN (implant code) | P25-T03 map, P25-T14         |
| —   | Neonatal and child boundaries for MTBS                                      | Bayi baru lahir 0–28 days; bayi 0–11 months; anak balita 12–59 months; **MTBS 0–59 months**; **MTBM 0–2 months**. The Pasal 20(4) first-handling exception is for "bayi baru lahir" only, i.e. 0–28 days                                                                                                                              | VERIFIED                | P25-T03 visit-purpose rule           |
| —   | Programme immunisation                                                      | Every routine vaccine other than HB0 is programme authority (Permenkes 28/2017 Pasal 25 ayat (1) huruf d; HB0 is own authority under Pasal 20 ayat (3)). Under Permenkes 3/2026 Pasal 9 programme immunisation is given by Tenaga Medis or by trained Tenaga Kesehatan. Recorded only; not enforced in P25                                | VERIFIED                | Nothing in P25                       |
| Q11 | Monthly KIA report and kohort layouts the pilot puskesmas accepts           | Not obtained: the pilot bidan cannot be reached from this ticket. A provisional LB3-KIA Maternal layout from a district open-data portal is recorded below; the Kemenkes kohort register PDF was unreachable (HTTP 503) on the research day                                                                                              | STILL UNKNOWN (owner: Product, requested 2026-09-15) | E12, P25-T15 |

## Sources (official PDFs)

| Short name       | Regulation                                                                                                                                                                              | Official PDF                                                                                        | Status on peraturan.bpk.go.id                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Permenkes 28/2017 | Izin dan Penyelenggaraan Praktik Bidan (BN 2017/954)                                                                                                                                    | https://peraturan.go.id/files/bn954-2017.pdf (also https://peraturan.bpk.go.id/Details/112080)      | **Tidak berlaku** — "Dicabut dengan: Permenkes No. 13 Tahun 2025"                                               |
| Permenkes 21/2021 | Penyelenggaraan Pelayanan Kesehatan Masa Sebelum Hamil, Masa Hamil, Persalinan, dan Masa Sesudah Melahirkan, Pelayanan Kontrasepsi, dan Pelayanan Kesehatan Seksual (BN 2021/853)         | https://peraturan.go.id/files/bn853-2021.pdf (also https://peraturan.bpk.go.id/Details/314519)      | Listed as tidak berlaku, but the revoking regulation revokes it **only in part** (see §3.1)                     |
| PP 28/2024        | Peraturan Pelaksanaan UU 17/2023 tentang Kesehatan                                                                                                                                      | https://peraturan.go.id/files/pp-no-28-tahun-2024.pdf (also https://peraturan.bpk.go.id/Details/294077) | Berlaku                                                                                                      |
| Permenkes 13/2025 | Pengelolaan Sumber Daya Manusia Kesehatan (ditetapkan 8 Oktober 2025)                                                                                                                   | https://peraturan.bpk.go.id/Details/335214 (PDF: `/Download/397785/permenkes-no-13-tahun-2025.pdf`) | Berlaku                                                                                                         |
| Permenkes 2/2025  | Penyelenggaraan Upaya Kesehatan Reproduksi (ditetapkan 20 Februari 2025)                                                                                                                | https://peraturan.bpk.go.id/Details/314518 (PDF: `/Download/375490/permenkes-no-2-tahun-2025.pdf`)  | Berlaku                                                                                                         |
| Permenkes 3/2026  | Penanggulangan Penyakit (ditetapkan 27 Februari 2026)                                                                                                                                   | https://peraturan.bpk.go.id/Details/350854 (PDF: `/Download/414600/Permenkes 3 Tahun 2026.pdf`)     | Berlaku                                                                                                         |
| Permenkes 25/2014 | Upaya Kesehatan Anak (BN 2014/825)                                                                                                                                                      | https://peraturan.go.id/files/bn825-2014.pdf (also https://peraturan.bpk.go.id/Details/117562)      | Berlaku                                                                                                         |
| Permenkes 12/2017 | Penyelenggaraan Imunisasi (BN 2017/559)                                                                                                                                                 | https://peraturan.go.id/files/bn559-2017.pdf (also https://peraturan.bpk.go.id/Details/111977)      | Partly revoked by Permenkes 3/2026 (see §7)                                                                     |
| PWS-KIA 2010      | Pedoman Pemantauan Wilayah Setempat Kesehatan Ibu dan Anak, Kemenkes 2010 (hosted by a provincial dinas kesehatan)                                                                      | https://dinkes.sumutprov.go.id/bidang-kesehatan-masyarakat/downloadfile?id=350                       | Guidance, not a regulation                                                                                      |
| Buku KIA 2024     | Buku Kesehatan Ibu dan Anak, cetakan 2024                                                                                                                                               | https://kesprimkom.kemkes.go.id/assets/uploads/contents/others/Buku_KIA_2024.pdf                     | Guidance                                                                                                        |
| SATUSEHAT ANC     | Antenatal Care playbook                                                                                                                                                                 | https://satusehat.kemkes.go.id/platform/docs/id/interoperability/anc/                                | Integration contract                                                                                            |

The Berita Negara number and the promulgation date of Permenkes 13/2025, 2/2025 and 3/2026 are **not**
recorded here: in each PDF those fields are placeholders that were never filled, and no other official page
shows them. Only the "ditetapkan" date printed above the Minister's signature is quoted.

## 1. Q9: what replaced Permenkes 28/2017 Pasal 18–28 (VERIFIED)

### 1.1 Permenkes 28/2017 is revoked, but stays the reference for the authority list

Permenkes 13/2025 **Pasal 309**: "Pada saat Peraturan Menteri ini mulai berlaku: … cc. Peraturan Menteri
Kesehatan Nomor 28 Tahun 2017 tentang Izin dan Penyelenggaraan Praktik Bidan (Berita Negara Republik
Indonesia Tahun 2017 Nomor 954); … dicabut dan dinyatakan tidak berlaku." (Pasal 310: in force on
promulgation.)

Permenkes 13/2025 **Pasal 305 ayat (1)**: "Selama belum ditetapkannya standar profesi sebagaimana
dimaksud dalam Pasal 174 ayat (3), kewenangan Tenaga Medis dan Tenaga Kesehatan dalam menjalankan praktik
mengacu pada Peraturan Menteri Kesehatan yang mengatur mengenai penyelenggaraan praktik dan/atau pekerjaan
masing-masing Tenaga Medis dan Tenaga Kesehatan."

Permenkes 13/2025 **Pasal 174**: "(1) Tenaga Medis dan Tenaga Kesehatan dalam menjalankan praktik harus
dilakukan sesuai dengan kewenangan yang didasarkan pada kompetensi yang dimilikinya. (2) Kewenangan …
dilakukan berdasarkan standar profesi. (3) Standar profesi … disusun oleh Konsil serta Kolegium dan
ditetapkan oleh Menteri. (4) Kewenangan Tenaga Medis dan Tenaga Kesehatan sesuai dengan kompetensi
tercantum dalam STR."

**Reading.** The regulation that enumerates what a midwife may do is revoked, and the same regulation
says that, until the Minister stipulates a Konsil/Kolegium standar profesi, authority "mengacu pada" the
per-profession practice Permenkes. For a midwife that is Permenkes 28/2017. So the Pasal 18–27 list is
still the operative content of a midwife's authority today, but by way of Pasal 305(1), not on its own
force, and it ends the day a Pasal 174(3) standar profesi bidan is stipulated. Kepmenkes
HK.01.07/MENKES/320/2020 (Standar Profesi Bidan) predates the Konsil/Kolegium mechanism, so whether it
already counts as the Pasal 174(3) standard is a legal question this spike cannot settle; see §1.4.

PP 28/2024 does **not** mention Permenkes 28/2017 or any midwife-specific authority: the word "Bidan"
appears only inside titles in its revocation list, and "kebidanan" once (Pasal 821, hospital services).
Permenkes 2/2025 and 3/2026 do not mention it either.

### 1.2 The framework that now carries each kind of authority

PP 28/2024 **Pasal 742**: "(1) Tenaga Medis dan Tenaga Kesehatan dalam menjalankan praktik harus
dilakukan sesuai dengan kewenangan yang didasarkan pada kompetensi yang dimilikinya. … (3) Tenaga Medis dan
Tenaga Kesehatan dapat memiliki kewenangan berdasarkan penambahan kompetensi yang dimiliki melalui
pelatihan. (4) Kewenangan … berdasarkan penambahan kompetensi sebagaimana dimaksud pada ayat (2) dan
ayat (3) dicantumkan dalam STR …"

PP 28/2024 **Pasal 743 ayat (5)**: "Dikecualikan dari ketentuan sebagaimana dimaksud pada ayat (4),
kewenangan klinis bagi Tenaga Medis dan Tenaga Kesehatan yang menjalankan praktik mandiri sesuai dengan STR
dan SIP yang dimiliki." (A PMB is not credentialed by a facility head; her clinical authority is what her
STR and SIP say.)

PP 28/2024 **Pasal 744**: "(1) Dalam keadaan tertentu, Tenaga Medis dan Tenaga Kesehatan dapat
memberikan pelayanan di luar kewenangannya. (2) Keadaan tertentu … paling sedikit meliputi: a. ketiadaan
Tenaga Medis dan/atau Tenaga Kesehatan di suatu wilayah tempat Tenaga Medis atau Tenaga Kesehatan bertugas;
b. kebutuhan program pemerintah; c. penanganan kegawatdaruratan medis; dan/atau d. KLB, Wabah, dan/atau
darurat bencana. (3) Ketiadaan … ditetapkan oleh kepala perangkat daerah yang menyelenggarakan urusan
pemerintahan di bidang kesehatan kabupaten/kota setempat. (4) Pemberian pelayanan di luar kewenangan dalam
kondisi ketiadaan … dan dalam rangka pelaksanaan kebutuhan program pemerintah … dilaksanakan oleh Tenaga
Medis atau Tenaga Kesehatan yang telah mengikuti pelatihan atau orientasi yang diselenggarakan oleh
Pemerintah Pusat atau Pemerintah Daerah. … (8) Jangka waktu dan tempat pemberian Pelayanan Kesehatan di
luar kewenangan dalam keadaan tertentu sebagaimana dimaksud pada ayat (2) huruf a, huruf b, dan huruf d
ditetapkan oleh Pemerintah Pusat dan/atau Pemerintah Daerah sesuai kebutuhan."

PP 28/2024 **Pasal 745**: "(1) Tenaga Medis dan Tenaga Kesehatan dapat menerima pelimpahan kewenangan
untuk melakukan pelayanan Kesehatan terdiri atas: a. pelimpahan secara mandat; dan b. pelimpahan secara
delegatif. (2) Pelimpahan wewenang secara mandat … merupakan pelimpahan tugas dengan tanggung jawab berada
pada pemberi wewenang. (3) Pelimpahan wewenang secara delegatif … merupakan pelimpahan tugas dengan
tanggung jawab berada pada penerima wewenang. (4) Pimpinan Fasilitas Pelayanan Kesehatan harus menetapkan
jenis Pelayanan Kesehatan yang dapat dilimpahkan kewenangannya."

Permenkes 13/2025 **Pasal 182–184** (pelimpahan): 182(5) "Pelimpahan Kewenangan harus dilakukan secara
tertulis dari pemberi kewenangan kepada penerima kewenangan." 183(1) mandate: "a. diberikan kepada Tenaga
Medis dan Tenaga Kesehatan sesuai dengan kompetensinya; b. berada di bawah pengawasan pemberi mandat; c.
tidak termasuk pengambilan keputusan; dan d. tanggung jawab tetap berada pada pemberi mandat." 183(2)
"Penerima mandat harus membuat laporan kepada pemberi mandat." 184(1) delegation: "a. pemberi delegasi
berhalangan; b. diberikan kepada Tenaga Medis atau Tenaga Kesehatan tertentu yang terlatih dan memiliki
kompetensi sesuai dengan kewenangan klinis yang didelegasikan; dan c. tanggung jawab beralih sepenuhnya
pada penerima delegasi." 184(2) "berhalangan" is leave, official duty, or "keadaan tertentu lainnya yang
memakan waktu 1 (satu) bulan sampai 3 (tiga) bulan."

Permenkes 13/2025 **Pasal 185–187** (keadaan tertentu) repeat PP 28/2024 Pasal 744 and add: 186(1) the
absence of other workers "ditetapkan oleh kepala dinas kesehatan kabupaten/kota setempat"; 186(2) that
authority is given "setelah Tenaga Medis dan/atau Tenaga Kesehatan mengikuti Pelatihan atau Fellowship";
187(1) "Kebutuhan program pemerintah … ditetapkan oleh Pemerintah Pusat atau Pemerintah Daerah sesuai
kewenangan"; 187(2) "Pemberian kewenangan dalam hal pelaksanaan kebutuhan program pemerintah … melalui
penugasan setelah Tenaga Medis atau Tenaga Kesehatan mengikuti Pelatihan, Fellowship, atau orientasi yang
diselenggarakan oleh Pemerintah Pusat atau Pemerintah Daerah".

### 1.3 What is still in force, per the addendum's table

| Addendum row                              | Permenkes 28/2017 text (quoted from the PDF)                                                                                                                                                                                                                                                         | Today                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Own authority, maternal (Pasal 19)        | 19(2) "antenatal pada kehamilan normal; persalinan normal; ibu nifas normal…"; 19(3) episiotomi, penjahitan luka jalan lahir tingkat I dan II, penanganan kegawat-daruratan dilanjutkan perujukan, tablet tambah darah, vitamin A dosis tinggi, uterotonika pada manajemen aktif kala tiga, surat keterangan kehamilan dan kelahiran | Content still the reference via 13/2025 Pasal 305(1); basis is PP 28/2024 Pasal 742(1) (kewenangan = kompetensi, as recorded on the STR)                                                                                                                                                                                       |
| Own authority, child (Pasal 20)           | 20(3) neonatal esensial incl. "pemberian imunisasi Hepatitis B pertama (HB0)"; 20(4) "penanganan awal asfiksia bayi baru lahir …, penanganan awal hipotermia pada bayi baru lahir dengan berat badan lahir rendah …, penanganan awal infeksi tali pusat …, membersihkan dan pemberian salep mata pada bayi baru lahir dengan infeksi gonore (GO)"; 20(5) tumbuh kembang incl. KPSP | Same                                                                                                                                                                                                                                                                                                                              |
| Own authority, KB (Pasal 21)              | "b. pelayanan kontrasepsi oral, kondom, dan suntikan."                                                                                                                                                                                                                                               | Same; Permenkes 2/2025 Pasal 38(3) adds that contraception is given "sesuai dengan kompetensi dan kewenangannya"                                                                                                                                                                                                                  |
| Programme authority (Pasal 23, 25)        | 23(1)(a) "kewenangan berdasarkan program pemerintah"; 23(2) "diperoleh Bidan setelah mendapatkan pelatihan"; 23(5) "harus mendapatkan penetapan dari kepala dinas kesehatan kabupaten/kota"; 25(1) "a. pemberian pelayanan alat kontrasepsi dalam rahim dan alat kontrasepsi bawah kulit; b. asuhan antenatal terintegrasi dengan intervensi khusus penyakit tertentu; c. penanganan bayi dan anak balita sakit sesuai dengan pedoman yang ditetapkan; d. pemberian imunisasi rutin dan tambahan sesuai dengan program pemerintah; …" | Still the list of programme actions via Pasal 305(1). The mechanism is now PP 28/2024 Pasal 744(2)(b), (4), (8) and 13/2025 Pasal 187: **penugasan** by central/regional government after training or orientation, for a period and place the government sets. Training-added competence is written on the STR (PP 28/2024 Pasal 742(3)–(4)) |
| No other worker in the area (Pasal 26)    | 26(1) lapses "dalam hal telah tersedia tenaga kesehatan lain dengan kompetensi dan kewenangan yang sesuai"; 26(2) "ditetapkan oleh kepala dinas kesehatan kabupaten/kota setempat"                                                                                                                  | Same shape: PP 28/2024 Pasal 744(2)(a), (3), (4), (8); 13/2025 Pasal 186. The dinas decides the absence; training is a precondition; the government sets the period                                                                                                                                                                 |
| Doctor's mandate (Pasal 27)               | 27(1) "diberikan secara tertulis oleh dokter pada Fasilitas Pelayanan Kesehatan tingkat pertama tempat Bidan bekerja"; 27(2) only where need exceeds doctor availability; 27(3) within competence, supervised, "tidak termasuk mengambil keputusan klinis", "tidak bersifat terus menerus"; 27(4) doctor's responsibility | Now PP 28/2024 Pasal 745 and 13/2025 Pasal 182–183: written, within competence, supervised, no decision-making, responsibility with the doctor, **plus a report back to the doctor** (183(2)). The "same FKTP", "need exceeds doctor availability" and "not continuous" limits are no longer written; the facility head lists the delegable services (745(4)). **New:** pelimpahan secara delegasi (745(3), 13/2025 Pasal 184), where responsibility moves to the midwife, for a doctor absent 1–3 months |
| Obligations (Pasal 28)                    | 28(c) "merujuk kasus yang bukan kewenangannya"; 28(f) systematic records; 28(h) "pencatatan dan pelaporan … termasuk pelaporan kelahiran dan kematian"; 28(i) referral letters and birth certificates                                                                                                  | Content still the reference via Pasal 305(1); PP 28/2024 Pasal 739(3) (standar pelayanan, standar profesi) and the general record-keeping rules carry it                                                                                                                                                                          |

### 1.4 Changes against FR-AUTH-01's five kinds

| Kind                   | Legal basis before                        | Legal basis now                                                                                                                                                   | What changes in the record                                                                                                                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IUD_IMPLANT`          | 28/2017 Pasal 25(1)(a), 23(2), 23(5)     | PP 28/2024 Pasal 744(2)(b), (4), (8); 13/2025 Pasal 187 (penugasan after training); Permenkes 2/2025 Pasal 38(3), 39(5) (written consent for AKDR and implan) | Keep. Evidence is a training certificate **and** a government penugasan (or the training-added competence on the STR, PP 28/2024 Pasal 742(4)); the "district decision number" field should accept either a dinas penetapan or a penugasan/STR annotation. Validity is the period the government set (744(8)) |
| `MTBS`                 | 28/2017 Pasal 25(1)(c)                    | same as above                                                                                                                                                     | Keep. Same evidence change                                                                                                                                                                                                                                                                                      |
| `PROGRAM_IMMUNIZATION` | 28/2017 Pasal 25(1)(d)                    | same as above; Permenkes 3/2026 Pasal 9(2) ("Tenaga Kesehatan yang terlatih")                                                                                     | Keep. Same evidence change                                                                                                                                                                                                                                                                                      |
| `INTEGRATED_ANC`       | 28/2017 Pasal 25(1)(b)                    | same as above                                                                                                                                                     | Keep. Same evidence change                                                                                                                                                                                                                                                                                      |
| `NO_OTHER_WORKER`      | 28/2017 Pasal 23(1)(b), 26                | PP 28/2024 Pasal 744(2)(a), (3), (4), (8); 13/2025 Pasal 186                                                                                                     | Keep. Evidence is the dinas decision that no other worker is available **and** the training; the period is set by government, not open-ended                                                                                                                                                                    |
| Doctor's mandate (FR-AUTH-04) | 28/2017 Pasal 27                   | PP 28/2024 Pasal 745; 13/2025 Pasal 182–184                                                                                                                       | Add a `DELEGATION` variant next to `MANDATE`: responsibility moves to the midwife, only while the doctor is absent 1–3 months (184(2)); both need a written instruction (182(5)) and a report back (183(2), 184(3)); the "same FKTP" and "never continuous" checks are policy, no longer statute                  |

**Still unknown, owner Product with legal:** whether a Pasal 174(3) standar profesi bidan has been
stipulated since 8 October 2025. `kki.go.id/download/show/keputusan-konsil` and
`kki.go.id/kolegium/kebidanan` list nothing with that title on the research day; a non-government page
reports a KKI decision on *standar kompetensi tenaga kebidanan* dated 12 June 2026, which is a competence
standard by the Konsil and is not, on its face, a standar profesi "ditetapkan oleh Menteri". Until a
government PDF confirms one, Permenkes 28/2017's list stays the reference through Pasal 305(1).

**Consequence:** decision **D-036** in `docs/post-mvp/decisions.md` (the kinds stay; the basis, the
evidence and the mandate model change).

## 2. Q10: two doctor visits with ultrasound (VERIFIED)

Permenkes 21/2021 **Pasal 13**: "(3) Pelayanan Kesehatan Masa Hamil dilakukan paling sedikit 6 (enam)
kali selama masa kehamilan meliputi: a. 1 (satu) kali pada trimester pertama; b. 2 (dua) kali pada
trimester kedua; dan c. 3 (tiga) kali pada trimester ketiga. (4) Pelayanan Kesehatan Masa Hamil
sebagaimana dimaksud pada ayat (3) dilakukan oleh tenaga kesehatan yang memiliki kompetensi dan kewenangan
dan paling sedikit 2 (dua) kali oleh dokter atau dokter spesialis kebidanan dan kandungan pada trimester
pertama dan ketiga. (5) Pelayanan Kesehatan Masa Hamil yang dilakukan dokter atau dokter spesialis
sebagaimana dimaksud pada ayat (4) termasuk pelayanan ultrasonografi (USG)." Ayat (10): the care "harus
dicatat dalam kartu ibu/rekam medis, formulir pencatatan kohort ibu, dan buku kesehatan ibu dan anak".

Lampiran I BAB III (OCR of pages 65–66 of the gazette PDF): "Ibu hamil harus kontak dengan dokter minimal
2 kali, 1 kali di trimester 1 dan 1 kali di trimester 3. Pelayanan ANC oleh dokter pada trimester 1 (satu)
dengan usia kehamilan kurang dari 12 minggu atau dari kontak pertama, dokter melakukan skrining kemungkinan
adanya faktor risiko kehamilan atau penyakit penyerta pada ibu hamil termasuk didalamnya pemeriksaan
ultrasonografi (USG). Pelayanan ANC oleh dokter pada trimester 3 (tiga) dilakukan perencanaan persalinan,
termasuk pemeriksaan ultrasonografi (USG) dan rujukan terencana bila diperlukan."

The Buku KIA 2024 says the same to the mother: trimester 1 "Periksa kehamilan ke dokter paling sedikit satu
kali, termasuk USG dan laboratorium lengkap"; trimester 3 "Periksa kehamilan paling sedikit tiga kali dan
salah satunya harus oleh dokter, termasuk pemeriksaan USG dan laboratorium".

**Which visits.** The rule is by trimester, not by K-number: one doctor visit in trimester 1 (ideally the
first contact, <12 weeks) and one in trimester 3. With the 1/2/3 distribution that is K1 and one of K4–K6.

**A klinik bidan with no doctor on site.** The regulation does not exempt her and does not name a
substitute. Three provisions together set the behaviour: the midwife's own authority is "antenatal pada
kehamilan normal" (28/2017 Pasal 19(2)(b)); she must "merujuk kasus yang bukan kewenangannya" (28/2017
Pasal 28(c)); and Lampiran I page 67 gives the pattern for a facility without Td vaccine or a laboratory:
"fasilitas pelayanan kesehatan dapat berkoordinasi dengan dinas kesehatan kabupaten/kota dan Puskesmas untuk
penyediaan dan/atau pemeriksaan, atau merujuk ibu hamil ke Puskesmas atau fasilitas pelayanan kesehatan
lainnya". So the two doctor visits happen at a Puskesmas, a doctor's practice or an SpOG, and the midwife
records that they happened. The product side is in §8 (P25-T06 comment).

### 2.1 Is Permenkes 21/2021 still in force for masa hamil?

peraturan.bpk.go.id labels it "Tidak berlaku, dicabut dengan Permenkes No. 2 Tahun 2025". The revoking
text is narrower. Permenkes 2/2025 **Pasal 85**: "Pada saat Peraturan Menteri ini mulai berlaku; … d.
Peraturan Menteri Kesehatan Nomor 21 Tahun 2021 … (Berita Negara Republik Indonesia Tahun 2021 Nomor 853)
**sepanjang mengatur penyelenggaraan pelayanan kontrasepsi dan Pelayanan Kesehatan seksual**, dicabut dan
dinyatakan tidak berlaku." Permenkes 13/2025, 3/2026 and PP 28/2024 do not mention 21/2021. Its Pasal 13
(masa hamil) and Lampiran I chapters on masa hamil, persalinan and masa sesudah melahirkan are therefore
untouched; its contraception chapter (Lampiran I, "Persyaratan Fasilitas Pelayanan Kesehatan yang Memberikan
Pelayanan Kontrasepsi", including Tabel 7) is revoked and is quoted in §5 only as history.

## 3. Trimester boundaries, K1 murni / K1 akses, the 7th visit

### 3.1 Trimester weeks (VERIFIED)

Permenkes 21/2021 Lampiran I BAB III (OCR, page 65): "K4 adalah kontak ibu hamil dengan tenaga kesehatan
yang mempunyai kompetensi … minimal 4 kali dengan distribusi waktu: 1 kali pada trimester ke-1 (0-12
minggu), 1 kali pada trimester ke-2 (>12 minggu-24 minggu) dan 2 kali pada trimester ke-3 (>24 minggu
sampai kelahirannya)." and "K6 adalah kontak … minimal 6 kali dengan distribusi waktu: 1 kali pada
trimester ke-1 (0-12 minggu), 2 kali pada trimester ke-2 (>12 minggu-24 minggu), dan 3 kali pada trimester
ke-3 (>24 minggu sampai kelahirannya)".

So: **trimester 1 = 0–12 weeks inclusive; trimester 2 = >12 to 24 weeks inclusive; trimester 3 = >24
weeks to birth.** The Buku KIA reading in the addendum is confirmed. Gestational age is counted from HPHT;
the SATUSEHAT ANC playbook's only week figure is the episode cap, "batas maksimum masa kehamilan … 44
minggu (308 hari) setelah tanggal HPHT".

### 3.2 K1 murni and K1 akses (STILL UNKNOWN as an official definition)

Searched: Permenkes 21/2021 (body and OCR'd Lampiran; "murni" does not occur), PP 28/2024, Permenkes
2/2025, the PWS-KIA 2010 pedoman, the Buku KIA 2024 and the SATUSEHAT ANC playbook. None defines either
term. What the official texts do say:

- Lampiran I, page 65: "K1 adalah kontak pertama ibu hamil dengan tenaga kesehatan yang mempunyai
  kompetensi, untuk mendapatkan pelayanan terpadu dan komprehensif sesuai standar. Kontak pertama harus
  dilakukan sedini mungkin pada trimester pertama, sebaiknya sebelum minggu ke-8."
- PWS-KIA 2010, Bab III A: "Akses Pelayanan Antenatal (cakupan K1) adalah cakupan ibu hamil yang pertama
  kali mendapat pelayanan antenatal oleh tenaga kesehatan di suatu wilayah kerja pada kurun waktu tertentu."
- SATUSEHAT ANC playbook, Tabel 24: `Encounter.identifier[0].system` =
  `http://terminology.kemkes.go.id/CodeSystem/episodeofcare/ANC`, values `K1A` "Kunjungan K1 akses", `K1M`
  "Kunjungan K1 murni", `K2` … `K6`; "Pengiriman data Kunjungan ANC melalui elemen Encounter.identifier
  dilakukan setiap kunjungan ANC/kehamilan dilakukan dengan memberikan informasi apakah kunjungan tersebut
  masuk kedalam kunjungan K1 akses, kunjungan K1 murni, kunjungan K2 dan lain sebagainya."

The programme convention, found only in academic and training material (not quotable here as a citation):
**K1 murni** = the first contact falls in trimester 1 (gestational age ≤12 weeks); **K1 akses** = the
first contact falls later (>12 weeks). It is consistent with the K1 and trimester definitions above, so
P25-T06 can implement it as a derived flag (`K1M` if the first visit's gestational age ≤ 12 weeks by the
Lampiran boundary, else `K1A`) and label it as convention. Owner to confirm the official definition:
Product, through the pilot puskesmas KIA coordinator; requested 2026-09-15.

### 3.3 A 7th or later visit (VERIFIED: it has no name)

Lampiran I, page 66: "Kunjungan antenatal bisa lebih dari 6 (enam) kali sesuai kebutuhan dan jika ada
keluhan, penyakit atau gangguan kehamilan." The regulation names K1, K4 and K6 only; the SATUSEHAT
identifier list stops at `K6` and the playbook gives no rule for later visits. **Consequence for P25-T06
and P25-T08:** number visits internally without a cap (K7, K8 …), send `K1A`/`K1M`…`K6` for the first six,
and send **no ANC identifier** for visits beyond six until Kemenkes states otherwise (ask through the
SATUSEHAT contact; do not reuse `K6`).

## 4. Contraceptive procedure codes for P25-T03

### 4.1 What the seed has (VERIFIED against `apps/api/prisma/icd9cm.sql`, the SATUSEHAT ICD-9-CM 2010 export)

| Code    | Seed title                                                          | In the seed                | Meaning for KB                                       |
| ------- | ------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| `69.7`  | Insertion of intrauterine contraceptive device                      | yes (line 2721)            | IUD insertion                                        |
| `97.71` | Removal of intrauterine contraceptive device                        | yes (line 4546)            | IUD removal                                          |
| —       | *no row mentions a subdermal or contraceptive implant*              | **no**                     | ICD-9-CM 2010 has no implant insertion/removal code   |
| `99.23` | Injection of steroid                                                | yes (line 4621)            | used by an Indonesian coding convention for implant insertion (unverified, see 4.3); also a genuine steroid injection |
| `97.89` | Removal of other therapeutic device                                 | yes (line 4561)            | same convention for implant removal (unverified); also any other device |
| `86.05` | Incision with removal of foreign body from skin and subcutaneous tissue | yes (line 3716)        | sometimes used for implant removal (unverified)      |
| `86.09` | Other incision of skin and subcutaneous tissue                      | yes (line 3719)            | sometimes used for implant insertion (unverified)    |
| `99.24` | Injection of other hormone                                          | yes (line 4622)            | injectable contraceptive: **own authority**, Pasal 21(b) |

### 4.2 IUD removal is inside the Pasal 25 authority (VERIFIED)

Permenkes 28/2017 Pasal 25(1)(a) says "pemberian **pelayanan** alat kontrasepsi dalam rahim dan alat
kontrasepsi bawah kulit". Permenkes 21/2021 Pasal 1 angka 5 defines the term: "Pelayanan Kontrasepsi
adalah serangkaian kegiatan terkait dengan pemberian obat, **pemasangan atau pencabutan** alat kontrasepsi
dan tindakan-tindakan lain dalam upaya mencegah kehamilan." Its (now revoked) Lampiran I Tabel 7 read the
same way: AKDR by "Dokter" or "Bidan yang telah mendapat pelatihan pemasangan dan pencabutan AKDR", implan
by "Dokter" or "Bidan yang telah mendapat pelatihan pemasangan dan pencabutan implan". Permenkes 2/2025
Pasal 38(3) keeps contraception "sesuai dengan kompetensi dan kewenangannya" and Pasal 39(5) requires
written consent "untuk metode suntik, alat kontrasepsi dalam rahim, implan, tubektomi, dan vasektomi".
**So `97.71` is included.**

### 4.3 Implant codes (STILL UNKNOWN)

ICD-9-CM 2010 has no dedicated code for contraceptive implant insertion or removal, and the seed has
none. A coding guide for obstetrics and gynaecology under JKN (a professional-society publication, not a
government PDF; its hosting page returned HTTP 403 on the research day) is reported to assign `99.23` to
"pasang implan kontrasepsi" and `97.89` to its removal. That could not be read and is **not** a verified
source. Both codes have real other meanings (`99.23` is the code for any steroid injection), so gating them
would refuse a midwife's legitimate work. The PCare `TINDAKAN` catalogue is only reachable through the
BPJS API with clinic credentials and is out of scope here (P25-T13).

### 4.4 The map P25-T03 hard-codes

| ICD-9-CM | Seed title                                      | Authority required from a `MIDWIFE` | Source                                                                                                            |
| -------- | ----------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `69.7`   | Insertion of intrauterine contraceptive device  | `IUD_IMPLANT`                       | seed line 2721; Permenkes 28/2017 Pasal 25(1)(a) via 13/2025 Pasal 305(1); PP 28/2024 Pasal 744(2)(b)              |
| `97.71`  | Removal of intrauterine contraceptive device    | `IUD_IMPLANT`                       | seed line 4546; Permenkes 21/2021 Pasal 1 angka 5 ("pemasangan atau pencabutan"); Pasal 25(1)(a) as above          |

Nothing else is gated by code. Implant insertion and removal are gated **by method** on the family-planning
record (FR-KB-02, P25-T14: method `IMPLANT` requires `IUD_IMPLANT`) and, until P25-T14 ships, by a
procedure-form flag "pemasangan/pencabutan implan" that P25-T03 adds next to the code picker. `99.23`,
`97.89`, `86.05` and `86.09` stay ungated. If the pilot clinic's coders confirm a local implant code, add it
to this map with the confirmation as its source.

## 5. Neonatal and child boundaries for MTBS (VERIFIED)

Permenkes 25/2014 **Pasal 1**: "2. Bayi Baru Lahir adalah bayi umur 0 sampai dengan 28 hari. 3. Bayi adalah
anak mulai umur 0 sampai 11 bulan. 4. Anak Balita adalah anak umur 12 bulan sampai dengan 59 bulan. 5. Anak
Prasekolah adalah anak umur 60 bulan sampai 72 bulan. … 10. Manajemen Terpadu Balita Sakit yang selanjutnya
disingkat MTBS adalah suatu pendekatan yang terintegrasi/terpadu dalam tatalaksana balita sakit dengan
fokus kepada kesehatan anak berusia 0-59 bulan secara menyeluruh di unit rawat jalan fasilitas pelayanan
kesehatan dasar." (Berlaku per peraturan.bpk.go.id; not mentioned by 13/2025, 2/2025, 3/2026 or PP 28/2024.)
Permenkes 25/2014 Pasal 8(2) splits neonatal essential care into "pada saat lahir 0 (nol) sampai 6 (enam)
jam" and "setelah lahir 6 (enam) jam sampai 28 (dua puluh delapan) hari".

Permenkes 21/2021 Lampiran I (OCR, pages 84–85, masa sesudah melahirkan, still in force): neonatal
essential care after 6 hours to 28 days includes "pemeriksaan neonatus menggunakan Manajemen Terpadu Bayi
Muda (MTBM)"; "Pemeriksaan Bayi Baru Lahir dengan pendekatan MTBM dilakukan dengan menggunakan formulir
pencatatan bayi muda 0 - 2 bulan dan bagan MTBS". The SATUSEHAT MTBS playbook describes MTBS as care for
"anak di bawah usia lima tahun".

Permenkes 28/2017 Pasal 20(4) names the first-handling cases as "asfiksia **bayi baru lahir**", "hipotermia
pada **bayi baru lahir** dengan berat badan lahir rendah", "infeksi tali pusat" and "salep mata pada **bayi
baru lahir** dengan infeksi gonore", each "dilanjutkan dengan perujukan" (20(2)(b)).

**Confirmed limits and the rule for P25-T03:**

| Band                          | Age                              | Own authority (never gated)                                                                          | Programme authority (`MTBS` gate)                                                            |
| ----------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Bayi baru lahir / neonate     | 0–28 days                        | Neonatal essentials (Pasal 20(3)); **first handling** of the four Pasal 20(4) conditions **followed by referral** | Managing a sick neonate under MTBM beyond first handling (Pasal 25(1)(c), "bayi … sakit")     |
| Bayi muda (MTBM chart)        | 0–2 months                       | Growth monitoring, counselling (Pasal 20(5)–(6))                                                     | Sick-infant management (MTBM is the 0–2-month arm of MTBS)                                   |
| Bayi, anak balita             | 0–59 months (MTBS)               | Growth and development monitoring incl. KPSP (Pasal 20(5))                                          | "penanganan bayi dan anak balita sakit sesuai dengan pedoman" (Pasal 25(1)(c))                |

So `SICK_CHILD` is gated for patients **younger than 60 months**; `NEONATAL_FIRST_AID` is allowed only for
patients **≤ 28 days old** and must carry a referral (or a recorded reason none was needed);
`WELL_CHILD` is never gated. "Under five" and "0–2 months" in the ticket are both confirmed; note MTBS
starts at birth (0–59 months), so a sick 3-week-old handled beyond first aid is MTBS work, not own
authority.

## 6. Programme immunisation (VERIFIED; recorded only)

Permenkes 28/2017 Pasal 20(3) puts "pemberian imunisasi Hepatitis B pertama (HB0)" inside neonatal
essential care (own authority). Pasal 25(1)(d) puts "pemberian imunisasi rutin dan tambahan sesuai dengan
program pemerintah" under programme authority. So every routine vaccine other than HB0 — BCG, polio,
DPT-HB-Hib, MR and the rest of the schedule — is programme authority, together with catch-up and
supplementary doses.

Permenkes 12/2017 Pasal 4–8 defined Imunisasi Program (rutin = dasar + lanjutan, tambahan, khusus) and
the infant schedule (Pasal 6: before age one, against hepatitis B, polio, TB, diphtheria, pertussis,
tetanus, Hib, measles). Permenkes 3/2026 Pasal 99 huruf r revokes 12/2017 "Pasal 11 ayat (4), dan Pasal 36
beserta Lampiran" (its guideline annex) and Pasal 98 keeps the rest "sepanjang tidak bertentangan". The
new frame: 3/2026 **Pasal 9** "(1) Pemberian Imunisasi dilaksanakan oleh Tenaga Medis. (2) Selain oleh
Tenaga Medis …, pemberian imunisasi program dapat dilaksanakan oleh Tenaga Kesehatan yang terlatih sesuai
dengan ketentuan peraturan perundang-undangan."; **Pasal 11** "(1) Imunisasi program terdiri atas: a.
Imunisasi rutin; b. Imunisasi tambahan; dan c. Imunisasi pelaku perjalanan. (2) Imunisasi rutin … diberikan
sesuai siklus hidup kepada bayi, anak usia di bawah 2 (dua) tahun, anak usia sekolah dasar, remaja, dewasa,
dan lanjut usia."; Pasal 10(1): antigens and schedule "ditetapkan oleh Menteri".

Answer for the record: **yes**, everything but HB0 is programme authority, held by a trained midwife under
penugasan. Enforcement is out of scope for P25 and P24-T12's completeness work does not depend on it.

## 7. Q11: the pilot puskesmas report and kohort layouts (STILL UNKNOWN)

**Owner: Product, through the pilot bidan. Requested 2026-09-15.** The ticket asks for the blank form (or a
filled one with names removed), every column header verbatim, whether the report is paper, Excel or a
system, and whether a second district uses the same layout. None of that can be obtained from this
research seat.

What the regulations require of the record: Permenkes 21/2021 Pasal 13(10) (kartu ibu/rekam medis,
formulir pencatatan kohort ibu, buku KIA) and Permenkes 28/2017 Pasal 28(h) (pencatatan dan pelaporan
termasuk pelaporan kelahiran dan kematian). Permenkes 31/2019 (Sistem Informasi Puskesmas, berlaku) carries
the Puskesmas reporting formulir in a scanned Lampiran of 288 pages that was not OCR'd in this spike; if the
pilot form matches one of its formulir, cite the formulir number from there.

### 7.1 Provisional layout A: LB3-KIA Maternal (district open data, labelled provisional)

Source: a Kota Malang open-data sheet "FORMAT LAPORAN (LB3-KIA) MATERNAL, Provinsi: Jawa Timur, Bulan:
Februari, Tahun: 2022" (https://data.malangkota.go.id/dataset/b7205338-3053-4aff-b4e8-d1fb6963e9f0). It is
one puskesmas's monthly maternal sheet, rows per kelurahan plus a puskesmas total, numbered columns 1–36.
Headers as printed (grouped headers written as `group / sub-header`):

```
NO. | Puskesmas | Kelurahan | Jumlah Bumil K1 (pws kia) | Jumlah Bumil K4 (pws kia)
| Diperiksa Hb K1
| Hb K1 / Anemia (8-11 mg/dl) | Hb K1 / Anemia (<8 mg/dl)
| Hb K4 / Anemia (8-11 mg/dl) | Hb K4 / Anemia (<8 mg/dl)
| KEK / Diperiksa LiLA | KEK / KEK (LiLA < 23,5)
| Protein urin / Diperiksa | Protein urin / Positif (+)
| Gula Darah (GD) / Diperiksa | Gula Darah (GD) / Positif (+)
| HBsAg / Diperiksa | HBsAg / Positif (+)
| Sifilis / Diperiksa | Sifilis / Positif (+)
| HIV / Diperiksa | HIV / Positif (+)
```

The sheet is a PDF export of a spreadsheet (fixed column numbers, `N` markers over each numeric column),
which suggests Excel, but that is an inference, not a fact about the pilot. It covers the antenatal
laboratory block only; the persalinan, nifas, neonatal and KB blocks of LB3-KIA are on other sheets that
were not published in that dataset.

### 7.2 Provisional layout B: PWS-KIA monthly indicators (Kemenkes 2010 pedoman)

The PWS-KIA pedoman lists the monthly data a bidan di desa reports upward (Bab IV A, "Data pelayanan"):
"Jumlah K1; Jumlah K4; Jumlah persalinan yang ditolong oleh tenaga kesehatan; Jumlah ibu nifas yang
dilayani 3 kali (KF 3) oleh tenaga kesehatan; Jumlah neonatus yang mendapatkan pelayanan kesehatan pada
umur 6-48 jam; Jumlah neonatus yang mendapatkan pelayanan kesehatan lengkap (KN lengkap); …" and its Bab
III indicators: cakupan K1, K4, Pn, KF3, KN1, KN lengkap, deteksi risiko oleh masyarakat, PK, penanganan
komplikasi neonatus, kunjungan bayi (29 hari–12 bulan), anak balita (12–59 bulan), anak balita sakit
dilayani MTBS, peserta KB aktif. Its Lampiran 1–8 are the reporting forms (antenatal; persalinan dan nifas;
sarana dasar; kematian ibu dan neonatal; sarana rujukan; antenatal terintegrasi; KB; kekerasan), but the
2010 pedoman predates K6 and KF4 and the pilot puskesmas will not be using it unchanged.

### 7.3 Kohort ibu register

The Kemenkes register "Kohort Ibu Tahun 2020" (`kesga.kemkes.go.id/assets/file/pedoman/Kohort Ibu Tahun
2020.pdf`) returned HTTP 503 on every attempt on 2026-09-15, and a Bappenas-hosted copy did not connect.
No column layout is recorded for it; P25-T15 must not assume one. Retry the URL or obtain the register from
the pilot bidan with the monthly form.

## 8. What changes for other tickets

- **P25-T02 / FR-AUTH-01:** legal basis in the record's help text is PP 28/2024 Pasal 744 and Permenkes
  13/2025 Pasal 185–187 (not "Permenkes 28/2017 Pasal 23"); the evidence field accepts a dinas penetapan,
  a government penugasan, or the STR annotation of the added competence; validity is the period the
  government set. See D-036.
- **P25-T03:** gate `69.7` and `97.71` only; implants by method/flag; `SICK_CHILD` gate for age < 60
  months; `NEONATAL_FIRST_AID` only for age ≤ 28 days with referral. See §4.4 and §5.
- **P25-T05 / FR-AUTH-04:** add `DELEGATION` beside `MANDATE`; both written; report back to the doctor;
  delegation only while the doctor is absent 1–3 months.
- **P25-T06 / FR-ANC-02, FR-ANC-07:** trimester boundaries 0–12 / >12–24 / >24 weeks; `K1M`/`K1A` as a
  derived flag labelled convention; FR-ANC-07 becomes MUST (two doctor visits with USG, trimester 1 and 3,
  recordable as done elsewhere); visits beyond six are numbered but carry no SATUSEHAT identifier.
- **P25-T15 / FR-RPT-02:** layout stays configuration; §7.1 is the provisional column set for the
  antenatal block; the kohort register layout is still to be obtained.
