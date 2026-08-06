import { FaqRetrievalEvalCase } from './faq-retrieval-eval.types';

/**
 * The fixed golden set for `P15-T12` / `PCS-T04`, graded against
 * `FAQ_RETRIEVAL_EVAL_CORPUS`.
 *
 * **Fixed is the operative word.** It is checked in and changed deliberately,
 * because a set that drifts between runs measures nothing across releases —
 * the same reason the tool-selection set is a file rather than a generator.
 * Adding cases is fine; editing one because retrieval started failing it is
 * what this comment exists to make awkward.
 *
 * Four properties the set is built for:
 *
 * 1. **Cross-lingual pairs in both directions, and they are the point.**
 *    `P15-T12` names them as the entire justification for choosing vectors:
 *    an Indonesian question answered by an English document and the reverse.
 *    The lexical half cannot produce those hits at all — the question and the
 *    passage share no lexeme — so a cross-lingual hit is the embedding half
 *    doing the thing the decision was made for. Leaving them untested leaves
 *    that decision unverified.
 * 2. **Paraphrase over keyword.** Most questions deliberately avoid the
 *    document's own wording ("berapa lama rujukan saya masih bisa dipakai"
 *    against a document that says "berlaku selama 90 hari"). A set written in
 *    the corpus's vocabulary measures string matching and calls it retrieval.
 * 3. **The near-neighbour pairs are probed from both sides.** Referral
 *    validity against referral renewal, imunisasi hours against general
 *    opening hours. Both members are plausible to a vector search, and
 *    `precisionAtOne` is what catches the wrong one winning.
 * 4. **Negative cases are first-class.** Out-of-scope questions and one
 *    staff-only question. Without them, retrieval that returns its best three
 *    guesses for literally anything scores perfect recall while being unusable
 *    — and unsafe.
 */
export const FAQ_RETRIEVAL_EVAL_SET: readonly FaqRetrievalEvalCase[] = [
  // --- Same-language, plain phrasing ---
  {
    id: 'hours-id-1',
    questionLanguage: 'ID',
    question: 'Klinik buka jam berapa hari Sabtu?',
    expectedDocumentSlug: 'jam-operasional',
    expectation: 'ANSWERABLE',
    rationale: 'The plainest opening-hours question, naming a day the document covers explicitly.',
  },
  {
    id: 'hours-id-2',
    questionLanguage: 'ID',
    question: 'Apakah hari Minggu saya bisa berobat ke sana?',
    expectedDocumentSlug: 'jam-operasional',
    expectation: 'ANSWERABLE',
    rationale:
      'Same document, asked as a yes/no about a day the document answers by exclusion — no shared keyword beyond the day name.',
  },
  {
    id: 'bpjs-id-1',
    questionLanguage: 'ID',
    question: 'Apa saja yang harus saya bawa kalau mau pakai BPJS?',
    expectedDocumentSlug: 'syarat-bpjs',
    expectation: 'ANSWERABLE',
    rationale: 'The highest-volume real question at an Indonesian primary clinic.',
  },
  {
    id: 'cost-id-1',
    questionLanguage: 'ID',
    question: 'Kalau saya tidak punya BPJS, bayar berapa untuk periksa dokter?',
    expectedDocumentSlug: 'biaya-pasien-umum',
    expectation: 'ANSWERABLE',
    rationale:
      'Mentions BPJS but is answered by the general-patient fee document — the two BPJS-adjacent documents are both plausible and only one is right.',
  },

  // --- The near-neighbour pairs, probed from both sides ---
  {
    id: 'referral-validity-id',
    questionLanguage: 'ID',
    question: 'Berapa lama surat rujukan saya masih bisa dipakai?',
    expectedDocumentSlug: 'masa-berlaku-rujukan',
    expectation: 'ANSWERABLE',
    rationale:
      'Paraphrase of "berlaku selama 90 hari". Its neighbour (renewal) is semantically adjacent and must not win.',
  },
  {
    id: 'referral-renewal-id',
    questionLanguage: 'ID',
    question: 'Rujukan saya sudah habis, bagaimana cara mengurusnya lagi?',
    expectedDocumentSlug: 'perpanjangan-rujukan',
    expectation: 'ANSWERABLE',
    rationale:
      'The other side of the same pair. A retrieval that returns the validity document for both has not separated them.',
  },
  {
    id: 'immunisation-hours-id',
    questionLanguage: 'ID',
    question: 'Anak saya mau imunisasi, hari apa bisa datang?',
    expectedDocumentSlug: 'jadwal-imunisasi',
    expectation: 'ANSWERABLE',
    rationale:
      'An hours question whose answer is the *specific* schedule, not the general one — the general opening-hours document is the trap.',
  },

  // --- Cross-lingual: Indonesian question, English document ---
  {
    id: 'cancel-id-to-en',
    questionLanguage: 'ID',
    question: 'Bisakah saya membatalkan janji temu saya besok?',
    expectedDocumentSlug: 'appointment-cancellation',
    expectation: 'ANSWERABLE',
    rationale:
      'ID→EN. Shares no lexeme with the English document, so the lexical half contributes nothing and a hit is the vector half.',
  },
  {
    id: 'fasting-id-to-en',
    questionLanguage: 'ID',
    question: 'Sebelum cek darah apakah saya harus puasa dulu?',
    expectedDocumentSlug: 'lab-preparation',
    expectation: 'ANSWERABLE',
    rationale: 'ID→EN on a second topic, so the direction is not carried by one lucky document.',
  },
  {
    id: 'certificate-id-to-en',
    questionLanguage: 'ID',
    question: 'Saya butuh surat keterangan sakit untuk kantor, bagaimana caranya?',
    expectedDocumentSlug: 'medical-certificate',
    expectation: 'ANSWERABLE',
    rationale: 'ID→EN where the Indonesian term (surat keterangan sakit) has no English cognate in the document.',
  },

  // --- Cross-lingual: English question, Indonesian document ---
  {
    id: 'hours-en-to-id',
    questionLanguage: 'EN',
    question: 'What time does the clinic close on weekdays?',
    expectedDocumentSlug: 'jam-operasional',
    expectation: 'ANSWERABLE',
    rationale: 'EN→ID. The reverse direction, which a model can be good at one way and poor at the other.',
  },
  {
    id: 'referral-en-to-id',
    questionLanguage: 'EN',
    question: 'How long is a BPJS referral letter valid?',
    expectedDocumentSlug: 'masa-berlaku-rujukan',
    expectation: 'ANSWERABLE',
    rationale:
      'EN→ID carrying one shared token (BPJS), so it also checks that a single exact term does not drag in the wrong BPJS document.',
  },
  {
    id: 'immunisation-en-to-id',
    questionLanguage: 'EN',
    question: 'Which days do you give childhood vaccinations?',
    expectedDocumentSlug: 'jadwal-imunisasi',
    expectation: 'ANSWERABLE',
    rationale:
      'EN→ID with zero shared tokens — "vaccination" against "imunisasi" — and the general-hours document as the near neighbour.',
  },
  {
    id: 'cost-en-to-id',
    questionLanguage: 'EN',
    question: 'How much does a consultation cost without insurance?',
    expectedDocumentSlug: 'biaya-pasien-umum',
    expectation: 'ANSWERABLE',
    rationale: 'EN→ID where "insurance" must resolve to BPJS to reach the right document.',
  },

  // --- Out of scope: nothing in the corpus answers these ---
  {
    id: 'oos-parking',
    questionLanguage: 'ID',
    question: 'Apakah klinik menyediakan tempat parkir mobil?',
    expectedDocumentSlug: null,
    expectation: 'OUT_OF_SCOPE',
    rationale:
      'A perfectly reasonable clinic question the corpus does not cover. Returning the opening-hours document would ground a confident wrong answer.',
  },
  {
    id: 'oos-medical-advice',
    questionLanguage: 'ID',
    question: 'Kepala saya pusing tiga hari, saya sakit apa ya?',
    expectedDocumentSlug: null,
    expectation: 'OUT_OF_SCOPE',
    rationale:
      'Medical advice — explicitly out of scope per §1.3. Retrieval must not hand the model clinic documents to improvise from.',
  },
  {
    id: 'oos-unrelated',
    questionLanguage: 'EN',
    question: 'Do you sell health insurance policies?',
    expectedDocumentSlug: null,
    expectation: 'OUT_OF_SCOPE',
    rationale:
      'Adjacent vocabulary (insurance) to two real documents without being answered by either — the case that catches a corpus that answers everything.',
  },

  // --- Staff-only: the safety case ---
  {
    id: 'staff-escalation',
    questionLanguage: 'ID',
    question: 'Bagaimana prosedur eskalasi keluhan pasien ke supervisor klinik?',
    expectedDocumentSlug: 'sop-eskalasi',
    expectation: 'STAFF_ONLY',
    rationale:
      'Worded to match the staff-only SOP as closely as possible — it should be the best semantic match in the corpus and must still never be returned on the patient channel. Graded on absence.',
  },
];
