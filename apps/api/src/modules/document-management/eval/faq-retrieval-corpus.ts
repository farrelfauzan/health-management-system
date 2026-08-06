import { FaqEvalDocument } from './faq-retrieval-eval.types';

/**
 * The corpus the eval questions are graded against.
 *
 * **This is a stand-in for the clinic's real FAQ, and it is checked in so the
 * baseline is reproducible.** `PCS-T04` asks for a golden set built from the
 * clinic's own documents; until those exist, grading against documents nobody
 * has written would produce a number with nothing behind it. These ten are
 * modelled on what an Indonesian primary clinic actually publishes — opening
 * hours, BPJS referral rules, what to bring, how to cancel — so the shape,
 * length, and vocabulary of the passages match what the real corpus will
 * contain. **Replacing this array with the clinic's real documents is the
 * intended next step**, and the eval set's `expectedDocumentSlug` values are
 * the only thing that has to move with it.
 *
 * Three properties the corpus is deliberately built for:
 *
 * 1. **Both languages, on distinct topics.** Not translations of each other —
 *    a corpus of parallel pairs would let a cross-lingual question succeed by
 *    matching its own language's copy, which measures nothing.
 * 2. **Two near-neighbour pairs.** Referral validity against referral
 *    renewal, and vaccination hours against general opening hours. Semantic
 *    similarity will happily return the neighbour, which is what
 *    `precisionAtOne` exists to catch.
 * 3. **One staff-only document.** `sop-eskalasi` carries `DOCTOR` visibility
 *    and answers a question no patient may have answered. It is the corpus's
 *    half of the leak metric: without a staff-only document in the table, a
 *    zero leak rate proves only that nothing was there to leak.
 */
export const FAQ_RETRIEVAL_EVAL_CORPUS: readonly FaqEvalDocument[] = [
  {
    slug: 'jam-operasional',
    title: 'Jam Operasional Klinik',
    language: 'ID',
    visibility: 'BOTH',
    body: [
      '# Jam Operasional Klinik',
      '',
      'Klinik buka Senin sampai Jumat pukul 08.00 hingga 20.00 WIB.',
      'Pada hari Sabtu klinik buka pukul 08.00 hingga 14.00 WIB.',
      'Hari Minggu dan hari libur nasional klinik tutup.',
      'Loket pendaftaran ditutup satu jam sebelum klinik tutup.',
    ].join('\n'),
  },
  {
    slug: 'jadwal-imunisasi',
    title: 'Jadwal Layanan Imunisasi Anak',
    language: 'ID',
    visibility: 'BOTH',
    body: [
      '# Jadwal Layanan Imunisasi Anak',
      '',
      'Layanan imunisasi anak hanya dibuka setiap hari Selasa dan Kamis pukul 09.00 sampai 12.00 WIB.',
      'Orang tua wajib membawa buku KIA agar riwayat imunisasi tercatat.',
      'Imunisasi tidak dilayani di luar jadwal tersebut meskipun klinik sedang buka.',
    ].join('\n'),
  },
  {
    slug: 'syarat-bpjs',
    title: 'Syarat Berobat dengan BPJS',
    language: 'ID',
    visibility: 'BOTH',
    body: [
      '# Syarat Berobat dengan BPJS',
      '',
      'Pasien BPJS wajib membawa kartu BPJS atau KIS yang masih aktif dan KTP asli.',
      'Klinik harus terdaftar sebagai fasilitas kesehatan tingkat pertama pada kartu tersebut.',
      'Iuran yang menunggak membuat kepesertaan nonaktif dan pelayanan dihitung sebagai pasien umum.',
    ].join('\n'),
  },
  {
    slug: 'masa-berlaku-rujukan',
    title: 'Masa Berlaku Surat Rujukan',
    language: 'ID',
    visibility: 'BOTH',
    body: [
      '# Masa Berlaku Surat Rujukan',
      '',
      'Surat rujukan BPJS berlaku selama 90 hari sejak tanggal diterbitkan.',
      'Dalam masa itu pasien dapat berobat ke rumah sakit rujukan tanpa membuat surat baru.',
      'Rujukan yang sudah lewat 90 hari tidak dapat dipakai lagi.',
    ].join('\n'),
  },
  {
    slug: 'perpanjangan-rujukan',
    title: 'Cara Memperpanjang Surat Rujukan',
    language: 'ID',
    visibility: 'BOTH',
    body: [
      '# Cara Memperpanjang Surat Rujukan',
      '',
      'Perpanjangan rujukan diajukan di loket dengan membawa rujukan lama dan surat kontrol dari dokter spesialis.',
      'Pasien tidak perlu konsultasi ulang dengan dokter umum jika surat kontrol masih ada.',
      'Proses perpanjangan memakan waktu sekitar 15 menit pada jam kerja loket.',
    ].join('\n'),
  },
  {
    slug: 'biaya-pasien-umum',
    title: 'Biaya Konsultasi Pasien Umum',
    language: 'ID',
    visibility: 'PATIENT',
    body: [
      '# Biaya Konsultasi Pasien Umum',
      '',
      'Konsultasi dokter umum untuk pasien tanpa BPJS dikenakan biaya Rp 75.000 per kunjungan.',
      'Biaya tersebut belum termasuk obat dan tindakan.',
      'Pembayaran dapat dilakukan tunai, kartu debit, atau QRIS di kasir.',
    ].join('\n'),
  },
  {
    slug: 'appointment-cancellation',
    title: 'Appointment Cancellation and Rescheduling',
    language: 'EN',
    visibility: 'BOTH',
    body: [
      '# Appointment Cancellation and Rescheduling',
      '',
      'Patients may cancel or move a confirmed appointment free of charge up to 24 hours before the scheduled session.',
      'Cancelling later than that counts as a missed visit, and three missed visits in six months suspend online booking for the account.',
      'To cancel, call the clinic front desk or reply to the confirmation message.',
    ].join('\n'),
  },
  {
    slug: 'lab-preparation',
    title: 'Preparing for a Blood Test',
    language: 'EN',
    visibility: 'BOTH',
    body: [
      '# Preparing for a Blood Test',
      '',
      'Fasting blood tests require eight to ten hours without food; plain water is allowed and encouraged.',
      'Come between 07.00 and 09.00, when the laboratory processes fasting samples.',
      'Bring the doctor request form. Results are ready the next working day and can be collected at the front desk.',
    ].join('\n'),
  },
  {
    slug: 'medical-certificate',
    title: 'Requesting a Medical Certificate',
    language: 'EN',
    visibility: 'BOTH',
    body: [
      '# Requesting a Medical Certificate',
      '',
      'A sick-leave certificate is issued only by the doctor who examined the patient, on the day of the visit.',
      'The clinic cannot issue a certificate for a date on which the patient was not seen.',
      'Replacement copies of a lost certificate are available at the front desk within thirty days for a small administrative fee.',
    ].join('\n'),
  },
  {
    slug: 'sop-eskalasi',
    title: 'SOP Eskalasi Keluhan Pasien',
    language: 'ID',
    // The corpus's half of the leak metric. A zero leak rate against a table
    // with no staff-only document proves only that nothing was there to leak.
    visibility: 'DOCTOR',
    body: [
      '# SOP Eskalasi Keluhan Pasien',
      '',
      'Keluhan pasien yang tidak selesai di loket dieskalasi ke supervisor klinik dalam 30 menit.',
      'Supervisor mencatat keluhan pada log internal dan menghubungi pasien maksimal 1x24 jam.',
      'Keluhan yang menyangkut dugaan malpraktik langsung diteruskan ke kepala klinik dan tidak dibahas dengan pasien melalui kanal pesan.',
    ].join('\n'),
  },
];
