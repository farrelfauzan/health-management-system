/**
 * Examples for the bug-report intake endpoint (P23-T08).
 *
 * Every value here is synthetic. The request example in particular is the one
 * a reader is most likely to copy, so it models a report written the way the
 * dialog asks for: a screen and a symptom, and not a patient.
 *
 * No key is ever set to `undefined` — the schema inferrer turns that into
 * `type: undefined`, which no OpenAPI parser accepts and which silently breaks
 * the generated client. Optional keys are omitted instead.
 */
export const BUG_REPORT_EXAMPLES = {
  createRequest: {
    title: 'Tombol simpan tidak berfungsi di halaman pasien',
    description:
      'Saya mengisi formulir pasien baru lalu menekan Simpan, dan tidak terjadi apa-apa. Tidak ada pesan kesalahan.',
    stepsToReproduce: 'Buka halaman pasien, tekan Tambah, isi formulir, tekan Simpan.',
    expected: 'Pasien tersimpan dan saya kembali ke daftar.',
    actual: 'Halaman diam, formulir tetap terisi.',
    pagePath: '/admin/patients',
    requestIds: ['3f1a9c7e-2b4d-4f8a-9c1e-7d5b8a2f6e04'],
    appVersion: '1.42.0',
    acknowledgedNoSensitiveData: true,
  },
  submission: {
    reference: 'BR-000123',
    status: 'RECEIVED',
  },
} as const;
