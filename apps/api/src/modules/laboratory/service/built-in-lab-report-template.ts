import { TemplateSettingsValue, resolveDefaultTemplateSettings } from '@hms/shared-types';

/**
 * The hasil laboratorium a clinic prints before anyone has opened the template
 * editor (P18-T05) — the same reasoning as the built-in invoice and the two
 * printed requests: CI and a fresh deployment run migrations without seeding,
 * and a released order must produce its sheet on day one.
 *
 * Written in the canonical token grammar the sanitiser produces
 * (`<span data-hms-var="…"></span>`), so a clinic-published `LAB_REPORT`
 * template and this one go through the same fill step and every token is
 * registry-backed. The letterhead and patient block are the ones the surat
 * pengantar prints, repeated here rather than imported: a template is a
 * string a clinic may copy into the editor and restyle, and a string built
 * from another module's constants is not that.
 *
 * What is deliberately on it: the amendment notice, at the top and in a box,
 * because a corrected report that looks like the original is the failure
 * this whole ticket exists to prevent; and the verifier's note (P18-T14)
 * under the results, because a table of numbers is not a result. What is deliberately not: any
 * identifier beyond the MRN. The sheet travels on WhatsApp.
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

const AMENDMENT_NOTICE = [
  '<p class="hms-amendment-notice" style="margin:0 0 3mm 0;font-weight:bold;text-align:center">',
  '<span data-hms-var="report.amendmentNotice"></span>',
  '</p>',
].join('');

const PATIENT_BLOCK = [
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-bottom:3mm"><tbody>',
  '<tr><td style="width:18%">Nama</td><td style="width:46%">: <span data-hms-var="patient.fullName"></span></td>',
  '<td style="width:14%">No. RM</td><td style="width:22%">: <span data-hms-var="patient.mrn"></span></td></tr>',
  '<tr><td>Tgl. lahir</td><td>: <span data-hms-var="patient.dateOfBirth"></span> (<span data-hms-var="patient.age"></span>)</td>',
  '<td>Kelamin</td><td>: <span data-hms-var="patient.sex"></span></td></tr>',
  '</tbody></table>',
].join('');

const ORDER_BLOCK = [
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-bottom:3mm"><tbody>',
  '<tr><td style="width:18%">No. permintaan</td><td style="width:46%">: <strong><span data-hms-var="order.number"></span></strong></td>',
  '<td style="width:14%">Tgl. permintaan</td><td style="width:22%">: <span data-hms-var="order.orderedAt"></span></td></tr>',
  '<tr><td>Dokter pengirim</td><td>: <span data-hms-var="doctor.fullName"></span></td>',
  '<td>Spesimen</td><td>: <span data-hms-var="specimen.accessionNumbers"></span></td></tr>',
  '<tr><td>Diambil</td><td>: <span data-hms-var="specimen.collectedAt"></span></td>',
  '<td>Dirilis</td><td>: <span data-hms-var="report.releasedAt"></span></td></tr>',
  '</tbody></table>',
].join('');

/**
 * The verifier's sentence under the results (P18-T14). Wrapped in the class
 * the HTML builder drops when the token resolves empty, so a sheet with
 * nothing to say carries neither the heading nor a blank box.
 */
const NOTE_BLOCK = [
  '<div class="hms-report-note" style="margin-top:3mm;font-size:10pt">',
  '<p style="margin:0;font-weight:bold">Catatan</p>',
  '<p style="margin:0"><span data-hms-var="report.note"></span></p>',
  '</div>',
].join('');

const SIGNATURE_BLOCK = [
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-top:8mm"><tbody><tr>',
  '<td style="width:60%;vertical-align:top;font-size:9pt">',
  '<p style="margin:0">▲ di atas nilai rujukan &nbsp; ▼ di bawah nilai rujukan &nbsp; ▲▲ / ▼▼ nilai kritis &nbsp; * abnormal</p>',
  '</td>',
  '<td style="width:40%;text-align:center">',
  '<p style="margin:0">Diverifikasi oleh,</p>',
  '<div style="height:16mm"></div>',
  '<p style="margin:0;font-weight:bold"><span data-hms-var="report.verifierName"></span></p>',
  '<p style="margin:0;font-size:9pt"><span data-hms-var="report.releasedAt"></span></p>',
  '</td></tr></tbody></table>',
].join('');

const LAB_REPORT_CONTENT_HTML = [
  LETTERHEAD,
  '<h3 style="text-align:center;margin:4mm 0">HASIL PEMERIKSAAN LABORATORIUM</h3>',
  AMENDMENT_NOTICE,
  PATIENT_BLOCK,
  ORDER_BLOCK,
  '<div data-hms-var="results"></div>',
  NOTE_BLOCK,
  SIGNATURE_BLOCK,
].join('');

export const BUILT_IN_LAB_REPORT_TEMPLATE: {
  readonly contentHtml: string;
  readonly settings: TemplateSettingsValue;
} = {
  contentHtml: LAB_REPORT_CONTENT_HTML,
  settings: resolveDefaultTemplateSettings(),
};
