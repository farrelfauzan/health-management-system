'use client';

import { ToolResultCard } from '#components/client/ai-assistant/tool-result-card';
import type { ParsedToolResult } from '#lib/ai-assistant/parsed-tool-result';

type ToolResultListProps = {
  toolResults: ParsedToolResult[];
};

/**
 * The lookups an assistant turn ran, rendered beneath its text. In Mode A
 * this is the answer surface rather than a transparency affordance
 * (ai-chatbot-tools.md §4.5) — the reply above was written before any row was
 * read, so this is the only part of the turn that came from the database.
 */
export function ToolResultList({ toolResults }: ToolResultListProps) {
  return (
    <div className="space-y-3">
      {toolResults.map((toolResult, index) => (
        <ToolResultCard key={`${toolResult.kind}-${index}`} toolResult={toolResult} />
      ))}
    </div>
  );
}
