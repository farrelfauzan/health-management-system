import type {
  CheckMedicationExpiryToolResult,
  CheckMedicationStockToolResult,
  GetAppointmentLoadToolResult,
  GetDailyCashierReportToolResult,
  GetQueueBoardSummaryToolResult,
} from '@hms/shared-types';

/**
 * A tool lookup as the thread renders it. The raw `meta.toolResults` entry
 * types its payload as `unknown` — the envelope is one shape for every tool —
 * so it is parsed once at the boundary against the tool's own output schema
 * and the components downstream receive something already narrowed.
 *
 * Every admin-channel tool has a variant here on purpose. In Mode A the
 * lookup *is* the answer, so a tool with no variant renders as UNRENDERABLE —
 * a card that says nothing — and the whole exchange reads as a failure even
 * though the data arrived intact. Adding a tool means adding its variant and
 * its component in the same change.
 *
 * The two failure variants are deliberately distinct. `FAILED` means the
 * lookup did not run or was refused, which the server told us; `UNRENDERABLE`
 * means it ran and returned something this client cannot lay out — a version
 * skew between web and API. Both render as themselves (ai-chatbot-tools.md
 * §4.5): a lookup that produced nothing must never be dressed up as an
 * answer.
 */
export type ParsedToolResult =
  | { kind: 'STOCK'; result: CheckMedicationStockToolResult }
  | { kind: 'EXPIRY'; result: CheckMedicationExpiryToolResult }
  | { kind: 'QUEUE'; result: GetQueueBoardSummaryToolResult }
  | { kind: 'CASHIER'; result: GetDailyCashierReportToolResult }
  | { kind: 'APPOINTMENT_LOAD'; result: GetAppointmentLoadToolResult }
  | { kind: 'FAILED'; toolName: string; errorCode: string | null }
  | { kind: 'UNRENDERABLE'; toolName: string };
