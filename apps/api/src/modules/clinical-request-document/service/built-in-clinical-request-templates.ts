import { TemplateSettingsValue, resolveDefaultTemplateSettings } from '@hms/shared-types';

/**
 * The layouts used when a clinic has published no template of their own
 * (`P18-T12`) — the same reasoning as `BUILT_IN_INVOICE_TEMPLATE`: CI and fresh
 * deployments run migrations without seeding, and a doctor must be able to hand
 * a patient a surat pengantar before anyone has opened the template editor.
 *
 * Both are written in the canonical token grammar the sanitiser produces
 * (`<span data-hms-var="…"></span>`), so the fill step treats them exactly like
 * a clinic-authored template and every token is registry-backed.
 */
const LETTERHEAD = [
  '<table width="100%" style="border-collapse:collapse;margin-bottom:5mm"><tbody><tr>',
  '<td style="width:70%;vertical-align:top">',
  '<h2 style="margin:0 0 2mm 0"><span data-hms-var="clinic.name"></span></h2>',
  '<p style="margin:0;font-size:10pt"><span data-hms-var="clinic.address"></span></p>',
  '<p style="margin:0;font-size:10pt">Telp. <span data-hms-var="clinic.phone"></span></p>',
  '<p style="margin:0;font-size:9pt">Izin: <span data-hms-var="clinic.licenseNumber"></span></p>',
  '</td>',
  '<td style="width:30%;vertical-align:top;text-align:right"><span data-hms-var="clinic.logo"></span></td>',
  '</tr></tbody></table>',
  '<hr style="border-style:solid;border-width:1px;border-color:#333">',
].join('');

const PATIENT_BLOCK = [
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-bottom:4mm"><tbody>',
  '<tr><td style="width:18%">Nama</td><td style="width:46%">: <span data-hms-var="patient.fullName"></span></td>',
  '<td style="width:14%">No. RM</td><td style="width:22%">: <span data-hms-var="patient.mrn"></span></td></tr>',
  '<tr><td>Tgl. lahir</td><td>: <span data-hms-var="patient.dateOfBirth"></span> (<span data-hms-var="patient.age"></span>)</td>',
  '<td>Kelamin</td><td>: <span data-hms-var="patient.sex"></span></td></tr>',
  '</tbody></table>',
].join('');

// The signature block a request is issued under. The role ("Dokter
// pemeriksa" / "Bidan pemeriksa") and the licence — SIP, SIPB, or the STR when
// no practice licence is in force (D-032) — are printed from the clinician's
// own profile rather than typed into the layout, so a midwife's letter says
// she signed it and a renewed licence reaches every future letter unedited.
const SIGNATURE_BLOCK = [
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-top:10mm"><tbody><tr>',
  '<td style="width:60%"></td>',
  '<td style="width:40%;text-align:center">',
  '<p style="margin:0"><span data-hms-var="doctor.signatureRole"></span>,</p>',
  '<div style="height:18mm"></div>',
  '<p style="margin:0;font-weight:bold"><span data-hms-var="doctor.fullName"></span></p>',
  '<p style="margin:0;font-size:9pt"><span data-hms-var="doctor.licenseLabel"></span>: <span data-hms-var="doctor.licenseNumber"></span></p>',
  '</td></tr></tbody></table>',
].join('');

const LAB_REQUEST_CONTENT_HTML = [
  LETTERHEAD,
  '<h3 style="text-align:center;margin:4mm 0">SURAT PENGANTAR PEMERIKSAAN LABORATORIUM</h3>',
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-bottom:3mm"><tbody><tr>',
  '<td style="width:70%;vertical-align:top">',
  '<p style="margin:0">Nomor: <strong><span data-hms-var="order.number"></span></strong></p>',
  '<p style="margin:0">Tanggal: <span data-hms-var="request.issuedAt"></span></p>',
  '<p style="margin:0">Kepada: <span data-hms-var="order.destination"></span></p>',
  '</td>',
  '<td style="width:30%;text-align:right;vertical-align:top"><span data-hms-var="order.barcode"></span></td>',
  '</tr></tbody></table>',
  PATIENT_BLOCK,
  '<p style="font-size:10pt;margin:0 0 1mm 0">Mohon dilakukan pemeriksaan berikut:</p>',
  '<div data-hms-var="tests"></div>',
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-top:3mm"><tbody>',
  '<tr><td style="width:18%">Puasa</td><td>: <span data-hms-var="order.isFasting"></span></td></tr>',
  '<tr><td>Prioritas</td><td>: <span data-hms-var="order.priority"></span></td></tr>',
  '<tr><td>Keterangan</td><td>: <span data-hms-var="order.clinicalNotes"></span></td></tr>',
  '</tbody></table>',
  SIGNATURE_BLOCK,
].join('');

const PRESCRIPTION_CONTENT_HTML = [
  LETTERHEAD,
  '<h3 style="text-align:center;margin:4mm 0">RESEP</h3>',
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-bottom:3mm"><tbody>',
  '<tr><td style="width:18%">Tanggal</td><td>: <span data-hms-var="request.issuedAt"></span></td></tr>',
  '<tr><td>Kepada</td><td>: <span data-hms-var="prescription.destination"></span></td></tr>',
  '</tbody></table>',
  PATIENT_BLOCK,
  '<p style="font-size:14pt;font-weight:bold;margin:0 0 1mm 0">R/</p>',
  '<div data-hms-var="medications"></div>',
  '<p style="font-size:10pt;margin:3mm 0 0 0">Catatan: <span data-hms-var="prescription.notes"></span></p>',
  SIGNATURE_BLOCK,
].join('');

// The pregnancy block both maternal letters open with. Written in the same
// canonical token grammar as the rest of this file, so a clinic that later
// opens the editor gets a layout the sanitiser already agrees with.
const PREGNANCY_BLOCK = [
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-bottom:4mm"><tbody>',
  '<tr><td style="width:18%">NIK</td><td style="width:46%">: <span data-hms-var="patient.nikMasked"></span></td>',
  '<td style="width:14%">GPA</td><td style="width:22%">: <span data-hms-var="pregnancy.gpa"></span></td></tr>',
  '<tr><td>Alamat</td><td>: <span data-hms-var="patient.address"></span></td>',
  '<td>HPHT</td><td>: <span data-hms-var="pregnancy.lastMenstrualPeriodDate"></span></td></tr>',
  '<tr><td>Usia kehamilan</td><td>: <span data-hms-var="pregnancy.gestationalAge"></span></td>',
  '<td>HPL</td><td>: <span data-hms-var="pregnancy.estimatedDeliveryDate"></span></td></tr>',
  '</tbody></table>',
].join('');

const REFERRAL_LETTER_CONTENT_HTML = [
  LETTERHEAD,
  '<h3 style="text-align:center;margin:4mm 0">SURAT RUJUKAN</h3>',
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-bottom:3mm"><tbody>',
  '<tr><td style="width:18%">Tanggal</td><td>: <span data-hms-var="request.issuedAt"></span></td></tr>',
  '<tr><td>Kepada Yth.</td><td>: <span data-hms-var="referral.destination"></span></td></tr>',
  '</tbody></table>',
  PATIENT_BLOCK,
  PREGNANCY_BLOCK,
  '<p style="font-size:10pt;margin:0 0 1mm 0">Dengan hormat, mohon penanganan lebih lanjut atas pasien tersebut dengan hasil pemeriksaan berikut:</p>',
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-bottom:3mm"><tbody>',
  '<tr><td style="width:18%">Hasil</td><td>: <span data-hms-var="referral.findings"></span></td></tr>',
  '<tr><td>Alasan</td><td>: <span data-hms-var="referral.triggeredRules"></span></td></tr>',
  '<tr><td>Catatan</td><td>: <span data-hms-var="referral.notes"></span></td></tr>',
  '</tbody></table>',
  SIGNATURE_BLOCK,
].join('');

const PREGNANCY_CERTIFICATE_CONTENT_HTML = [
  LETTERHEAD,
  '<h3 style="text-align:center;margin:4mm 0">SURAT KETERANGAN HAMIL</h3>',
  '<p style="font-size:10pt;margin:0 0 2mm 0">Yang bertanda tangan di bawah ini menerangkan bahwa:</p>',
  PATIENT_BLOCK,
  PREGNANCY_BLOCK,
  '<p style="font-size:10pt;margin:2mm 0 0 0">adalah benar dalam keadaan hamil menurut pemeriksaan pada tanggal <span data-hms-var="request.issuedAt"></span>.</p>',
  '<p style="font-size:10pt;margin:2mm 0 0 0">Surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya.</p>',
  SIGNATURE_BLOCK,
].join('');

/**
 * The surat keterangan lahir (P25-T09, FR-INC-05).
 *
 * Signed by the attendant of *this birth*, not by the doctor who happens to be
 * issuing the document: the person who catches the baby is the person whose
 * STR belongs on it. That is why it carries its own signature block instead of
 * the shared one, which names the issuing clinician's practice licence.
 */
const BIRTH_CERTIFICATE_CONTENT_HTML = [
  LETTERHEAD,
  '<h3 style="text-align:center;margin:4mm 0">SURAT KETERANGAN LAHIR</h3>',
  '<p style="font-size:10pt;margin:0 0 2mm 0">Yang bertanda tangan di bawah ini menerangkan bahwa telah lahir seorang bayi:</p>',
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-bottom:3mm"><tbody>',
  '<tr><td style="width:28%">Nama bayi</td><td>: <span data-hms-var="baby.fullName"></span></td></tr>',
  '<tr><td>Jenis kelamin</td><td>: <span data-hms-var="baby.sex"></span></td></tr>',
  '<tr><td>Hari/tanggal lahir</td><td>: <span data-hms-var="baby.birthDate"></span></td></tr>',
  '<tr><td>Pukul</td><td>: <span data-hms-var="baby.birthTime"></span> WIB</td></tr>',
  '<tr><td>Berat lahir</td><td>: <span data-hms-var="baby.birthWeight"></span></td></tr>',
  '<tr><td>Panjang badan</td><td>: <span data-hms-var="baby.birthLength"></span></td></tr>',
  '<tr><td>Anak ke-</td><td>: <span data-hms-var="baby.birthOrder"></span></td></tr>',
  '</tbody></table>',
  '<p style="font-size:10pt;margin:0 0 2mm 0">dari seorang ibu:</p>',
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-bottom:3mm"><tbody>',
  '<tr><td style="width:28%">Nama ibu</td><td>: <span data-hms-var="mother.fullName"></span></td></tr>',
  '<tr><td>NIK</td><td>: <span data-hms-var="mother.nikMasked"></span></td></tr>',
  '<tr><td>Tempat kelahiran</td><td>: <span data-hms-var="birth.place"></span></td></tr>',
  '</tbody></table>',
  '<p style="font-size:10pt;margin:2mm 0 0 0">Surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya.</p>',
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-top:10mm"><tbody><tr>',
  '<td style="width:60%"></td>',
  '<td style="width:40%;text-align:center">',
  '<p style="margin:0">Penolong persalinan,</p>',
  '<div style="height:18mm"></div>',
  '<p style="margin:0;font-weight:bold"><span data-hms-var="attendant.fullName"></span></p>',
  '<p style="margin:0;font-size:9pt">STR: <span data-hms-var="attendant.strNumber"></span></p>',
  '</td></tr></tbody></table>',
].join('');

export const BUILT_IN_CLINICAL_REQUEST_TEMPLATES: Readonly<
  Record<
    | 'LAB_REQUEST'
    | 'PRESCRIPTION'
    | 'REFERRAL_LETTER'
    | 'PREGNANCY_CERTIFICATE'
    | 'BIRTH_CERTIFICATE',
    { contentHtml: string; settings: TemplateSettingsValue }
  >
> = {
  LAB_REQUEST: {
    contentHtml: LAB_REQUEST_CONTENT_HTML,
    settings: resolveDefaultTemplateSettings(),
  },
  PRESCRIPTION: {
    contentHtml: PRESCRIPTION_CONTENT_HTML,
    settings: resolveDefaultTemplateSettings(),
  },
  REFERRAL_LETTER: {
    contentHtml: REFERRAL_LETTER_CONTENT_HTML,
    settings: resolveDefaultTemplateSettings(),
  },
  PREGNANCY_CERTIFICATE: {
    contentHtml: PREGNANCY_CERTIFICATE_CONTENT_HTML,
    settings: resolveDefaultTemplateSettings(),
  },
  BIRTH_CERTIFICATE: {
    contentHtml: BIRTH_CERTIFICATE_CONTENT_HTML,
    settings: resolveDefaultTemplateSettings(),
  },
};
