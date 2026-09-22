/**
 * A NIK is sixteen digits. The platform echoes the one it was asked about in
 * some rejections — a lookup's OperationOutcome, a KYC `data.error` — and no
 * such text may reach a log line or an error message unmasked.
 */
export const NIK_PATTERN = /\b\d{16}\b/g;
