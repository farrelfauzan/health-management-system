# e-Kohort KIA: interface spike (P25-T11)

Researched on **15 September 2026** from public pages only: the e-Kohort KIA site itself
(`ekohort.kemkes.go.id`), the Kemenkes ASIK/SSI help centre (`asiksupport-stg.dto.kemkes.go.id`,
served from GitBook), the SATUSEHAT interoperability playbooks, Permenkes 28/2017 from
`peraturan.bpk.go.id`, the 2010 PWS-KIA guideline hosted by Dinkes Provinsi Sumatera Utara, and
Dinkes news pages. No e-Kohort account exists for this project, so nothing was logged in to, and the
DHIS2 host the login page links to was **not** probed. Each question ends **VERIFIED** (a primary
government page says it), **PARTLY VERIFIED** (the primary page implies it and a secondary copy of
a government document fills the gap) or **STILL UNKNOWN**.

Vendor blogs and user-uploaded copies of Kemenkes material are cited only as pointers and are
labelled "secondary". No quotation below comes from an AI summary; every quoted string was read
from the page's own HTML, Markdown or PDF text.

## Summary

| #   | Question                                                                                     | Answer                                                                                                                                                                                                                                                                                                                                                      | Status                              | Unblocks / blocks                                                                    |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| Q1  | Who operates e-Kohort KIA, and is it still live or replaced by ASIK / SATUSEHAT?             | **Kemenkes, Direktorat Kesehatan Keluarga.** Live on 15 Sep 2026 (HTTP 200, footer "© Kementerian Kesehatan Republik Indonesia 2026"). Not replaced: Kemenkes' own help centre says ASIK/SSI is for out-of-building (posyandu) recording, e-Kohort for in-building, and the two are **not integrated**. The named successor path is the SATUSEHAT ANC and PNC modules | VERIFIED                            | FR-RPT-04                                                                            |
| Q2  | Does it expose an API, a bulk import, or only web entry?                                     | **Nothing public.** No API, import template or developer page exists on any `kemkes.go.id` page found. The login page offers a login form, a district registration button (404 today), a vendor helpdesk link, and a "Dashboard dan Laporan" button that opens a **DHIS2** login on a bare IP host. Whether any partner is given DHIS2 credentials is undocumented | VERIFIED (no public interface)      | FR-RPT-04: nothing to build against                                                  |
| Q3  | Who grants a PMB access, and does the PMB enter data itself?                                 | **Dinkes kabupaten/kota registers the district**; the login form itself is scoped by province and kabupaten/kota. A Dinkes deck (secondary copy) says puskesmas and hospitals register new nakes "di PKM, Praktek Mandiri", and Dinkes registers "Lembaga Kesehatan (RS, Klinik)". A 2024 study of PMBs in one district shows PMBs entering data themselves with puskesmas support | PARTLY VERIFIED                     | FR-RPT-04; pilot question Q5                                                         |
| Q4  | Is the kohort data derivable from what SATUSEHAT already receives (ANC, PNC)?                | **Mostly, element by element.** 44 of the 53 Kemenkes 2020 kohort-ibu columns map directly to SATUSEHAT ANC, PNC, INC or Neonatus variables, 4 more only through a generic lab Observation, 3 not at all (payer, mental-health screening, KB pasca-salin). But **the platform does not feed e-Kohort today**: Kemenkes says the integration is "sedang dalam proses". Kemenkes also says a facility that has adopted the SATUSEHAT ANC/PNC modules "tidak perlu melakukan pencatatan di eKohort"; whether a given Dinkes honours that is a local question | VERIFIED (mapping); policy is local | P25-T06+ (ANC/PNC submission) is the real "connection"                               |
| Q5  | What do the pilot bidan and puskesmas actually use each month?                               | Not reachable from this spike. Owner **Product**, requested **2026-09-15**; the same request as Q11 in P25-T01                                                                                                                                                                                                                                              | STILL UNKNOWN                       | P25-T15 layout (Q11) and whether the Dinkes accepts SATUSEHAT in place of e-Kohort   |
| —   | **FR-RPT-04 decision**                                                                       | **No e-Kohort work.** P25-T15 exports only, with the kohort-ibu export laid out in the Kemenkes 2020 register column order so it can be retyped or attached. Revisit only if Kemenkes ships the SATUSEHAT–e-Kohort feed or the pilot Dinkes hands us a DHIS2 import                                                                                     | DECIDED                             | P25-T15 scope stays as written; addendum non-goal reworded below                     |

## 1. Operator and status (Q1)

### What the site itself says

`GET https://ekohort.kemkes.go.id/` on 15 September 2026 returned 200 (served through Cloudflare).
The page is a login form titled "Login - 166" whose text carries, verbatim:

- "Direktorat Kesehatan Keluarga, Kementerian Kesehatan Republik Indonesia"
- an acknowledgement "1. USAID dalam pengembangan aplikasi E kohort Kesehatan Ibu dan Anak 2. UNFPA
  dalam pengembangan aplikasi E kohort Kesehatan Reproduksi"
- footer "© by Kementerian Kesehatan Republik Indonesia 2026"
- a login form that asks for **Provinsi** and **Kabupaten/Kota** before username and password
- a button "Dashboard dan Laporan e-kohort" linking to
  `https://<ip>:44380/dhis-web-commons/security/login.action` (a DHIS2 login path; the host is a bare
  IP, so it is not reproduced here and was not opened)
- a button "Pendaftaran Implementasi e-Kohort KIA Kabupaten/Kota" linking to
  `/administrator/auth/form_registrasi`, which returned **404** today
- a "Helpdesk" link to `helpdesk.dimensitekno.id`, a vendor domain, which returned 522 today

So the operator is Kemenkes (Direktorat Kesehatan Keluarga), the build was donor-funded, a vendor
runs the helpdesk, and the reporting layer is a DHIS2 instance. A secondary copy of a Dinkes
Provinsi Lampung 2022 deck describes the product as "Bentuk Web Based Mobile DHIS2", which matches
what the login page exposes.

### Not replaced by ASIK / SSI

The Kemenkes help centre for ASIK (now renamed **SSI, Satusehat Indonesiaku**, in its own index) has
an "Integrasi eKohort" section. Its pages, read as Markdown on 15 September 2026, say:

- "Saat ini ASIK dan Ekohort belum melakukan integrasi. Karena fokus pertama dalam ASIK adalah
  mengintegrasikan pencatatan luar gedung." (`ibu-hamil/integrasi-ekohort`)
- "eKohort digunakan untuk pencatatan di dalam gedung, ASIK digunakan untuk pencatatan di luar
  gedung, seperti di Posyandu." (`.../pendaftaran-ulang-bidan-ekohort-di-asik`)
- "Apabila sudah melakukan pencatatan data individu di eKohort, tetap perlu melakukan pencatatan
  ulang di ASIK." (`.../pencatatan-ganda-antara-asik-dan-ekohort`)
- The comparison table (`.../perbedaan-ekohort-dan-asik`) lists eKohort's "Integrasi dengan Sistem
  Lain" as "Sedang dalam proses integrasi dengan platform lain seperti Satu Sehat."

And the successor path is named explicitly on the section page:

> "Apabila ingin tersambung adalah mengadopsi modul ANC dan PNC satu sehat. Apabila sudah diadopsi di
> modulnya. maka tidak perlu melakukan pencatatan di eKohort."

### Still in use in districts

Dinkes Kabupaten Bangka ran a "Pertemuan Evaluasi Data Pengentrian e-Kohort dan MPDN" whose page
records the meeting on 18 July 2025 and states that "capaian entri data ibu hamil, ibu bersalin, ibu
nifas, Bayi baru lahir, Balita, Kesehatan Reproduksi (Kespro), dan lansia belum maksimal seluruhnya
di entry kedalam aplikasi E-kohort". Older Dinkes pages (Salatiga 23 May 2023, Buleleng 27 April
2023, Bengkalis 10 April 2023, Lima Puluh Kota 24 February 2022) describe socialisation and training
of puskesmas and village midwives on "aplikasi berbasis web dan mobile".

**Consequence:** e-Kohort is a Kemenkes system, alive in 2026, still expected in districts, and not
merged into ASIK/SSI. Kemenkes' own stated way to stop double entry is SATUSEHAT's ANC and PNC
modules, not an e-Kohort connector.

## 2. Interface: API, import, or web entry only (Q2)

Searched for: an API catalogue, a developer or "integrasi" page, an import template, or an upload
menu, on `ekohort.kemkes.go.id`, `kemkes.go.id` generally, the SATUSEHAT docs and the ASIK/SSI help
centre. Findings:

| Looked for                                   | Result                                                                                                                                                                                                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API documentation on any `kemkes.go.id` host | **None.** The SATUSEHAT catalogue has no e-Kohort resource; the ASIK/SSI help centre index (`llms.txt`, all pages) mentions eKohort only in the four integration FAQ pages above                                                                                                                    |
| Import/upload template                       | **None published.** The user-uploaded tutorial copies (secondary; Scribd, AnyFlip, PDFCoffee — the latter two unreachable today) describe form-by-form web entry: open the site, log in, "data layanan", pick the service, fill mandatory fields, upload a photo, save. No bulk step appears in them |
| Public developer registration                | `/administrator/register` exists but is a bare theme page ("Register now, its free!") with name, username, email, password; it is the template's stock form, not a partner onboarding                                                                                                            |
| DHIS2                                        | The "Dashboard dan Laporan" button opens a DHIS2 login. DHIS2 does ship a generic Web API and import formats, **but nothing published says a fasyankes or an RME vendor is issued DHIS2 credentials**, and the host is an IP address, not a documented endpoint                                       |
| Vendor claims                                | eHealth's blog (secondary) says data "dapat secara otomatis terhubung dengan platform E-Kohort" using "standar interoperabilitas yang telah ditentukan pemerintah", with no mechanism, date or Kemenkes reference. Unverifiable; treated as marketing                                                |

**What is VERIFIED:** there is no public API, no public import format and no partner documentation.
**What is STILL UNKNOWN:** whether Kemenkes or a Dinkes will hand out DHIS2 or e-Kohort credentials
to a private clinic's software on request. Nobody was asked in this spike; the question belongs with
the Q5 request to Product (2026-09-15), because only the pilot's Dinkes can answer it for the pilot.

**Consequence:** there is nothing to build a sync or an "export matching the import" against. An
export shaped like the e-Kohort screens would be a guess at forms we cannot see.

## 3. Access and who enters the data (Q3)

### Verified from the site and the regulation

- The login form is scoped by **Provinsi** and **Kabupaten/Kota** before the username, and the only
  registration path on the page is "Pendaftaran Implementasi e-Kohort KIA Kabupaten/Kota". The
  account hierarchy therefore starts at Dinkes kabupaten/kota, not at the facility.
- The reporting duty itself sits on the PMB. Permenkes 28/2017 (PDF from `peraturan.bpk.go.id`,
  page 23), Pasal 45:
  > "(1) Bidan wajib melakukan pencatatan dan pelaporan sesuai dengan pelayanan yang diberikan.
  > (2) Pelaporan sebagaimana dimaksud pada ayat (1) ditujukan ke puskesmas wilayah tempat praktik.
  > … (4) Ketentuan pelaporan sebagaimana dimaksud pada ayat (2) dikecualikan bagi Bidan yang
  > melaksanakan praktik di Fasilitas Pelayanan Kesehatan selain Praktik Mandiri Bidan."
  Whether PP 28/2024 changed this is P25-T01's Q9, not re-examined here.
- The paper baseline is the 2010 Kemenkes PWS-KIA guideline (PDF hosted by Dinkes Provinsi Sumatera
  Utara, page 44): "Setiap bulan Bidan di desa mengolah data yang tercantum dalam buku kohort dan
  dijadikan sebagai bahan laporan bulanan KIA. Bidan Koordinator di Puskesmas menerima laporan bulanan
  tersebut…" and (page 46) the PWS inputs include "laporan dari perawat/bidan/dokter praktik swasta,
  rumah sakit bersalin dan sebagainya." So the puskesmas Bikor is the receiving role either way.
- For the out-of-building app the rule for private practice is explicit
  (`bayi-balita/pengguna-asik-bayi-balita/praktik-bidan-dan-klinik-praktik-mandiri`): "ASIK digunakan
  khusus untuk tenaga kesehatan di puskesmas dan kader Posyandu. Bagi Bidan Praktek Mandiri dan RS
  Swasta yang ingin melakukan penginputan data, mereka harus menggunakan sistem informasi milik
  fasilitas kesehatan mereka yang terintegrasi dengan Satu Sehat Platform." and "Bidan dan klinik
  praktik mandiri tidak dapat melakukan pencatatan menggunakan ASIK Posyandu Bayi dan Balita".

### Secondary, filling the PMB gap

- A Dinkes Provinsi Lampung deck (2022, "Seksi Kesga dan Gizi"; user-uploaded copy on SlideShare)
  lists role capabilities: puskesmas and hospitals "Mendaftarkan Tenaga Kesehatan Baru (Nakes di PKM,
  Praktek Mandiri)", Dinkes kab/kota "Mendaftarkan Lembaga Kesehatan (RS, Klinik)", nakes "Mencatat
  Data Pelayanan Ibu, Bayi, Balita" and "Melihat dan Memantau Kohort".
- A user-uploaded copy of the Kemenkes registration form ("Contoh Format Isian Registrasi e-Kohort
  KIA") is addressed to Dinkes kabupaten/kota and asks for facility lists including praktik mandiri
  bidan and an SK; the SK template is still hosted at `ekohort.kemkes.go.id/uploads/SK_Kadinkes_e-Kohort_KIA.doc`
  (the download was blocked by the site's WAF today, so its content is not quoted).
- Jurnal Ilmiah Kesehatan Rustida (2024) reports PMBs in Kabupaten Pelalawan using e-Kohort
  themselves: "partisipan berespon positif dan menerima sebagai bidan praktek mandiri dengan adanya
  aplikasi e-kohort", with "kendala jaringan" and "peran puskesmas sangat bagus dan membantu".

**Consequence:** where a district has rolled e-Kohort out, the puskesmas (not Dinkes) creates the
PMB's nakes account and the PMB types her own kohort entries; where it has not, she hands the paper
kohort/monthly report to the Bikor. Which of the two the pilot faces is Q5.

## 4. Overlap with what SATUSEHAT already receives (Q4)

The comparison uses the **Kemenkes 2020 Register Kohort Ibu** (53 columns; read from a user-uploaded
copy carrying the "KEMENTERIAN KESEHATAN REPUBLIK INDONESIA 2020" letterhead, secondary) against the
variable tables of the SATUSEHAT playbooks read by `curl` today: ANC (v2.5, 2 July 2024), PNC (v3.5,
19 July 2024) and Neonatus. Delivery columns are noted against the INC playbook by name only.

| Kohort ibu column(s)                                                   | SATUSEHAT variable (playbook)                                                                                                  | Covered?                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| 2–4 Nama, NIK, Alamat (desa/kelurahan)                                 | ANC Tabel 2 §1: Nama Lengkap, NIK, `Patient.address…village`                                                                   | Yes                          |
| 5 Sumber pembiayaan                                                    | Not in the ANC/PNC variable tables                                                                                              | **No**                       |
| 6 Usia ibu                                                             | `Patient.birthDate`                                                                                                             | Yes (derived)                |
| 7 Status GPA                                                           | ANC §3: Gravida, Partus, Abortus                                                                                                | Yes                          |
| 8 Jarak kehamilan                                                      | ANC §3.10 "Jarak kehamilan saat ini dengan kehamilan sebelumnya"                                                                | Yes                          |
| 9 Taksiran persalinan                                                  | ANC §3.4–5 HPHT, Hari Perkiraan Lahir                                                                                          | Yes                          |
| 10–11 TB, LILA                                                         | ANC §3.7 Tinggi Badan; §5.2 Lingkar Lengan Atas                                                                                 | Yes                          |
| 12–13 Status imunisasi TD, injeksi TD                                  | ANC §3.11–12 Status imunisasi TT (`Immunization`)                                                                               | Yes                          |
| 14 Skrining TBC, 23 TBC mikroskopis, 24 Malaria                        | Not in the 10T list (Hb, HIV, sifilis RPR/VDRL, hepatitis B, gula darah, protein urin); a generic lab `Observation` could carry them | **Partly** (no named code)   |
| 15 Skrining jiwa                                                       | Not listed                                                                                                                      | **No**                       |
| 16–22 Hb, golongan darah, protein urin, glukosa urin, HIV, sifilis, HBsAg | ANC §5.9–10 and §10 Pemeriksaan 10T (glukosa urin only as "Gula Darah Sewaktu")                                                | Yes (glukosa urin: partly)   |
| 26 Konseling                                                           | ANC §13 Edukasi (`Procedure`), §11 "mengikuti kelas ibu hamil"                                                                  | Yes                          |
| 27 Komplikasi                                                          | ANC §9.1 Komplikasi/Penyulit Kehamilan (`Condition`)                                                                            | Yes                          |
| 28–39 Pemeriksaan per bulan (the K-visit grid)                         | ANC Tabel 24: `Encounter.identifier` system `…/CodeSystem/episodeofcare/ANC`, values **K1A, K1M, K2…K6**, one per visit          | Yes                          |
| 40 Tgl lahir, hidup/lahir mati                                         | INC playbook; Neonatus §2 Tanggal Lahir, Jam Lahir                                                                              | Yes                          |
| 41–42 Berat bayi lahir                                                 | Neonatus §3.j Berat Badan Bayi Saat Lahir                                                                                       | Yes                          |
| 43–46 Cara persalinan, tempat, penolong, penyulit                      | INC playbook (not compared column by column here)                                                                               | Yes, by module               |
| 47–50 KF1–KF4                                                          | PNC §2.d "Kunjungan PNC (KF)" on `Encounter`, values KF 1 (6 jam–2 hari) … KF 4 (29–42 hari)                                     | Yes                          |
| 51 Pelayanan KBPP                                                      | No KB variable in the PNC table; no contraception use case in the playbook index                                                | **No**                       |
| 52 Tata laksana kasus nifas                                            | PNC §5–6 Diagnosis, Tindakan                                                                                                    | Yes                          |
| 53 Keterangan                                                          | Free text; not applicable                                                                                                       | —                            |

**Reading the table:** 44 of 53 columns are derivable directly from the SATUSEHAT payloads a clinic
sends under the ANC, PNC, INC and Neonatus playbooks; 4 (TBC, malaria, glukosa urin) only through a
generic lab `Observation` with no playbook code; 3 not at all (payer, mental-health screening, KB
pasca-salin); 2 (`NO.`, `KETERANGAN`) are bookkeeping.

**But derivable is not delivered.** Two Kemenkes statements set the boundary:

1. The platform does **not** feed e-Kohort yet: "Kami sedang dalam proses mengintegrasikan aplikasi
   ASIK dengan eKohort melalui platform Satu Sehat" (help centre, 15 Sep 2026). Sending ANC/PNC
   bundles today puts nothing into a Dinkes' e-Kohort screens.
2. Kemenkes nonetheless says adoption of the modules removes the duty to record in e-Kohort ("tidak
   perlu melakukan pencatatan di eKohort", §1 above). That is a national statement on an FAQ page; a
   Dinkes that grades puskesmas on e-Kohort entry completeness (Bangka, July 2025) may not apply it
   to a private clinic's jejaring. Whether the pilot's Dinkes does is part of Q5.

**Consequence for the P25 ANC/PNC tickets:** the K-visit and KF identifiers are the join key between
our records, the kohort columns and SATUSEHAT. Today nothing in `apps/api` sends
`EpisodeOfCare` type ANC/PNC or the `Encounter.identifier` K1A…K6 / KF1…KF4 values (grep on
15 Sep 2026: no hits outside this document). Whichever P25 ticket implements ANC and PNC submission
must send them, or the "adopted the modules" argument collapses for the pilot.

## 5. What the pilot uses each month (Q5)

**STILL UNKNOWN.** The pilot bidan and her puskesmas cannot be reached from this spike. Owner:
**Product**; requested **2026-09-15**; combined with Q11 of P25-T01 (the report layout) because the
same conversation answers both. The three things to ask, in order:

1. Does the puskesmas Bikor take the monthly KIA report on paper, as Excel, or only through e-Kohort?
2. If e-Kohort: does the PMB have her own nakes account (created by the puskesmas), or does the
   puskesmas type her paper register?
3. If the clinic submits ANC/PNC to SATUSEHAT, will the Dinkes accept that in place of e-Kohort entry,
   as the Kemenkes FAQ says?

Until answered, P25-T15's layout constant stays blocked on Q11 as its ticket already states.

## Recommendation for FR-RPT-04

**Decision: no e-Kohort work.** Reasoning:

- **Sync** needs an interface. None is published (Q2); the only machine-facing surface is a DHIS2
  login on an IP address with no partner onboarding, and Kemenkes' stated integration path is the
  SATUSEHAT ANC/PNC modules, not e-Kohort itself (Q1). Building a sync would mean reverse-engineering a
  login-protected Ministry system, which this project must not do.
- **Export matching the import** needs an import. There is none to match (Q2). An export shaped
  like the entry screens would be guesswork against forms we cannot see.
- **The kohort/monthly exports (FR-RPT-01..03) already serve the two real flows** (Q3): the PMB
  retypes into her own e-Kohort account, or she hands the register to the Bikor. Both want the
  register in the **Kemenkes 2020 column order**, which is why P25-T15's kohort-ibu column constant
  should default to the 53 columns in §4 unless Q11 shows the pilot puskesmas uses something else.
- **The connection Kemenkes actually recognises is SATUSEHAT** (Q1, Q4). The P25 ANC/PNC submission
  tickets are where the effort belongs, with the K-visit and KF identifiers sent on every Encounter.
- **Re-open only on one of two triggers:** Kemenkes ships the SATUSEHAT-to-e-Kohort feed (watch the
  "Integrasi eKohort" help-centre section and the SATUSEHAT changelog), or the pilot Dinkes offers a
  documented DHIS2 import with credentials for a private clinic. Either is a new ticket, not a
  reopening of this one.

## Addendum changes (apply to docs/product/prd-klinik-bidan-midwife-practice.md once P25-T01 merges)

The addendum Markdown is being added by P25-T01 on a parallel branch and is not on `main` yet, so
the edits are recorded here for the merge that follows both.

1. **FR-RPT-04**, replace the placeholder text with:

   > **FR-RPT-04 (decided by P25-T11, 15 September 2026): no e-Kohort KIA interface.** e-Kohort KIA
   > publishes no API and no import format (`docs/ops/e-kohort-kia-spike.md` §2). The monthly KIA
   > report and the kohort registers are delivered as exports only (FR-RPT-01..03). The kohort-ibu
   > register export uses the Kemenkes 2020 Register Kohort Ibu column order (53 columns) unless P25-T01
   > Q11 records a different pilot layout. The recognised electronic path to the Ministry is the
   > SATUSEHAT ANC and PNC modules with the K-visit (K1A, K1M, K2..K6) and KF (KF1..KF4)
   > `Encounter.identifier` values on every visit.

2. **Non-goals**, replace "no two-way e-Kohort sync before this spike" with:

   > No e-Kohort KIA sync, import file or export-matching-import in this phase. P25-T11 found no public
   > interface; the Kemenkes-stated integration path is SATUSEHAT ANC/PNC. Revisit as a new ticket only
   > if Kemenkes ships the SATUSEHAT-to-e-Kohort feed or the pilot Dinkes provides a documented DHIS2
   > import for private clinics.

3. **Open questions table**, add to the Q11 row (or the row that tracks the pilot report format):
   "Also asks whether the PMB holds an e-Kohort nakes account and whether the Dinkes accepts SATUSEHAT
   ANC/PNC submission in place of e-Kohort entry (P25-T11 Q5, owner Product, requested 2026-09-15)."

## Sources

Primary (government domains; read on 15 September 2026):

- `https://ekohort.kemkes.go.id/` — login page: operator line, USAID/UNFPA acknowledgement, 2026
  footer, province/kabupaten scoping, DHIS2 "Dashboard dan Laporan" link, district registration link
  (404), vendor helpdesk link. `https://ekohort.kemkes.go.id/administrator/register` — stock theme form.
- `https://asiksupport-stg.dto.kemkes.go.id/asiksupport-stg/ibu-hamil/integrasi-ekohort` (+
  `/pendaftaran-ulang-bidan-ekohort-di-asik`, `/pencatatan-ganda-antara-asik-dan-ekohort`,
  `/perbedaan-ekohort-dan-asik`), `.../bayi-balita/pengguna-asik-bayi-balita/praktik-bidan-dan-klinik-praktik-mandiri`,
  `.../ibu-hamil/layanan-ibu-hamil`, `.../llms.txt` — the kemkes host 307-redirects to
  `satusehat-1.gitbook.io/asiksupport-stg/…`; the `.md` form of each page was read verbatim.
- `https://satusehat.kemkes.go.id/platform/docs/id/interoperability/anc/` (v2.5, Tabel 2 and Tabel 24),
  `.../interoperability/pnc/` (v3.5, Tabel 2, KF table), `.../interoperability/neonatus/` (Tabel 2).
- `https://peraturan.bpk.go.id/Download/103030/Permenkes%20Nomor%2028%20Tahun%202017.pdf` — Pasal 45,
  page 23 (parsed with `pdf-parse`).
- `https://dinkes.sumutprov.go.id/bidang-yankes/downloadfile?id=350` — Kemenkes, *Pedoman Pemantauan
  Wilayah Setempat Kesehatan Ibu dan Anak (PWS-KIA)*, 2010, pages 40–46 and 73–74.
- Dinkes news: `dinkes.bangka.go.id/berita/pertemuan-evaluasi-data-pengentrian-e-kohort-dan-mpdn-…-tahun-2024`
  (meeting 18 July 2025); `dinkes.salatiga.go.id/sosialisasi-e-kohort-kia/` (23 May 2023);
  `dinkes.bulelengkab.go.id/informasi/detail/berita/76_…` (27 April 2023);
  `dinkes.bengkaliskab.go.id/berita/94/` (10 April 2023);
  `dinkes.limapuluhkotakab.go.id/berita/bimtek-dan-sosialisasi-e-kohort` (24 February 2022).

Secondary (pointers only; user-uploaded copies or vendor pages, not citations of fact):

- SlideShare, "Materi E-Kohort Dinkes Prop untuk nakes" (Dinkes Provinsi Lampung, Seksi Kesga dan
  Gizi, 2022): role table and "Bentuk Web Based Mobile DHIS2".
- SlideShare, "Kohort Ibu Tahun 2020" (Kemenkes 2020 register, 53 columns).
- Scribd, "Alur Pendaftaran dan Implementasi e-Kohort KIA" and "Contoh Format Isian Registrasi
  e-Kohort KIA" (Kemenkes registration flow addressed to Dinkes kab/kota).
- Jurnal Ilmiah Kesehatan Rustida (Akes Rustida, 2024/2025), "Implementasi Program Pemerintah tentang
  Aplikasi E-Kohort bagi Bidan Praktik Mandiri di Kabupaten Pelalawan Riau" (abstract).
- eHealth.co.id blog on "Integrasi RME eHealth X E-Kohort KIA" (vendor claim, unverifiable).
- Unreachable today: `pdfcoffee.com/tutorial-e-kohort-…` (connection refused), `anyflip.com/smqoo/kosj`
  (403), `helpdesk.dimensitekno.id` (522), `ekohort.kemkes.go.id/uploads/SK_Kadinkes_e-Kohort_KIA.doc`
  (WAF 555), `sikompak.bappenas.go.id` Register Kohort Ibu PDF (DNS failure).

## Cleanup

No account was created, no login attempted, no request sent to the DHIS2 host. Downloaded PDFs and
HTML snapshots live in the session scratchpad, outside the repository.
