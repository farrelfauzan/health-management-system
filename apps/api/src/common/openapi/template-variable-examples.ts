/**
 * Canonical examples for the template-variable palette (`P16-T04`), mirrored
 * by `ApiEndpoint` into the OpenAPI document. Three entries rather than the
 * whole registry: the shape is what an integrator needs, and a 37-row example
 * makes the document harder to read, not more accurate.
 */
export const TEMPLATE_VARIABLE_EXAMPLES = {
  invoiceVariables: [
    {
      token: 'clinic.name',
      labelId: 'Nama klinik',
      labelEn: 'Clinic name',
      type: 'text',
      sample: 'Klinik Sehat Bersama',
    },
    {
      token: 'invoice.totalInWords',
      labelId: 'Terbilang',
      labelEn: 'Total in words',
      type: 'text',
      sample: 'dua ratus tujuh puluh lima ribu rupiah',
    },
    {
      token: 'items',
      labelId: 'Rincian tagihan',
      labelEn: 'Line items',
      type: 'block',
      sample: '4 baris',
    },
  ],
} as const;
