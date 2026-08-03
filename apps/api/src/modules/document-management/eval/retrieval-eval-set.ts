import { RetrievalEvalCase, RetrievalEvalDocument } from './retrieval-eval.types';

/**
 * The fixture corpus, seeded before a run and removed after.
 *
 * Deliberately small and deliberately **paired**: for most topics there is an
 * Indonesian document and an English one covering *different* subject matter,
 * so a cross-lingual question has exactly one right answer and cannot be
 * satisfied by coincidence. Passages are written the way a clinic's real
 * documents read — procedural, specific, and using the terms staff actually
 * type.
 */
export const RETRIEVAL_EVAL_DOCUMENTS: readonly RetrievalEvalDocument[] = [
  {
    key: 'sop-pendaftaran',
    title: 'SOP Pendaftaran Pasien BPJS',
    language: 'ID',
    visibility: 'BOTH',
    content: [
      'Pendaftaran pasien BPJS dibuka pukul 07.00 dan ditutup pukul 11.00 setiap hari kerja.',
      'Pasien membawa kartu JKN-KIS dan surat rujukan yang masih berlaku.',
      'Rujukan BPJS berlaku selama 30 hari sejak tanggal terbit dan hanya untuk satu poli tujuan.',
      'Petugas memverifikasi kepesertaan melalui aplikasi PCare sebelum nomor antrean diterbitkan.',
    ].join(' '),
  },
  {
    key: 'sop-rujukan',
    title: 'SOP Rujukan ke FKRTL',
    language: 'ID',
    visibility: 'DOCTOR',
    content: [
      'Rujukan ke FKRTL diterbitkan bila kasus di luar kompetensi 155 diagnosis layanan primer.',
      'Dokter mencantumkan diagnosis kerja beserta kode ICD-10 pada formulir rujukan.',
      'Rujukan non-spesialistik yang tidak sesuai ketentuan berpotensi ditolak saat klaim.',
    ].join(' '),
  },
  {
    key: 'guideline-antibiotic',
    title: 'Community-Acquired Pneumonia Antibiotic Guideline',
    language: 'EN',
    visibility: 'DOCTOR',
    content: [
      'For previously healthy adults with uncomplicated community-acquired pneumonia, amoxicillin 500mg three times daily remains first line.',
      'Doxycycline is the preferred alternative where atypical coverage is required or beta-lactam allergy is documented.',
      'Reassess at 48 to 72 hours; failure to defervesce warrants review for resistant organisms or an alternative diagnosis.',
    ].join(' '),
  },
  {
    key: 'guideline-chest-pain',
    title: 'Chest Pain Triage in Primary Care',
    language: 'EN',
    visibility: 'DOCTOR',
    content: [
      'Any adult presenting with chest pain suggestive of acute coronary syndrome must be triaged immediately and not placed in the routine queue.',
      'Obtain a twelve-lead ECG within ten minutes of arrival and arrange emergency transfer where ST elevation is present.',
      'Atypical presentations are common in patients with diabetes and in older women.',
    ].join(' '),
  },
  {
    key: 'faq-jam-layanan',
    title: 'FAQ Jam Layanan Klinik',
    language: 'ID',
    visibility: 'PATIENT',
    content: [
      'Klinik buka pukul 08.00 sampai 20.00 pada hari Senin sampai Jumat.',
      'Pada hari Sabtu klinik melayani pukul 08.00 sampai 14.00, dan tutup pada hari Minggu serta hari libur nasional.',
      'Layanan gawat darurat di luar jam tersebut dirujuk ke IGD rumah sakit terdekat.',
    ].join(' '),
  },
  {
    key: 'sop-vaksinasi',
    title: 'Jadwal Vaksinasi dan Imunisasi',
    language: 'ID',
    visibility: 'BOTH',
    content: [
      'Imunisasi dasar lengkap untuk bayi diberikan sesuai jadwal Kemenkes pada usia 0, 1, 2, 3, 4, dan 9 bulan.',
      'Vaksinasi influenza untuk dewasa tersedia setiap hari Rabu tanpa perlu perjanjian.',
      'Vaksin disimpan pada suhu 2 sampai 8 derajat Celsius dan dicatat pada kartu rantai dingin.',
    ].join(' '),
  },
];

/**
 * The fixed question set of `P15-T12`.
 *
 * **The cross-lingual pairs run in both directions, and that is the point.**
 * §5.2 withdrew a recommendation to start with full-text search on exactly
 * this ground: an Indonesian question must retrieve the English document that
 * answers it, and the reverse. Leaving those untested would leave the whole
 * architecture decision unverified, so they are marked and scored separately
 * rather than averaged into an aggregate that could hide their failure.
 *
 * The set also carries lexical cases — a drug name with a strength, an ICD
 * code — because those are what the full-text half exists for, and a hybrid
 * that quietly stopped fusing would still pass a purely semantic set.
 */
export const RETRIEVAL_EVAL_SET: readonly RetrievalEvalCase[] = [
  // --- same-language, semantic ---
  {
    id: 'id-jam-buka',
    questionLanguage: 'ID',
    question: 'Klinik buka jam berapa pada hari Sabtu?',
    expectedDocumentKeys: ['faq-jam-layanan'],
    isCrossLingual: false,
    rationale: 'The plainest patient question, answered by one obvious document.',
  },
  {
    id: 'id-rujukan-berlaku',
    questionLanguage: 'ID',
    question: 'Berapa lama surat rujukan BPJS masih berlaku?',
    expectedDocumentKeys: ['sop-pendaftaran'],
    isCrossLingual: false,
    rationale:
      'The answer is in the registration SOP, not the referral SOP — a topic-adjacent distractor exists on purpose.',
  },
  {
    id: 'id-vaksin-influenza',
    questionLanguage: 'ID',
    question: 'Kapan bisa vaksin flu untuk orang dewasa?',
    expectedDocumentKeys: ['sop-vaksinasi'],
    isCrossLingual: false,
    rationale: 'Paraphrase: the question says "vaksin flu", the document says "vaksinasi influenza".',
  },
  {
    id: 'en-pneumonia-first-line',
    questionLanguage: 'EN',
    question: 'What is first line for uncomplicated community-acquired pneumonia?',
    expectedDocumentKeys: ['guideline-antibiotic'],
    isCrossLingual: false,
    rationale: 'Same-language clinical question against the English guideline.',
  },
  {
    id: 'en-chest-pain-ecg',
    questionLanguage: 'EN',
    question: 'How quickly should an ECG be done for suspected ACS?',
    expectedDocumentKeys: ['guideline-chest-pain'],
    isCrossLingual: false,
    rationale: 'Requires reaching a specific sentence rather than matching the title.',
  },

  // --- cross-lingual: Indonesian question, English document ---
  {
    id: 'x-id-to-en-nyeri-dada',
    questionLanguage: 'ID',
    question: 'Bagaimana penanganan awal pasien dengan nyeri dada?',
    expectedDocumentKeys: ['guideline-chest-pain'],
    isCrossLingual: true,
    rationale:
      'The acceptance case §5.2 was written for: "nyeri dada" and "chest pain" share no lexeme, so full-text alone cannot bridge it at any tuning effort.',
  },
  {
    id: 'x-id-to-en-antibiotik',
    questionLanguage: 'ID',
    question: 'Antibiotik lini pertama untuk radang paru pada dewasa apa?',
    expectedDocumentKeys: ['guideline-antibiotic'],
    isCrossLingual: true,
    rationale: '"radang paru" against "pneumonia" — no shared lexeme, and a distractor guideline exists.',
  },

  // --- cross-lingual: English question, Indonesian document ---
  {
    id: 'x-en-to-id-opening-hours',
    questionLanguage: 'EN',
    question: 'What are the clinic opening hours on Saturday?',
    expectedDocumentKeys: ['faq-jam-layanan'],
    isCrossLingual: true,
    rationale: 'The reverse direction, which an ID-only evaluation would never exercise.',
  },
  {
    id: 'x-en-to-id-referral-validity',
    questionLanguage: 'EN',
    question: 'How long does a BPJS referral letter stay valid?',
    expectedDocumentKeys: ['sop-pendaftaran'],
    isCrossLingual: true,
    rationale:
      'Reverse direction with a topic-adjacent Indonesian distractor, so a near-miss scores as one.',
  },
  {
    id: 'x-en-to-id-immunisation',
    questionLanguage: 'EN',
    question: 'When are infant immunisations scheduled?',
    expectedDocumentKeys: ['sop-vaksinasi'],
    isCrossLingual: true,
    rationale: 'Reverse direction on a document whose title shares no word with the question.',
  },

  // --- lexical: what the full-text half exists for ---
  {
    id: 'lex-amoxicillin-dose',
    questionLanguage: 'EN',
    question: 'amoxicillin 500mg',
    expectedDocumentKeys: ['guideline-antibiotic'],
    isCrossLingual: false,
    rationale:
      'An exact drug name and strength. Embedding similarity will happily return an adjacent antibiotic; keyword matching does not make that mistake (§5.3).',
  },
  {
    id: 'lex-icd10',
    questionLanguage: 'ID',
    question: 'Dokumen mana yang menyebut kode ICD-10 untuk rujukan?',
    expectedDocumentKeys: ['sop-rujukan'],
    isCrossLingual: false,
    rationale: 'An exact identifier token, which is the other half of why this is hybrid.',
  },
  {
    id: 'lex-pcare',
    questionLanguage: 'ID',
    question: 'PCare dipakai untuk apa saat pendaftaran?',
    expectedDocumentKeys: ['sop-pendaftaran'],
    isCrossLingual: false,
    rationale: 'A proper noun a multilingual embedder has little reason to place well.',
  },
];
