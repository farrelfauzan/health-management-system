import type { DocumentUploadProgress } from '#lib/documents/upload-progress';

/**
 * Everything a batch row has to say, resolved by the dialog that owns it.
 *
 * The row component is shared between the patient-documents and
 * knowledge-base dialogs, but their copy is not: each feature keeps its own
 * message catalog on purpose, and the two describe the same states in
 * deliberately different voices ("Recorded" for a clinical file, "Done" for a
 * personal upload). Passing the resolved strings in keeps the row surface
 * agnostic without forcing the two catalogs to merge.
 *
 * `buildTitleLabel` is optional because the title input is optional: a surface
 * that does not let a person rename rows while the batch is being assembled
 * has no field to label.
 */
export type UploadFileItemLabels = {
  recorded: string;
  alreadyRecorded: string;
  failed: string;
  buildRemoveLabel: (name: string) => string;
  buildTitleLabel?: (name: string) => string;
  buildProgressLabel: (progress: DocumentUploadProgress) => string;
};
