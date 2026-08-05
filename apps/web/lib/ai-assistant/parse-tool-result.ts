import {
  type ChatToolResultView,
  checkMedicationExpiryToolResultSchema,
  checkMedicationStockToolResultSchema,
  getAppointmentLoadToolResultSchema,
  getDailyCashierReportToolResultSchema,
  getQueueBoardSummaryToolResultSchema,
} from '@hms/shared-types';

import type { ParsedToolResult } from '#lib/ai-assistant/parsed-tool-result';

/**
 * Each renderable tool with the narrowing its payload must survive. A table
 * rather than a chain of ifs because the check is the same job for every tool
 * — parse against the tool's own output schema, narrow on success, return
 * null on failure — and because adding a tool should be one row here plus one
 * component, not another branch to keep parallel with the others.
 */
const RENDERABLE_TOOLS: ReadonlyArray<{
  toolName: string;
  narrow: (result: unknown) => ParsedToolResult | null;
}> = [
  {
    toolName: 'check_medication_stock',
    narrow: (result) => {
      const parsed = checkMedicationStockToolResultSchema.safeParse(result);
      return parsed.success ? { kind: 'STOCK', result: parsed.data } : null;
    },
  },
  {
    toolName: 'check_medication_expiry',
    narrow: (result) => {
      const parsed = checkMedicationExpiryToolResultSchema.safeParse(result);
      return parsed.success ? { kind: 'EXPIRY', result: parsed.data } : null;
    },
  },
  {
    toolName: 'get_queue_board_summary',
    narrow: (result) => {
      const parsed = getQueueBoardSummaryToolResultSchema.safeParse(result);
      return parsed.success ? { kind: 'QUEUE', result: parsed.data } : null;
    },
  },
  {
    toolName: 'get_daily_cashier_report',
    narrow: (result) => {
      const parsed = getDailyCashierReportToolResultSchema.safeParse(result);
      return parsed.success ? { kind: 'CASHIER', result: parsed.data } : null;
    },
  },
  {
    toolName: 'get_appointment_load',
    narrow: (result) => {
      const parsed = getAppointmentLoadToolResultSchema.safeParse(result);
      return parsed.success ? { kind: 'APPOINTMENT_LOAD', result: parsed.data } : null;
    },
  },
];

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
  const renderable = RENDERABLE_TOOLS.find((entry) => entry.toolName === view.toolName);
  return renderable?.narrow(view.result) ?? { kind: 'UNRENDERABLE', toolName: view.toolName };
}
