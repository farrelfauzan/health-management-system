export const TEMPLATE_IMPORT_STAGED_KEY_PREFIX = 'document-templates/imports/staged';

const STAGED_IMPORT_KEY_PATTERN = new RegExp(
  `^${TEMPLATE_IMPORT_STAGED_KEY_PREFIX}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.docx$`,
);

/**
 * Only a key this module minted may be read back (`P16-T42`): the import
 * route takes a key from the client, and a key outside this prefix would
 * turn "convert my upload" into "read any object in the bucket".
 */
export function isStagedTemplateImportKey(storageKey: string): boolean {
  return STAGED_IMPORT_KEY_PATTERN.test(storageKey);
}
