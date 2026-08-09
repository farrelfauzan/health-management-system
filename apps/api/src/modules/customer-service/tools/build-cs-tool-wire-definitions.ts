import { zodToJsonSchema } from 'zod-to-json-schema';

import { ChatToolWireDefinition } from '../../ai-chatbot/infrastructure/ai-provider.types';
import { CsTool } from './cs-tool.interface';

/**
 * Serializes the channel's tools into the JSON-Schema wire form.
 *
 * The same "one definition, no drift" seam the in-app registry uses: the
 * schema the model reads is derived from the very Zod object dispatch
 * validates against, so the two cannot disagree — which is what makes
 * "`book_appointment` has no NIK parameter" a statement about the model's view
 * of the tool and not just about ours.
 *
 * `$refStrategy: 'none'` inlines everything, because providers read a
 * self-contained parameters object rather than a document with internal
 * references, and the `$schema` marker is dropped since it describes the
 * document rather than the arguments.
 */
export function buildCsToolWireDefinitions(tools: readonly CsTool[]): ChatToolWireDefinition[] {
  return tools.map((tool) => {
    const { $schema, ...parameters } = zodToJsonSchema(tool.argumentSchema, {
      $refStrategy: 'none',
    }) as Record<string, unknown>;
    void $schema;
    return { name: tool.name, description: tool.description, parameters };
  });
}
