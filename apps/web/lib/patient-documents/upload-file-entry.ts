import type { DocumentUploadProgress } from '#lib/documents/upload-progress';

/**
 * One file in the upload dialog's batch, from the moment it is picked to the
 * moment it settles. The title is per file — it defaults to the filename and
 * is the one field a person is likely to change per file, where category,
 * date, notes, and visit link are set once for the batch. `outcome` is
 * per file too, because a batch is not all-or-nothing: file three failing
 * must not undo files one and two, and the row has to say which happened.
 */
export type UploadFileEntry = {
  id: string;
  file: File;
  title: string;
  progress: DocumentUploadProgress | null;
  outcome: 'pending' | 'recorded' | 'already-recorded' | 'failed';
  errorMessage: string | null;
};
