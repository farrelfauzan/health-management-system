import type { ParsedToolResult } from '#lib/ai-assistant/parsed-tool-result';

/**
 * The `aiAssistant.toolResults` message key naming a lookup. A literal union
 * rather than `string` because the translator's keys are typed from the
 * message catalogue — a key that does not exist is a compile error here
 * rather than a raw key rendered into the card.
 */
export type ToolResultTitleKey =
  | 'stockTitle'
  | 'expiryTitle'
  | 'queueTitle'
  | 'cashierTitle'
  | 'loadTitle'
  | 'patientsTitle'
  | 'patientSummaryTitle'
  | 'appointmentsTitle'
  | 'genericTitle';

/**
 * Every tool the API can dispatch, named the way a person would name it —
 * including the ones this client cannot render. A failed or unrenderable
 * lookup used to be headed with its raw wire name (`check_medication_expiry`),
 * which tells the reader nothing except that something internal leaked into
 * the UI.
 */
const TITLE_KEY_BY_TOOL_NAME: Readonly<Record<string, ToolResultTitleKey>> = {
  check_medication_stock: 'stockTitle',
  check_medication_expiry: 'expiryTitle',
  get_queue_board_summary: 'queueTitle',
  get_daily_cashier_report: 'cashierTitle',
  get_appointment_load: 'loadTitle',
  list_my_patients: 'patientsTitle',
  get_patient_summary: 'patientSummaryTitle',
  list_my_appointments: 'appointmentsTitle',
};

const TITLE_KEY_BY_KIND: Readonly<Record<ParsedToolResult['kind'], ToolResultTitleKey | null>> = {
  STOCK: 'stockTitle',
  EXPIRY: 'expiryTitle',
  QUEUE: 'queueTitle',
  CASHIER: 'cashierTitle',
  APPOINTMENT_LOAD: 'loadTitle',
  // Both failure variants carry the tool name instead, which is more specific
  // than anything the kind alone could say.
  FAILED: null,
  UNRENDERABLE: null,
};

/** The message key for a lookup card's heading. */
export function resolveToolResultTitleKey(toolResult: ParsedToolResult): ToolResultTitleKey {
  const keyForKind = TITLE_KEY_BY_KIND[toolResult.kind];
  if (keyForKind !== null) {
    return keyForKind;
  }
  const toolName = 'toolName' in toolResult ? toolResult.toolName : '';
  return TITLE_KEY_BY_TOOL_NAME[toolName] ?? 'genericTitle';
}
