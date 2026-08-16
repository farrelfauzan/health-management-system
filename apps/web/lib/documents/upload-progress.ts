/**
 * One observable moment of the three-step browser-direct upload.
 *
 * `uploading` is the only stage with a byte-accurate percentage — it is the
 * only stage whose duration this client can measure. `scanning` covers the
 * confirm call, during which the API reads the object back and runs the
 * SJ-21 content checks; it reports no percentage because the server does not
 * stream its progress.
 */
export type DocumentUploadProgress =
  | { stage: 'preparing' }
  | { stage: 'uploading'; percent: number }
  | { stage: 'scanning' }
  | { stage: 'complete' };
