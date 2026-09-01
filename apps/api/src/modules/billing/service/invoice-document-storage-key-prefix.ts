/**
 * Object-key prefix for rendered invoice PDFs (`P16-T06`). Keys under it are
 * server-minted (`<prefix>/<uuid>.pdf`), opaque, and carry no invoice number
 * or patient detail — the row holds the linkage, the bucket holds bytes.
 */
export const INVOICE_DOCUMENT_STORAGE_KEY_PREFIX = 'invoices/documents';
