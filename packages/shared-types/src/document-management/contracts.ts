import type {
  DocumentCategoryValue,
  DocumentIngestStatusValue,
  DocumentLanguageValue,
  DocumentOwnerTypeValue,
  DocumentPurposeValue,
  DocumentVisibilityValue,
  VaultDocumentCategoryValue,
} from '#document-management/schemas';

/**
 * A signed browser-direct upload. `requiredHeaders` must be sent verbatim on
 * the PUT — they are part of the signature, so a request that omits or
 * changes one is rejected by the provider rather than stored under different
 * metadata.
 *
 * `storageKey` is the only part of this response the client sends back: it is
 * what the confirm call names, and it is server-minted, so a caller can never
 * attach a row to an object of its own choosing.
 */
export type ClinicDocumentUploadUrlView = {
  url: string;
  storageKey: string;
  expiresAt: string;
  requiredHeaders: Readonly<Record<string, string>>;
};

/**
 * Admin-facing view of one stored document.
 *
 * `storageKey` is deliberately absent: the key is an internal handle, and
 * every download is a short-lived signed URL minted per request (D-018), so
 * exposing the key would create a second, unexpiring way to name the object.
 *
 * `chunkCount` is what tells an operator whether the document is actually
 * searchable. A `READY` status with zero chunks is a document that extracted
 * to nothing, and without the count that reads identically to a working one.
 */
export type ClinicDocumentView = {
  id: string;
  ownerType: DocumentOwnerTypeValue;
  ownerId: string | null;
  purpose: DocumentPurposeValue;
  title: string;
  mimeType: string;
  sizeBytes: number;
  visibility: DocumentVisibilityValue;
  language: DocumentLanguageValue;
  ingestStatus: DocumentIngestStatusValue;
  ingestError: string | null;
  ingestedAt: string | null;
  chunkCount: number;
  uploadedById: string;
  createdAt: string;
  updatedAt: string;
};

export type ClinicDocumentListView = {
  items: ClinicDocumentView[];
  nextCursor: string | null;
};

/**
 * A short-lived signed download URL. Never persisted and never returned as
 * part of a document view — it is minted per request so it expires on its
 * own rather than living in a client's cached list forever.
 */
export type ClinicDocumentDownloadView = {
  url: string;
  expiresAt: string;
};

/**
 * The outcome of retiring a document. `chunksRemoved` is reported rather than
 * implied: deletion is what makes a document stop being retrievable, and the
 * count is the operator's evidence that it did.
 */
export type DeletedClinicDocumentView = {
  id: string;
  deletedAt: string;
  chunksRemoved: number;
};

/**
 * A document in a user's own knowledge base (`P15-T20`).
 *
 * `visibility` is absent by design — the clinic view carries it because a
 * clinic document's channel visibility is what decides whether a patient can
 * be shown it, whereas a personal document is only ever retrieved in its
 * owner's own sessions. Surfacing the column here would invite a client to
 * offer a control that changes nothing.
 */
export type PersonalDocumentView = {
  id: string;
  ownerType: DocumentOwnerTypeValue;
  ownerId: string;
  purpose: DocumentPurposeValue;
  title: string;
  mimeType: string;
  sizeBytes: number;
  language: DocumentLanguageValue;
  ingestStatus: DocumentIngestStatusValue;
  ingestError: string | null;
  ingestedAt: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PersonalDocumentListView = {
  items: PersonalDocumentView[];
  nextCursor: string | null;
};

export type PersonalDocumentUploadUrlView = {
  url: string;
  storageKey: string;
  expiresAt: string;
  requiredHeaders: Readonly<Record<string, string>>;
};

export type PersonalDocumentDownloadView = {
  url: string;
  expiresAt: string;
};

export type DeletedPersonalDocumentView = {
  id: string;
  deletedAt: string;
  chunksRemoved: number;
};

/**
 * Staff-facing view of one patient clinical file (`P16-T08`).
 *
 * `storageKey` is absent as everywhere; every download is a short-lived
 * signed URL minted per request and audited. The ingestion columns are
 * absent too — a clinical file never enters the retrieval corpus (FR-E2-12),
 * so surfacing an ingest status would describe a pipeline that can never
 * touch the row.
 */
export type PatientDocumentView = {
  id: string;
  patientId: string;
  encounterId: string | null;
  admissionId: string | null;
  category: DocumentCategoryValue;
  title: string;
  mimeType: string;
  sizeBytes: number;
  language: DocumentLanguageValue;
  /** `YYYY-MM-DD`; when the document was produced, not when it was uploaded. */
  documentDate: string | null;
  notes: string | null;
  releasedToPatient: boolean;
  releasedAt: string | null;
  releasedById: string | null;
  uploadedById: string;
  /**
   * Who scanned the file in, as an email (`P16-T14`, FR-E2-05). `User` carries
   * no display name, so this follows `invitedByEmail`: the only
   * human-readable identifier an account has. Staff-facing only — the portal's
   * narrowed view carries neither this nor `uploadedById`, because who filed a
   * document is clinic-internal.
   */
  uploadedByEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PatientDocumentListView = {
  items: PatientDocumentView[];
  nextCursor: string | null;
};

export type PatientDocumentUploadUrlView = {
  url: string;
  storageKey: string;
  expiresAt: string;
  requiredHeaders: Readonly<Record<string, string>>;
};

export type PatientDocumentDownloadView = {
  url: string;
  expiresAt: string;
};

/**
 * The encounter workspace's Documents panel (FR-E2-05): this visit's
 * documents first, then the rest of the patient's file. Two named groups
 * rather than one flagged list, because the split is the panel's whole
 * shape and a client re-deriving it from `encounterId` would re-implement
 * the definition of "this visit".
 */
export type EncounterDocumentsView = {
  thisVisit: PatientDocumentView[];
  history: PatientDocumentView[];
};

/**
 * The outcome of retiring a clinical file. `deleteReason` is echoed because
 * it is the fact the deletion was authorised on, and the caller's evidence
 * it was recorded.
 */
export type DeletedPatientDocumentView = {
  id: string;
  deletedAt: string;
  deleteReason: string;
};

/**
 * Patient-portal view of one released clinical file. Narrower than the staff
 * view on purpose: `notes` are staff working notes, `releasedById` and
 * `uploadedById` are internal user ids, and none of them belongs in the
 * portal. A document appears here only after a clinician released it
 * (FR-E2-13).
 */
export type PortalDocumentView = {
  id: string;
  category: DocumentCategoryValue;
  title: string;
  mimeType: string;
  sizeBytes: number;
  documentDate: string | null;
  releasedAt: string | null;
  createdAt: string;
};

export type PortalDocumentListView = {
  items: PortalDocumentView[];
  nextCursor: string | null;
};

/**
 * One passage `search_faq` may return to the public WhatsApp/Telegram channel
 * (`PCS-T04`; customer-service strategy §4.2).
 *
 * **This type is the output allowlist**, and the two fields it has are the
 * two the strategy permits: the passage text and the title of the document it
 * came from. Everything else on a retrieved chunk is withheld deliberately.
 * `documentId` and `chunkId` are internal handles that would let a caller
 * correlate answers across conversations; `sourceTier` can only ever say
 * `CLINIC` on this channel, so returning it would be a field that exists to
 * describe a distinction the channel cannot observe; and `score` is an RRF
 * value meaningful only for ordering within one query, which is exactly the
 * kind of number a model will happily present to a customer as a confidence
 * percentage.
 *
 * A narrower type is not a cosmetic choice here. Principle 2 of the strategy
 * is that the channel's tools are *structurally* incapable of returning
 * sensitive fields rather than instructed not to, and a projection at the
 * service boundary is what makes that true of the corpus.
 */
export type FaqSearchPassage = {
  documentTitle: string;
  content: string;
};

/**
 * One document in the caller's own vault (`P16-T17`).
 *
 * `ownerId` is absent, unlike {@link PersonalDocumentView}, and that is the
 * contract making a point: this route addresses exactly one vault, the
 * caller's, so echoing whose it is would be answering a question the API
 * never lets anyone ask. The ingestion columns are absent too — a vault
 * document never enters the retrieval corpus (FR-E3-05), so an ingest status
 * would describe a pipeline that cannot touch the row.
 *
 * `storageKey` is absent as everywhere; every download is a short-lived
 * signed URL minted per request and audited.
 */
export type VaultDocumentView = {
  id: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  language: DocumentLanguageValue;
  vaultCategory: VaultDocumentCategoryValue | null;
  referenceNumber: string | null;
  /** `YYYY-MM-DD`; the date on the document, not when it was uploaded. */
  issuedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VaultDocumentListView = {
  items: VaultDocumentView[];
  nextCursor: string | null;
};

export type VaultDocumentUploadUrlView = {
  url: string;
  storageKey: string;
  expiresAt: string;
  requiredHeaders: Readonly<Record<string, string>>;
};

export type VaultDocumentDownloadView = {
  url: string;
  expiresAt: string;
};

/**
 * The result of a vault deletion (FR-E3-09). There is no `deletedAt`, because
 * there is no row left to carry one — unlike a clinical file, a doctor's own
 * paperwork falls under no retention floor, so "deleted" here means gone.
 */
export type DeletedVaultDocumentView = {
  id: string;
  deleted: true;
};

/**
 * One live or revoked key to one vault document, as its **owner** sees it
 * (`P16-T34`/`P16-T35`, FR-E3-16).
 *
 * `lastAccessedAt` and `openCount` are the reason this view exists. Being
 * able to watch the door is what makes people willing to open it: an owner
 * who can see who opened their STR, and when, and how often, is an owner who
 * can share it in the first place. They come from denormalised columns rather
 * than the audit log, which the owner cannot query.
 */
export type VaultDocumentShareView = {
  id: string;
  documentId: string;
  granteeId: string;
  /** The recipient's sign-in address — `User` carries no display name. */
  granteeEmail: string;
  /** ISO instant, or null for an open-ended share. */
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  openCount: number;
  createdAt: string;
  /**
   * Whether this key opens the document right now: not revoked, not past its
   * expiry, and held by a live account. Computed per request rather than
   * stored, so a revocation takes effect on the next call with no window
   * (FR-E3-15).
   */
  isLive: boolean;
};

export type VaultDocumentShareListView = {
  items: VaultDocumentShareView[];
};

/**
 * One document that was shared **with** the caller (`P16-T34`, FR-E3-17).
 *
 * A narrower shape than {@link VaultDocumentView} on purpose. The recipient
 * gets what they need to recognise and open the file, and nothing about how
 * the owner files their own paperwork — no `vaultCategory`, no
 * `referenceNumber`, no issue date. Those are the owner's private notes to
 * themselves, and a key to one document is not a window into how someone
 * organises their drawer.
 */
export type SharedWithMeDocumentView = {
  id: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  /** Who handed it over — the one fact about the owner a recipient needs. */
  sharedByEmail: string;
  sharedAt: string;
  /** When this key stops working, or null if it was given open-ended. */
  expiresAt: string | null;
};

export type SharedWithMeDocumentListView = {
  items: SharedWithMeDocumentView[];
  nextCursor: string | null;
};

/**
 * One person the caller could share a document with (`P16-T34`).
 *
 * Email and role codes only. `User` has no name field, and the role codes are
 * here so an owner can tell an administrator from another clinician before
 * handing over their KTP — not so the lookup can be used to profile staff.
 */
export type VaultDocumentShareRecipientView = {
  id: string;
  email: string;
  roleCodes: string[];
};

export type VaultDocumentShareRecipientListView = {
  items: VaultDocumentShareRecipientView[];
};

/** The result of revoking one share (FR-E3-15). */
export type RevokedVaultDocumentShareView = {
  id: string;
  revokedAt: string;
};
