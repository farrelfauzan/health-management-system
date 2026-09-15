# Midwife formulary: KFA probe (P25-T04)

Probed on **15 September 2026** against the SATUSEHAT **staging** KFA service
(`SATUSEHAT_KFA_BASE_URL` = `https://api-satusehat-stg.dto.kemkes.go.id/kfa-v2`). It used this
repository's own client-credentials flow, the same one `SatusehatTokenClient` and
`SatusehatKfaClient` use, from a throwaway script that was not committed. It answers how the midwife
formulary template (FR-FORM-01/02) can match a clinic's catalog when `Medication.kfaCode` holds a
manufacturer-specific product code. Each probe is marked **VERIFIED** or **STILL UNKNOWN**.

This file contains no credentials, tokens or organisation ids. Only response keys, product names and
KFA codes are quoted.

## Summary

| #   | Question                                                                      | Answer                                                                                                             | Status        |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------- |
| Q1  | Does a `/products/all` item carry a template (92-level) code?                 | **Yes**, under `product_template.kfa_code`, with `product_template.name`                                           | VERIFIED      |
| Q2  | Does it carry a generic/ingredient code too?                                  | **Yes**, `active_ingredients[].kfa_code` (91-level) per ingredient. Not used: it cannot tell 60 mg from 180 mg     | VERIFIED      |
| Q3  | Does a product-detail endpoint return the template code?                      | **Yes**, `GET /products?identifier=kfa&code=<93 code>` answers `result.product_template.kfa_code`                  | VERIFIED      |
| Q4  | What does the detail endpoint answer for a template (92) code?                | `200` with `result: null`, so a template code cannot be stored as `Medication.kfaCode` and resolved later          | VERIFIED      |
| Q5  | Are condoms in the `farmasi` dictionary?                                      | **No.** They are `alkes` (`farmalkes_type.code: device`) with 83-level product and 82-level template codes         | VERIFIED      |
| Q6  | Is the seeded HB0 code accepted by the Immunization terminology (rule 10103)? | Not checked. It needs an Immunization POST against a sandbox patient and encounter, which this ticket did not make | STILL UNKNOWN |

**Design outcome: the template-code branch.** `SatusehatKfaClient` now maps
`product_template.kfa_code` to `templateKfaCode` on every product and gains `getProduct(kfaCode)` for
the detail endpoint. The formulary preview asks KFA for the template code behind each catalog code the
exact lists do not cover. A row whose template is one the item names matches as `KFA_TEMPLATE`, so
iron tablets from another manufacturer are found without listing every 93 code. Exact codes still
match first (`KFA_CODE`). Name keywords only _suggest_ a row (`KEYWORD`): it is never preselected and
`apply` refuses it. When SATUSEHAT is not configured or does not answer, the preview falls back to
exact codes and keywords and reports `templateLookup: SKIPPED`.

## 1. Raw search item (Q1, Q2)

`GET /products/all?page=1&size=10&product_type=farmasi&keyword=tablet tambah darah`: `200`, top-level
keys `total`, `page`, `size`, `items`. On staging `items` is a bare array (`total: 10501`).

Keys of `items[0]`:

```
name, kfa_code, active, state, image, updated_at, farmalkes_type, dosage_form,
produksi_buatan, nie, nama_dagang, manufacturer, registrar, generik, rxterm,
dose_per_unit, fix_price, het_price, farmalkes_hscode, tayang_lkpp, kode_lkpp,
net_weight, net_weight_uom_name, volume, volume_uom_name, med_dev_jenis,
med_dev_subkategori, med_dev_kategori, med_dev_kelas_risiko, klasifikasi_izin,
uom, product_template, active_ingredients, tags, replacement, paket_obat,
fornas, total_data
```

The template and ingredient parts of that item, verbatim apart from pricing and registration fields:

```json
{
  "name": "Ferrous Fumarate 60 mg / Folic Acid 0,4 mg Tablet Salut Gula (TABLET TAMBAH DARAH)",
  "kfa_code": "93015491",
  "active": true,
  "state": "valid",
  "farmalkes_type": { "code": "medicine", "name": "Obat", "group": "farmasi" },
  "dosage_form": { "code": "BS075", "name": "Tablet Salut Gula" },
  "manufacturer": "MERSIFARMA TIRMAKU MERCUSANA",
  "uom": { "name": "Tablet" },
  "product_template": {
    "name": "Ferrous Fumarate 60 mg / Folic Acid 0,4 mg Tablet Salut Gula",
    "state": "valid",
    "bmhp": false,
    "active": true,
    "kfa_code": "92000653",
    "updated_at": "2026-07-03 07:18:10",
    "display_name": "Ferrous Fumarate 60 mg / Folic Acid 0,4 mg Tablet Salut Gula"
  },
  "active_ingredients": [
    {
      "kfa_code": "91000205",
      "zat_aktif": "Ferrous Fumarate",
      "kekuatan_zat_aktif": "60 mg"
    },
    {
      "kfa_code": "91000289",
      "zat_aktif": "FOLIC ACID",
      "kekuatan_zat_aktif": "0.4 mg"
    }
  ],
  "replacement": {
    "product": { "name": null, "reason": null, "kfa_code": null },
    "template": { "name": null, "reason": null, "kfa_code": null }
  }
}
```

Six of the ten items on that page share template `92000653` across six manufacturers. That is the
case exact-code matching alone would miss.

## 2. Product detail (Q3, Q4)

| Request                                           | Status | Result                                                                                                  |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| `GET /products?identifier=kfa&code=93015491`      | 200    | Top-level `search_code`, `search_identifier`, `result`. `result.product_template.kfa_code` = `92000653` |
| `GET /products?identifier=kfa&code=92000653`      | 200    | `{"search_code":"92000653","search_identifier":"-","result":null}`                                      |
| `GET /products?identifier=kfa&code=93023161` (HB) | 200    | `result.cvx_info.code` = `08` ("Hep B, adolescent or pediatric"), group `45` HepB                       |

`result` on the detail endpoint carries more keys than a search item, among them `ucum`,
`controlled_drug`, `rute_pemberian`, `atc_l1`…`atc_l5`, `indication`, `identifier_ids`,
`packaging_ids`, `dosage_usage` and `cvx_info`.

## 3. Seeded KFA codes

Every code below came from a live `/products/all` search on 2026-09-15 and is `active: true`,
`state: valid`. Inactive products the search returned were left out. The template column is each
product's `product_template.kfa_code`. The seed is in `apps/api/prisma/seed.sql`
(`seed_midwife_formulary_items`), and **it never sets `medications.is_midwife_prescribable`**.

| Item code                  | Search keyword (product type)                                        | Templates seeded                               | Products seeded (KFA product name as returned)                                                                                                                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FE_PREGNANCY`             | `tablet tambah darah` (farmasi)                                      | `92000653`, `92004223`, `92000700`             | Ferrous Fumarate 60 mg / Folic Acid 0,4 mg Tablet Salut Gula: `93015491`, `93027609`, `93026885`, `93024087`, `93027000`, `93003805`; … Tablet Salut Selaput: `93026544`; Ferrous Fumarate 180 mg / Folic Acid 0,4 mg: `93027349`, `93006443`, `93014372`                                                                     |
| `VIT_A_POSTPARTUM`         | `vitamin a 200000`, `retinol palmitate` (farmasi)                    | `92000809`                                     | Retinol Palmitate 200.000 IU Kapsul Lunak: `93006228`, `93020870`, `93002593`, `93006475`                                                                                                                                                                                                                                     |
| `OXYTOCIN_AMTSL`           | `oxytocin` (farmasi)                                                 | `92000756`                                     | Oxytocin 10 IU/mL Injeksi: `93020784`, `93025032`, `93012760`, `93002907`, `93007458`, `93011974`, `93013579`, `93026877`, `93021623`, `93021932`, `93019223`, `93013595`, `93015797`, `93015796`, `93008863`, `93002165`, `93005047`, `93004476`                                                                             |
| `VIT_K1_NEWBORN`           | `phytomenadione` (farmasi)                                           | `92000971`, `92000659`                         | Phytomenadione 2 mg/mL Injeksi: `93006337`, `93004858`, `93012410`, `93011289`, `93012929`, `93001719`, `93002908`, `93006686`, `93006685`, `93004290`, `93021333`, `93020444`, `93012105`; Phytomenadione / Vitamin K1 10 mg/mL Injeksi: `93001129`. Tablets left out                                                        |
| `HEP_B_BIRTH_DOSE`         | `vaksin hepatitis b` (farmasi)                                       | `92000819`, `92005974`                         | Vaksin Hepatitis B Recombinant Protein 20 mcg/mL Suspensi Injeksi: `93023161`, `93023162`, `93026222`, `93023169`, `93023170`, `93023171`, `93023173`, `93026465`, `93026157`, `93023172`, `93023168`, `93008995`; … Surface Antigen Recombinant 10 mcg Injeksi: `93026075`                                                   |
| `NEONATAL_EYE_PROPHYLAXIS` | `oxytetracycline salep mata`, `chloramphenicol salep mata` (farmasi) | `92000844`, `92001727`                         | Oxytetracycline 1% Salep Mata: `93025900`, `93001559`, `93025331`, `93018792`; Chloramphenicol 1% Salep Mata: `93022418`, `93011655`, `93022417`, `93022415`, `93022416`, `93016724`                                                                                                                                          |
| `COC_PILL`                 | `levonorgestrel ethinylestradiol` (farmasi)                          | `92001040`, `92001059`, `92003225`, `92006300` | Levonorgestrel 0,15 mg / Ethinylestradiol 0,03 mg tablets (sugar-coated, film-coated, plain, and with Ferrous Fumarate 75 mg): `93007752`, `93027381`, `93025897`, `93006642`, `93005960`, `93002909`, `93014048`, `93011016`, `93011399`, `93021924`, `93016926`, `93011961`, `93011759`, `93007678`, `93001796`, `93017549` |
| `INJECTABLE_1_MONTH`       | `medroxyprogesterone` (farmasi)                                      | `92001726`, `92000984`, `92002400`, `92002415` | Medroxyprogesterone Acetate + Estradiol Cypionate injections (25/5, 50/10, 60/7,5, 120/10): `93005976`, `93018607`, `93013658`, `93013661`, `93018609`, `93006022`, `93018602`, `93006071`                                                                                                                                    |
| `INJECTABLE_3_MONTH`       | `medroxyprogesterone` (farmasi)                                      | `92001008`, `92001009`                         | Medroxyprogesterone Acetate 150 mg/mL and 150 mg/3 mL Suspensi Injeksi: `93025649`, `93024568`, `93005904`, `93005903`, `93004982`, `93022234`, `93022237`, `93022236`, `93022235`, `93014786`                                                                                                                                |
| `MALE_CONDOM`              | `kondom`, `condom` (**alkes**)                                       | `82000343`, `82000344`                         | Latex condom: `83063766`, `83063680`, `83063666`, `83009092`, `83012785`, `83022833`, `83022836`, `83022830`, `83007217`, `83026729`, `83061420`, `83066143`; Non-latex condom: `83066109`. The female condom (`83063797`) and condom lubricants left out                                                                     |

Nothing was left empty. A search can page past what was captured (for example `total: 39` for
phytomenadione against 25 rows read). Products outside the lists above still match through their
template code, which is the reason the template branch exists.

**Excluded on purpose:**

- Retired products (`active: false`), e.g. oxytocin `93001384` and `93004404`, and Hep B `93005477`,
  `93011776` and `93015676`.
- `92002313` ("Medroxyprogesterone Acetate 50 mg / mL … (tidak dipakai)"), whose products are all
  inactive.
- No tetracycline or erythromycin **eye** ointment exists in KFA (the searches returned capsules and
  gentamicin eye ointment only). The item keeps `erythromycin` / `tetracycline`-family keywords so a
  clinic row named that way is still _suggested_.

## 4. Regulation basis

From the text of Permenkes 28/2017:

- **Pasal 19 ayat (3)**: huruf e, tablet tambah darah pada ibu hamil; huruf f, vitamin A dosis
  tinggi pada ibu nifas; huruf h, uterotonika pada manajemen aktif kala tiga dan postpartum.
- **Pasal 20 ayat (3)**, pelayanan neonatal esensial: includes pemberian vitamin K1 and imunisasi
  (HB0). **The pasal does not name an eye ointment.** Neonatal eye prophylaxis is cited under the
  same pasal as part of essential neonatal care, as the addendum does. **The product owner should
  confirm this citation.**
- **Pasal 21** has no ayat. Huruf b covers pelayanan kontrasepsi oral, kondom, dan suntikan. The seed
  cites `Pasal 21 huruf b`.

## 5. Pending: HB0 code and the Immunization terminology

The P24-T01 spike (`klinik-bidan-sandbox-spike.md`) found that the Immunization validator refuses
some real KFA vaccine codes (`93026440`, RuleNumber 10103) and accepts others (`93023055`). A KFA
lookup cannot tell them apart: both BCG products answer the same `cvx_info`.

The seed lists the thirteen active Hep B products above, with Bio Farma `93023161` first. **None of
them has been posted as an Immunization.** Until someone does, a clinic that flags one of them for
its midwife may still see an HB0 Immunization refused with rule 10103. Next step: POST one full-set
Immunization per candidate code against a sandbox patient and encounter, as in the P24-T01 spike,
and drop any code the validator refuses.
