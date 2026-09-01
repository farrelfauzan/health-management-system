/**
 * The token registry a document template is authored against (`P16-T04`).
 *
 * It is a typed const rather than a database table on purpose. Every token
 * here has a resolver branch behind it, so a token that exists is a token
 * something can fill — and adding one is a code change reviewed alongside the
 * resolver that makes it real, not a row somebody inserted. The editor
 * (`P16-T11`) renders this list as its variable palette; publish-time
 * validation (`P16-T12`) rejects a template referencing anything outside it.
 *
 * Labels are carried in both languages rather than looked up by key because
 * the palette is the one surface where a translator needs to see the token
 * and its label together.
 */
export const TEMPLATE_VARIABLE_TYPES = [
  'text',
  'date',
  'money',
  'number',
  'enum',
  'image',
  'block',
] as const;

export type TemplateVariableType = (typeof TEMPLATE_VARIABLE_TYPES)[number];

export type TemplateVariable = {
  readonly token: string;
  readonly labelId: string;
  readonly labelEn: string;
  readonly type: TemplateVariableType;
  /**
   * What the token looks like filled in. Shown in the palette and used as the
   * fixture for `P16-T12`'s hostile-data preview, so it must be a realistic
   * value rather than a placeholder like `<name>`.
   */
  readonly sample: string;
};

/**
 * Which document a registry belongs to. Only invoices exist today; clinical
 * documents (`E2`) and agreements (`E5`) get their own sets, which is why the
 * route takes a kind rather than answering with one global list.
 */
export const TEMPLATE_VARIABLE_KINDS = ['INVOICE'] as const;

export type TemplateVariableKind = (typeof TEMPLATE_VARIABLE_KINDS)[number];

/**
 * The columns available inside the `items` repeating block. They are ordinary
 * registry entries rather than a nested structure so the palette, the
 * publish-time validator, and this type stay flat — `P16-T11` decides which
 * of them a template's table actually renders.
 */
export const INVOICE_ITEM_ROW_VARIABLES: readonly TemplateVariable[] = [
  {
    token: 'item.no',
    labelId: 'Nomor baris',
    labelEn: 'Row number',
    type: 'number',
    sample: '1',
  },
  {
    token: 'item.description',
    labelId: 'Uraian',
    labelEn: 'Description',
    type: 'text',
    sample: 'Konsultasi Dokter Umum',
  },
  {
    token: 'item.quantity',
    labelId: 'Jumlah',
    labelEn: 'Quantity',
    type: 'number',
    sample: '1',
  },
  {
    token: 'item.unitPrice',
    labelId: 'Harga satuan',
    labelEn: 'Unit price',
    type: 'money',
    sample: 'Rp 50.000',
  },
  {
    token: 'item.amount',
    labelId: 'Jumlah harga',
    labelEn: 'Amount',
    type: 'money',
    sample: 'Rp 50.000',
  },
];

/**
 * Every token an invoice template may reference.
 *
 * **`patient.nikMasked` is the only identifier token, and there is no
 * plaintext counterpart anywhere in this list.** The NIK is encrypted at rest
 * and gated behind `patient.read-identifier`; putting it on a receipt the
 * patient carries out of the building must not be a layout choice available
 * in a WYSIWYG editor. The resolver never emits the plaintext either — it
 * masks and forgets.
 */
export const INVOICE_TEMPLATE_VARIABLES: readonly TemplateVariable[] = [
  {
    token: 'clinic.name',
    labelId: 'Nama klinik',
    labelEn: 'Clinic name',
    type: 'text',
    sample: 'Klinik Sehat Bersama',
  },
  {
    token: 'clinic.legalName',
    labelId: 'Nama badan hukum',
    labelEn: 'Legal entity name',
    type: 'text',
    sample: 'PT Sehat Bersama Indonesia',
  },
  {
    token: 'clinic.address',
    labelId: 'Alamat klinik',
    labelEn: 'Clinic address',
    type: 'text',
    sample: 'Jl. Merdeka No. 12, Bandung',
  },
  {
    token: 'clinic.phone',
    labelId: 'Telepon klinik',
    labelEn: 'Clinic phone',
    type: 'text',
    sample: '(022) 1234567',
  },
  {
    token: 'clinic.email',
    labelId: 'Email klinik',
    labelEn: 'Clinic email',
    type: 'text',
    sample: 'halo@kliniksehat.id',
  },
  {
    token: 'clinic.licenseNumber',
    labelId: 'Nomor izin operasional',
    labelEn: 'Operating licence number',
    type: 'text',
    sample: '440/1234/DPMPTSP',
  },
  {
    token: 'clinic.taxId',
    labelId: 'NPWP klinik',
    labelEn: 'Clinic tax ID',
    type: 'text',
    sample: '01.234.567.8-901.000',
  },
  {
    token: 'clinic.logo',
    labelId: 'Logo klinik',
    labelEn: 'Clinic logo',
    type: 'image',
    sample: 'data:image/png;base64,…',
  },
  {
    token: 'invoice.number',
    labelId: 'Nomor faktur',
    labelEn: 'Invoice number',
    type: 'text',
    sample: 'INV-20260830-0007',
  },
  {
    token: 'invoice.issuedAt',
    labelId: 'Tanggal terbit',
    labelEn: 'Issued on',
    type: 'date',
    sample: '30 Agustus 2026',
  },
  {
    token: 'invoice.status',
    labelId: 'Status faktur',
    labelEn: 'Invoice status',
    type: 'enum',
    sample: 'PAID',
  },
  {
    token: 'invoice.total',
    labelId: 'Total',
    labelEn: 'Total',
    type: 'money',
    sample: 'Rp 275.000',
  },
  {
    token: 'invoice.totalInWords',
    labelId: 'Terbilang',
    labelEn: 'Total in words',
    type: 'text',
    sample: 'dua ratus tujuh puluh lima ribu rupiah',
  },
  {
    token: 'invoice.itemCount',
    labelId: 'Jumlah baris',
    labelEn: 'Item count',
    type: 'number',
    sample: '4',
  },
  {
    token: 'invoice.qrVerify',
    labelId: 'QR verifikasi',
    labelEn: 'Verification QR',
    type: 'image',
    sample: 'data:image/png;base64,…',
  },
  {
    token: 'patient.fullName',
    labelId: 'Nama pasien',
    labelEn: 'Patient name',
    type: 'text',
    sample: 'Siti Rahmawati',
  },
  {
    token: 'patient.mrn',
    labelId: 'Nomor rekam medis',
    labelEn: 'Medical record number',
    type: 'text',
    sample: 'RM-000142',
  },
  {
    token: 'patient.dateOfBirth',
    labelId: 'Tanggal lahir',
    labelEn: 'Date of birth',
    type: 'date',
    sample: '4 Februari 1988',
  },
  {
    token: 'patient.sex',
    labelId: 'Jenis kelamin',
    labelEn: 'Sex',
    type: 'enum',
    sample: 'Perempuan',
  },
  {
    token: 'patient.address',
    labelId: 'Alamat pasien',
    labelEn: 'Patient address',
    type: 'text',
    sample: 'Jl. Kenanga No. 3',
  },
  {
    token: 'patient.phone',
    labelId: 'Telepon pasien',
    labelEn: 'Patient phone',
    type: 'text',
    sample: '0812xxxxxx',
  },
  {
    token: 'patient.nikMasked',
    labelId: 'NIK (tersamar)',
    labelEn: 'NIK (masked)',
    type: 'text',
    sample: '••••••••••••3271',
  },
  {
    token: 'encounter.date',
    labelId: 'Tanggal kunjungan',
    labelEn: 'Encounter date',
    type: 'date',
    sample: '30 Agustus 2026',
  },
  {
    token: 'encounter.doctorName',
    labelId: 'Nama dokter',
    labelEn: 'Doctor name',
    type: 'text',
    sample: 'dr. Andi Prasetyo, Sp.PD',
  },
  {
    token: 'encounter.specialty',
    labelId: 'Spesialisasi',
    labelEn: 'Specialty',
    type: 'text',
    sample: 'Penyakit Dalam',
  },
  {
    token: 'admission.roomLabel',
    labelId: 'Kamar',
    labelEn: 'Room',
    type: 'text',
    sample: 'Melati 2A',
  },
  {
    token: 'admission.nights',
    labelId: 'Jumlah malam',
    labelEn: 'Nights',
    type: 'number',
    sample: '3',
  },
  {
    token: 'payment.method',
    labelId: 'Metode pembayaran',
    labelEn: 'Payment method',
    type: 'enum',
    sample: 'QRIS',
  },
  {
    token: 'payment.paidAt',
    labelId: 'Waktu pembayaran',
    labelEn: 'Paid at',
    type: 'date',
    sample: '30 Agustus 2026, 14:22',
  },
  {
    token: 'payment.reference',
    labelId: 'Referensi pembayaran',
    labelEn: 'Payment reference',
    type: 'text',
    sample: 'QR-88213771',
  },
  {
    token: 'payment.cashierName',
    labelId: 'Kasir',
    labelEn: 'Cashier',
    type: 'text',
    sample: 'Rina Kartika',
  },
  {
    token: 'items',
    labelId: 'Rincian tagihan',
    labelEn: 'Line items',
    type: 'block',
    sample: '4 baris',
  },
  ...INVOICE_ITEM_ROW_VARIABLES,
];

export const TEMPLATE_VARIABLES_BY_KIND: Readonly<
  Record<TemplateVariableKind, readonly TemplateVariable[]>
> = {
  INVOICE: INVOICE_TEMPLATE_VARIABLES,
};
