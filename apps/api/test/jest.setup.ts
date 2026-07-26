/**
 * Test-only identifier encryption keys. Real keys are never defaulted in
 * application code — a deployment missing them must fail to boot rather than
 * silently encrypt patient identifiers under a well-known key.
 */
const TEST_PATIENT_PII_ENCRYPTION_KEY = Buffer.alloc(32, 0x11).toString('base64');
const TEST_PATIENT_PII_INDEX_KEY = Buffer.alloc(32, 0x22).toString('base64');

process.env.PATIENT_PII_ENCRYPTION_KEY ??= TEST_PATIENT_PII_ENCRYPTION_KEY;
process.env.PATIENT_PII_INDEX_KEY ??= TEST_PATIENT_PII_INDEX_KEY;
