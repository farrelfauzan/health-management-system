import type { ParsedToolResult } from '#lib/ai-assistant/parsed-tool-result';

export type ToolResultScope = {
  key: 'allMedications' | 'searchedFor' | 'throughDate' | 'onDate' | 'dateRange';
  values: Record<string, string | number>;
};

/**
 * The "what was actually asked" line in a lookup card's header — the date,
 * the window, or the search term the result covers.
 *
 * It is what makes a wrong tool choice visible immediately (§4.7): an admin
 * who asked about today and sees a cashier card headed with yesterday's date
 * spots it without checking a single number. Returns null for a lookup with
 * no scope worth stating, so the header simply carries none.
 */
export function resolveToolResultScope(toolResult: ParsedToolResult): ToolResultScope | null {
  switch (toolResult.kind) {
    case 'STOCK':
      return toolResult.result.medicationName === null
        ? { key: 'allMedications', values: {} }
        : { key: 'searchedFor', values: { medicationName: toolResult.result.medicationName } };
    case 'EXPIRY':
      return { key: 'throughDate', values: { throughDate: toolResult.result.throughDate } };
    case 'QUEUE':
      return { key: 'onDate', values: { date: toolResult.result.date } };
    case 'CASHIER':
      return { key: 'onDate', values: { date: toolResult.result.date } };
    case 'APPOINTMENT_LOAD':
      return { key: 'dateRange', values: { from: toolResult.result.from, to: toolResult.result.to } };
    default:
      return null;
  }
}
