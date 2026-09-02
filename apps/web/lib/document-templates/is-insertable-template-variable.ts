import type { TemplateVariable } from '@hms/shared-types';

const ITEM_COLUMN_PREFIX = 'item.';

/**
 * `item.*` registry entries are the columns *inside* the repeating block —
 * they resolve per row, not per invoice, so a chip for one outside the
 * `items` block would always print empty. They are offered in the column
 * config instead of the palette.
 */
export function isInsertableTemplateVariable(variable: TemplateVariable): boolean {
  return !variable.token.startsWith(ITEM_COLUMN_PREFIX);
}
