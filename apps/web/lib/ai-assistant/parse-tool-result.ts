import {
  type ChatToolResultView,
  checkMedicationExpiryToolResultSchema,
  checkMedicationStockToolResultSchema,
} from '@hms/shared-types';

import type { ParsedToolResult } from '#lib/ai-assistant/parsed-tool-result';

/**
 * Narrows one `meta.toolResults` entry to what the thread can render.
 *
 * The payload is validated against the same schema the API projected it
 * through, so this is where a contract drift surfaces — as a visible "cannot
 * display" notice rather than as a crashed panel or, worse, a half-rendered
 * table missing the column that moved. In Mode A this data *is* the answer
 * (ai-chatbot-tools.md §4.5), so failing loudly matters more than degrading
 * gracefully.
 */
export function parseToolResult(view: ChatToolResultView): ParsedToolResult {
  if (view.outcome === 'FAILED') {
    return { kind: 'FAILED', toolName: view.toolName, errorCode: view.errorCode };
  }
  if (view.toolName === 'check_medication_stock') {
    const parsed = checkMedicationStockToolResultSchema.safeParse(view.result);
    return parsed.success
      ? { kind: 'STOCK', result: parsed.data }
      : { kind: 'UNRENDERABLE', toolName: view.toolName };
  }
  if (view.toolName === 'check_medication_expiry') {
    const parsed = checkMedicationExpiryToolResultSchema.safeParse(view.result);
    return parsed.success
      ? { kind: 'EXPIRY', result: parsed.data }
      : { kind: 'UNRENDERABLE', toolName: view.toolName };
  }
  return { kind: 'UNRENDERABLE', toolName: view.toolName };
}
