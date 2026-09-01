import { TemplateSettingsValue, resolveDefaultTemplateSettings } from '@hms/shared-types';

/**
 * The layout used when no published invoice template exists (`P16-T06`).
 *
 * It ships with the API rather than the seed because CI and fresh deployments
 * run migrations without seeding — a clinic must be able to print its first
 * receipt before an admin has ever opened the template editor. It is written
 * in the same canonical token grammar the sanitiser produces
 * (`<span data-hms-var="…"></span>`), so the fill step treats it exactly like
 * a clinic-authored template and every token here is registry-backed.
 */
const BUILT_IN_CONTENT_HTML = [
  '<table width="100%" style="border-collapse:collapse;margin-bottom:6mm"><tbody><tr>',
  '<td style="width:70%;vertical-align:top">',
  '<h2 style="margin:0 0 2mm 0"><span data-hms-var="clinic.name"></span></h2>',
  '<p style="margin:0;font-size:10pt"><span data-hms-var="clinic.address"></span></p>',
  '<p style="margin:0;font-size:10pt">Telp. <span data-hms-var="clinic.phone"></span> · <span data-hms-var="clinic.email"></span></p>',
  '<p style="margin:0;font-size:9pt">Izin: <span data-hms-var="clinic.licenseNumber"></span> · NPWP: <span data-hms-var="clinic.taxId"></span></p>',
  '</td>',
  '<td style="width:30%;vertical-align:top;text-align:right"><span data-hms-var="clinic.logo"></span></td>',
  '</tr></tbody></table>',
  '<hr style="border-style:solid;border-width:1px;border-color:#333">',
  '<h3 style="text-align:center;margin:4mm 0">KUITANSI / INVOICE</h3>',
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-bottom:4mm"><tbody>',
  '<tr><td style="width:18%">Nomor</td><td style="width:38%">: <span data-hms-var="invoice.number"></span></td>',
  '<td style="width:18%">Tanggal</td><td style="width:26%">: <span data-hms-var="invoice.issuedAt"></span></td></tr>',
  '<tr><td>Pasien</td><td>: <span data-hms-var="patient.fullName"></span></td>',
  '<td>No. RM</td><td>: <span data-hms-var="patient.mrn"></span></td></tr>',
  '<tr><td>Dokter</td><td>: <span data-hms-var="encounter.doctorName"></span></td>',
  '<td>Poli</td><td>: <span data-hms-var="encounter.specialty"></span></td></tr>',
  '</tbody></table>',
  '<div data-hms-var="items"></div>',
  '<table width="100%" style="border-collapse:collapse;font-size:11pt;margin-top:4mm"><tbody>',
  '<tr><td style="text-align:right;font-weight:bold;width:75%">TOTAL</td>',
  '<td style="text-align:right;font-weight:bold"><span data-hms-var="invoice.total"></span></td></tr>',
  '</tbody></table>',
  '<p style="font-size:9pt;font-style:italic;margin:2mm 0">Terbilang: <span data-hms-var="invoice.totalInWords"></span></p>',
  '<table width="100%" style="border-collapse:collapse;font-size:10pt;margin-top:4mm"><tbody>',
  '<tr><td style="width:18%">Pembayaran</td><td>: <span data-hms-var="payment.method"></span> · <span data-hms-var="payment.paidAt"></span> · Ref: <span data-hms-var="payment.reference"></span></td></tr>',
  '<tr><td>Kasir</td><td>: <span data-hms-var="payment.cashierName"></span></td></tr>',
  '</tbody></table>',
].join('');

export const BUILT_IN_INVOICE_TEMPLATE: {
  readonly contentHtml: string;
  readonly settings: TemplateSettingsValue;
} = {
  contentHtml: BUILT_IN_CONTENT_HTML,
  settings: resolveDefaultTemplateSettings(),
};
