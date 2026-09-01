import type {
  DocumentCategoryValue,
  DocumentIngestStatusValue,
  DocumentLanguageValue,
  DocumentOwnerTypeValue,
  DocumentPurposeValue,
  DocumentUploadMimeTypeValue,
  DocumentVisibilityValue,
} from '#document-management/schemas';

/**
 * Repository projection of one stored document. Carries `Date` values rather
 * than the ISO strings of {@link ClinicDocumentView} — the service is what
 * serializes — and carries `storageKey`, which the service needs to mint a
 * download URL and never puts in a response.
 */
export type DocumentRecord = {
  id: string;
  ownerType: DocumentOwnerTypeValue;
  ownerId: string | null;
  purpose: DocumentPurposeValue;
  title: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  visibility: DocumentVisibilityValue;
  language: DocumentLanguageValue;
  ingestStatus: DocumentIngestStatusValue;
  ingestError: string | null;
  ingestedAt: Date | null;
  chunkCount: number;
  uploadedById: string;
  /** Clinical-file fields (P16-T07); null on every corpus document. */
  patientId: string | null;
  encounterId: string | null;
  admissionId: string | null;
  category: DocumentCategoryValue | null;
  documentDate: Date | null;
  notes: string | null;
  releasedToPatient: boolean;
  releasedAt: Date | null;
  releasedById: string | null;
  deleteReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Create payload for one patient clinical file (P16-T07). Purpose, owner
 * type, and ingest status are not parameters: a clinical document is always
 * `PATIENT_CLINICAL`, always `PATIENT`-owned, and never ingested — the
 * repository states those facts itself so no caller can vary them.
 */
export type CreatePatientClinicalDocumentData = {
  patientId: string;
  encounterId?: string;
  admissionId?: string;
  category: DocumentCategoryValue;
  documentDate?: Date;
  notes?: string;
  title: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  language: DocumentLanguageValue;
  uploadedById: string;
};

/**
 * `patientId` is required rather than an optional filter, so a caller cannot
 * widen the query by omission — the same rule the owner-scoped reads follow.
 */
export type ListPatientClinicalDocumentsParams = {
  patientId: string;
  category?: DocumentCategoryValue;
  encounterId?: string;
  admissionId?: string;
  documentDateFrom?: Date;
  documentDateTo?: Date;
  /**
   * `true` narrows the list to released files — the patient-portal predicate
   * (FR-E2-13). Absent means every live file, which is the staff view.
   */
  isReleasedToPatient?: true;
  cursor?: string;
  limit: number;
};

/**
 * Metadata edit for one clinical file (`P16-T08`). `null` clears a value —
 * unlinking an episode, dropping a note — while `undefined` leaves it alone;
 * the distinction is why these are not the same optionality.
 */
export type UpdatePatientClinicalDocumentData = {
  title?: string;
  category?: DocumentCategoryValue;
  documentDate?: Date | null;
  notes?: string | null;
  encounterId?: string | null;
  admissionId?: string | null;
};

/**
 * The outcome of retiring a clinical file. No chunk count, unlike the corpus
 * variant — a `PATIENT_CLINICAL` row never has chunks to remove (FR-E2-12).
 */
export type DeletePatientClinicalDocumentResult = {
  document: DocumentRecord;
  deletedAt: Date;
};

/** The verbs the patient-document permission catalog names (`P16-T08`). */
export type PatientDocumentAction = 'read' | 'write' | 'release' | 'delete';

/**
 * How far a caller may see into one patient's file after the read gate:
 * `FULL` is the staff view, `RELEASED_ONLY` is the patient reading their own
 * record, where only what a clinician released exists (FR-E2-13).
 */
export type PatientDocumentReadAccess = 'FULL' | 'RELEASED_ONLY';

/**
 * Create payload. `ownerType` and `ownerId` are explicit rather than defaulted
 * to the clinic corpus: the personal knowledge bases of `P15-T20` write
 * through this same repository, and a default here is how a private document
 * would end up in the shared corpus.
 */
export type CreateDocumentData = {
  ownerType: DocumentOwnerTypeValue;
  ownerId: string | null;
  purpose: DocumentPurposeValue;
  title: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  visibility: DocumentVisibilityValue;
  language: DocumentLanguageValue;
  ingestStatus: DocumentIngestStatusValue;
  uploadedById: string;
};

/**
 * Metadata update payload. `ingestStatus` travels with it because an edit to
 * `visibility` or `language` invalidates the chunks copied from those fields,
 * and the status reset must land in the same write as the edit that caused it.
 */
export type UpdateDocumentData = {
  title?: string;
  visibility?: DocumentVisibilityValue;
  language?: DocumentLanguageValue;
  ingestStatus?: DocumentIngestStatusValue;
};

export type ListDocumentsParams = {
  ownerType: DocumentOwnerTypeValue;
  ownerId: string | null;
  purpose?: DocumentPurposeValue;
  ingestStatus?: DocumentIngestStatusValue;
  visibility?: DocumentVisibilityValue;
  language?: DocumentLanguageValue;
  cursor?: string;
  limit: number;
};

export type DocumentPage = {
  items: DocumentRecord[];
  nextCursor: string | null;
};

/**
 * The result of retiring a document: the soft-deleted row plus how many
 * chunks were discarded with it. Chunks are hard-deleted because retrieval
 * queries them directly — a soft-deleted parent with live chunks would still
 * answer questions.
 */
export type DeleteDocumentResult = {
  document: DocumentRecord;
  deletedAt: Date;
  chunksRemoved: number;
};

/**
 * `Uint8Array` rather than `Buffer` because this package is also compiled for
 * the browser: `Buffer` is a Node global, and one Node-only type here would
 * make the whole barrel unimportable from `apps/web`.
 */
/**
 * The ingestion pipeline's tuning. `maxChunksPerDocument` is a ceiling, not a
 * target: a document that produces more is truncated and says so on the row,
 * because one uploaded book must not become ten thousand embedding calls and
 * a corpus nobody meant to publish.
 */
export type DocumentIngestionConfig = {
  readonly isEnabled: boolean;
  readonly pollIntervalMs: number;
  readonly pollBatchLimit: number;
  readonly maxChunkCharacters: number;
  readonly chunkOverlapCharacters: number;
  readonly maxChunksPerDocument: number;
};

export type ExtractDocumentTextParams = {
  content: Uint8Array;
  mimeType: string;
};

/**
 * Bytes to check against the type their upload declared (SJ-21). `Uint8Array`
 * rather than `Buffer` for the same browser-compilation reason as
 * {@link ExtractDocumentTextParams}.
 */
export type ValidateDocumentContentParams = {
  content: Uint8Array;
  declaredMimeType: DocumentUploadMimeTypeValue;
};

/**
 * The verdict on uploaded bytes. `reason` is written for the audit log and for
 * the uploader — it names the check that failed, never file content, because a
 * rejection message that quotes bytes would leak what it refused to store.
 */
export type DocumentContentValidationResult =
  | { isAccepted: true }
  | { isAccepted: false; reason: string };

/**
 * What the confirm-time guard is handed, and what it hands back.
 *
 * The guard is one content check (SJ-21): which stored object to read, what
 * type its upload declared, and who is confirming — the actor lands in the
 * audit row when the bytes disagree with the declaration.
 *
 * The result carries `sizeBytes` because for an image the guard **replaces
 * the stored object** with its own re-encode (P16-T03), so the size the row
 * records has to be the size of what is now in the bucket, not the size of
 * what the client uploaded.
 */
export type GuardUploadedDocumentParams = {
  storageKey: string;
  declaredMimeType: DocumentUploadMimeTypeValue;
  actorUserId: string;
};

export type GuardedDocumentUploadResult = {
  sizeBytes: number;
};

/**
 * Text pulled out of a stored file, plus how many pages it came from —
 * reported so a PDF that yields one page of text out of forty is visible as
 * an extraction problem rather than a short document. Null for formats with
 * no page concept.
 */
export type ExtractDocumentTextResult = {
  text: string;
  pageCount: number | null;
};

export type SplitTextIntoChunksParams = {
  text: string;
  maxCharacters: number;
  overlapCharacters: number;
};

/**
 * One chunk on its way into the database. `embedding` is a plain number array
 * here; turning it into a pgvector literal is the repository's job, because
 * that is the only layer allowed to know how the column is written.
 *
 * `visibility` and `language` are copied from the parent document at this
 * point rather than joined at query time — retrieval filters and ranks in one
 * pass over the chunk table, and re-ingesting is what republishes them.
 */
export type CreateDocumentChunkData = {
  chunkIndex: number;
  content: string;
  embedding: number[];
  embeddingModel: string;
  embeddingVersion: string;
  visibility: DocumentVisibilityValue;
  language: DocumentLanguageValue;
};

export type ReplaceDocumentChunksParams = {
  documentId: string;
  chunks: readonly CreateDocumentChunkData[];
  ingestedAt: Date;
};

/**
 * What one ingestion attempt did. A `FAILED` outcome carries the reason that
 * was persisted on the document — never file content, since an extraction
 * error must not become a way to read a document the reader could not
 * otherwise open.
 */
export type IngestDocumentResult = {
  documentId: string;
  ingestStatus: DocumentIngestStatusValue;
  chunkCount: number;
  ingestError: string | null;
};

/**
 * Which corpus a retrieved passage came from. It is shown to the reader —
 * "dari dokumen klinik" against "dari dokumen Anda" — because a doctor should
 * know whether an answer leans on clinic policy or on a paper they uploaded
 * themselves (ai-chatbot-tools.md §5.5).
 */
export const RETRIEVAL_SOURCE_TIERS = ['CLINIC', 'PERSONAL'] as const;

export type RetrievalSourceTierValue = (typeof RETRIEVAL_SOURCE_TIERS)[number];

/**
 * The candidate set both halves of the hybrid search draw from
 * (ai-chatbot-tools.md §5.5). Every field is required rather than optional:
 * a caller who forgets `ownerUserId` must not silently widen the query from
 * "the clinic corpus plus my own documents" to "everything in the table", and
 * a caller who forgets `channelVisibility` must not surface a staff-only SOP
 * in a patient answer.
 *
 * `ownerUserId` is `null` for a channel whose users have no personal corpus.
 * Patients do not have one in this phase, so the patient channel passes null
 * and the personal half of the union contributes nothing at all — it is not
 * merely outranked.
 */
export type RetrieveDocumentChunksParams = {
  /** The user's question, verbatim, for the lexical half. */
  queryText: string;
  /**
   * The question's vector, produced by the same model and version the chunks
   * were written with. Comparing across embedding spaces returns plausible
   * nonsense rather than an error, so both are matched in the SQL predicate
   * rather than assumed.
   */
  queryEmbedding: readonly number[];
  embeddingModel: string;
  embeddingVersion: string;
  /**
   * The asking channel's own visibility — `PATIENT` or `DOCTOR`. `BOTH` is
   * always admitted alongside it, so this is the channel, not a filter list a
   * caller could widen.
   */
  channelVisibility: Exclude<DocumentVisibilityValue, 'BOTH'>;
  /** The asking user, whose personal knowledge base joins the union. */
  ownerUserId: string | null;
  /** How many rows each half of the hybrid returns before fusion. */
  candidateLimit: number;
};

/**
 * One ranked candidate from a single retrieval half, before fusion. `rank` is
 * 1-based and is what reciprocal rank fusion consumes — the underlying scores
 * (cosine distance, `ts_rank`) are deliberately not carried across the seam,
 * because they are on incomparable scales and fusing them numerically is the
 * mistake RRF exists to avoid.
 */
export type RankedDocumentChunkCandidate = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  language: DocumentLanguageValue;
  sourceTier: RetrievalSourceTierValue;
  rank: number;
};

/**
 * One passage that survived fusion. `score` is the RRF score, which is
 * meaningful only for ordering within a single query — it is not a relevance
 * percentage and must not be shown as one.
 */
export type RetrievedDocumentChunk = Omit<RankedDocumentChunkCandidate, 'rank'> & {
  score: number;
};

/**
 * Retrieval tuning. `candidateLimit` is per half, `maxPassages` is what
 * survives fusion and reaches the provider — the second is what bounds the
 * prompt, and it is deliberately much smaller than the first, because fusion
 * can only promote a passage one half ranked poorly if that half returned it
 * at all.
 */
export type DocumentRetrievalConfig = {
  readonly candidateLimit: number;
  readonly maxPassages: number;
  /**
   * RRF's rank constant, conventionally 60. It sets how sharply a top rank
   * outweighs a lower one: raising it flattens both halves toward equal
   * influence, lowering it lets a single half's first result dominate.
   */
  readonly rankConstant: number;
  /**
   * Passages shorter than this are dropped after fusion. A chunk of a dozen
   * characters — a stray heading, a page number — ranks fine lexically and
   * grounds nothing, and every one of them spends prompt budget a real
   * passage could have used.
   */
  readonly minPassageCharacters: number;
};
