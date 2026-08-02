import { zodToJsonSchema } from 'zod-to-json-schema';

import { ChatToolWireDefinition } from '../infrastructure/ai-provider.types';
import { ChatTool } from './chat-tool.interface';

/**
 * Serializes the offered tools into the JSON-Schema wire form. This is the
 * "one definition, no drift" seam (ai-chatbot-tools.md §4.2): the schema the
 * model reads is derived from the very Zod object dispatch validates
 * against, so they cannot disagree. `$refStrategy: 'none'` inlines
 * everything — providers read a self-contained parameters object, not a
 * document with internal references — and the `$schema` marker is dropped
 * because it describes the document, not the arguments.
 */
export function buildChatToolWireDefinitions(
  tools: readonly ChatTool[],
): ChatToolWireDefinition[] {
  return tools.map((tool) => {
    const { $schema, ...parameters } = zodToJsonSchema(tool.argumentSchema, {
      $refStrategy: 'none',
    }) as Record<string, unknown>;
    void $schema;
    return { name: tool.name, description: tool.description, parameters };
  });
}
