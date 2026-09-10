import type { DocumentUploadProgress } from '#lib/documents/upload-progress';

/**
 * One file in a multi-file upload dialog's batch, from the moment it is picked
 * to the moment it settles.
 *
 * Shared by both upload surfaces (`P16-T13` patient documents, `P19-T14` the
 * personal knowledge base) because the shape of a batch row does not depend on
 * what is being uploaded. The title is per file — it defaults to the filename,
 * and where a surface lets a person change it, it is the one field that
 * differs between rows while the rest of the form is set once for the batch.
 * `outcome` is per file too, because a batch is not all-or-nothing: file three
 * failing must not undo files one and two, and the row has to say which
 * happened.
 *
 * `already-recorded` is only reachable where the API reports a confirm
 * conflict; a surface whose confirm has no such case simply never produces it.
 */
export type UploadFileEntry = {
  id: string;
  file: File;
  title: string;
  progress: DocumentUploadProgress | null;
  outcome: 'pending' | 'recorded' | 'already-recorded' | 'failed';
  errorMessage: string | null;
};
