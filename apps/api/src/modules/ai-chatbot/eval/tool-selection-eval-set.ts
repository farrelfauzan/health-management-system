import { ToolSelectionEvalCase } from './tool-selection-eval.types';

/**
 * The fixed bilingual question set of §4.7.3.
 *
 * **Fixed is the operative word.** It is checked in and changed deliberately,
 * because a set that drifts between runs measures nothing across releases —
 * the same reason `P15-T12`'s retrieval set is a file rather than a
 * generator. Adding cases is fine; editing one to make a provider look better
 * is what this comment exists to make awkward.
 *
 * Three properties the set is built for:
 *
 * 1. **Both languages, on the same underlying intents.** Users type
 *    Indonesian and tool descriptions are written in English, which is
 *    cross-lingual matching on a different surface from §5.2's. A provider
 *    that scores well in English and badly in Indonesian is the failure this
 *    pairing exists to expose, and it is invisible in a monolingual set.
 * 2. **The adjacent pair is over-represented.** `list_my_patients` and
 *    `get_patient_summary` are the one genuinely confusable pair (§4.7.1
 *    lever 1), separated by whether a specific patient is named. Several
 *    cases sit right on that line.
 * 3. **Negative cases are first-class.** Roughly a third expect *no* tool:
 *    general questions, out-of-scope questions, and ambiguous ones. Without
 *    them a model that calls a tool for everything scores perfectly on
 *    correct-tool rate while being unusable.
 */
export const TOOL_SELECTION_EVAL_SET: readonly ToolSelectionEvalCase[] = [
  // --- list_my_patients ---
  {
    id: 'patients-id-1',
    language: 'ID',
    question: 'Pasien saya siapa saja?',
    expectedTool: 'list_my_patients',
    rationale: 'The plainest Indonesian phrasing of the roster question.',
  },
  {
    id: 'patients-id-2',
    language: 'ID',
    question: 'Ada berapa pasien yang saya tangani sekarang?',
    expectedTool: 'list_my_patients',
    rationale: 'A count question over the same data — the tool returns matchCount.',
  },
  {
    id: 'patients-en-1',
    language: 'EN',
    question: 'Who are my patients?',
    expectedTool: 'list_my_patients',
    rationale: 'English pair of patients-id-1.',
  },
  {
    id: 'patients-en-2',
    language: 'EN',
    question: 'How many patients am I currently assigned?',
    expectedTool: 'list_my_patients',
    rationale: 'English pair of patients-id-2.',
  },
  {
    id: 'patients-en-3',
    language: 'EN',
    question: 'Show me the next page of my patient list.',
    expectedTool: 'list_my_patients',
    expectedArguments: { page: 2 },
    rationale: 'The one case where `page` should not be defaulted.',
  },

  // --- get_patient_summary, including the adjacent-pair boundary ---
  {
    id: 'summary-id-1',
    language: 'ID',
    question: 'Tolong ringkas pasien dengan id 7f1d3a2e-9c44-4b21-8f0e-1a2b3c4d5e6f.',
    expectedTool: 'get_patient_summary',
    expectedArguments: { patientId: '7f1d3a2e-9c44-4b21-8f0e-1a2b3c4d5e6f' },
    rationale: 'A named patient by id — the signal that separates this from the roster tool.',
  },
  {
    id: 'summary-id-2',
    language: 'ID',
    question: 'Apakah pasien 7f1d3a2e-9c44-4b21-8f0e-1a2b3c4d5e6f punya alergi obat?',
    expectedTool: 'get_patient_summary',
    expectedArguments: { patientId: '7f1d3a2e-9c44-4b21-8f0e-1a2b3c4d5e6f' },
    rationale: 'Allergies live on the summary; a model may be tempted to look for a clinical tool.',
  },
  {
    id: 'summary-en-1',
    language: 'EN',
    question: 'Summarise patient 7f1d3a2e-9c44-4b21-8f0e-1a2b3c4d5e6f for me.',
    expectedTool: 'get_patient_summary',
    expectedArguments: { patientId: '7f1d3a2e-9c44-4b21-8f0e-1a2b3c4d5e6f' },
    rationale: 'English pair of summary-id-1.',
  },
  {
    id: 'summary-en-2',
    language: 'EN',
    question: 'How old is patient 7f1d3a2e-9c44-4b21-8f0e-1a2b3c4d5e6f?',
    expectedTool: 'get_patient_summary',
    expectedArguments: { patientId: '7f1d3a2e-9c44-4b21-8f0e-1a2b3c4d5e6f' },
    rationale: 'Age comes from the summary; tests that the model does not invent a demographics tool.',
  },

  // --- list_my_appointments ---
  {
    id: 'appointments-id-1',
    language: 'ID',
    question: 'Jadwal saya hari ini bagaimana?',
    expectedTool: 'list_my_appointments',
    expectedArguments: {},
    rationale: 'Today must produce NO date argument — the server resolves it (§4.7.1 lever 3).',
  },
  {
    id: 'appointments-id-2',
    language: 'ID',
    question: 'Siapa saja pasien saya besok?',
    expectedTool: 'list_my_appointments',
    rationale:
      'Says "pasien" but means the schedule. The adjacent-pair trap in the other direction: the date is the signal, not the noun.',
  },
  {
    id: 'appointments-en-1',
    language: 'EN',
    question: 'What is on my schedule today?',
    expectedTool: 'list_my_appointments',
    expectedArguments: {},
    rationale: 'English pair of appointments-id-1, same no-date expectation.',
  },
  {
    id: 'appointments-en-2',
    language: 'EN',
    question: 'Do I have any appointments on 2026-09-14?',
    expectedTool: 'list_my_appointments',
    expectedArguments: { date: '2026-09-14' },
    rationale: 'An explicitly named other day — the one case where `date` should be sent.',
  },

  // --- pharmacy ---
  {
    id: 'stock-id-1',
    language: 'ID',
    question: 'Stok amoxicillin masih ada?',
    expectedTool: 'check_medication_stock',
    expectedArguments: { medicationName: 'amoxicillin' },
    rationale: 'The plainest stock question, with the name to extract.',
  },
  {
    id: 'stock-en-1',
    language: 'EN',
    question: 'Do we have paracetamol in stock?',
    expectedTool: 'check_medication_stock',
    expectedArguments: { medicationName: 'paracetamol' },
    rationale: 'English pair of stock-id-1.',
  },
  {
    id: 'stock-en-2',
    language: 'EN',
    question: 'Which medications need reordering?',
    expectedTool: 'check_medication_stock',
    expectedArguments: {},
    rationale: 'No name to extract — the argument should be omitted, not guessed at.',
  },
  {
    id: 'expiry-id-1',
    language: 'ID',
    question: 'Obat apa yang akan kedaluwarsa bulan depan?',
    expectedTool: 'check_medication_expiry',
    rationale:
      'Expiry, not stock. Only offered to a caller holding inventory.read:any, so a doctor-only run should score this as CORRECT_ABSTENTION instead — see the runner note.',
  },

  // --- no tool: answerable without one ---
  {
    id: 'general-id-1',
    language: 'ID',
    question: 'Apa perbedaan amoxicillin dan amoxiclav secara umum?',
    expectedTool: null,
    rationale: 'General drug-class knowledge — in scope for the doctor channel, and no lookup exists.',
  },
  {
    id: 'general-en-1',
    language: 'EN',
    question: 'What is the usual first-line treatment for uncomplicated cystitis?',
    expectedTool: null,
    rationale: 'Guideline knowledge, not clinic data. Calling a tool here is a false-tool.',
  },
  {
    id: 'general-id-2',
    language: 'ID',
    question: 'Terima kasih, itu saja.',
    expectedTool: null,
    rationale: 'Conversational closing. A model that calls a tool here calls tools for everything.',
  },

  // --- no tool: out of scope, and must not be answered with a number ---
  {
    id: 'outofscope-id-1',
    language: 'ID',
    question: 'Berapa kamar rawat inap yang masih kosong?',
    expectedTool: null,
    rationale:
      '§3: rooms and beds are an unbuilt domain. The right behaviour is to say so; answering with a number is exactly the §4.7.2 failure the unsourced-claim guard catches.',
  },
  {
    id: 'outofscope-en-1',
    language: 'EN',
    question: 'How much revenue did the clinic take yesterday?',
    expectedTool: null,
    rationale:
      'The cashier report is an admin-channel tool. In a doctor session no tool covers it, and a figure in the reply is unsourced.',
  },

  // --- no tool: genuinely ambiguous, clarification wanted ---
  {
    id: 'ambiguous-id-1',
    language: 'ID',
    question: 'Cek pasien itu dong.',
    expectedTool: null,
    expectAmbiguous: true,
    rationale:
      'No patient named and no prior turn to resolve "itu". §4.7.1 lever 4: one clarifying question beats one wrong lookup rendered as fact.',
  },
  {
    id: 'ambiguous-en-1',
    language: 'EN',
    question: 'Can you check that for me?',
    expectedTool: null,
    expectAmbiguous: true,
    rationale: 'English pair of ambiguous-id-1 — no referent at all.',
  },
];
