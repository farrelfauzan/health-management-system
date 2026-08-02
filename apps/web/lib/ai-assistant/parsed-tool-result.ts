import type {
  CheckMedicationExpiryToolResult,
  CheckMedicationStockToolResult,
} from '@hms/shared-types';

/**
 * A tool lookup as the thread renders it. The raw `meta.toolResults` entry
 * types its payload as `unknown` — the envelope is one shape for every tool —
 * so it is parsed once at the boundary against the tool's own output schema
 * and the components downstream receive something already narrowed.
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
  | { kind: 'FAILED'; toolName: string; errorCode: string | null }
  | { kind: 'UNRENDERABLE'; toolName: string };
