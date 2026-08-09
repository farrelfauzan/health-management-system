import { searchFaqArgumentsSchema, searchFaqResultSchema } from '@hms/shared-types';

import { CustomerServiceError } from '../customer-service.error';
import { CsTool } from './cs-tool.interface';
import { CsToolRegistry } from './cs-tool.registry';
import { CsToolContext, CsToolExecution } from './cs-tool.types';

describe('CsToolRegistry', () => {
  const inputContext: CsToolContext = {
    conversationId: 'conversation-1',
    channel: 'TELEGRAM',
    externalChatId: '12345',
  };

  function buildTool(overrides: Partial<CsTool> = {}): CsTool {
    return {
      name: 'search_faq',
      description: 'test tool',
      // The real schemas, not stand-ins: the guarantees under test are
      // properties of the shipped contracts, and a test-local schema would
      // pass happily while the ones in production drifted.
      argumentSchema: searchFaqArgumentsSchema,
      resultSchema: searchFaqResultSchema,
      execute: jest
        .fn<Promise<CsToolExecution>, [CsToolContext, unknown]>()
        .mockResolvedValue({
          result: { passages: [{ documentTitle: 'Jam Buka', content: 'Senin-Jumat 08.00-16.00' }] },
        }),
      ...overrides,
    } as CsTool;
  }

  it('refuses a tool name it never registered', async () => {
    const registry = new CsToolRegistry();
    registry.registerTool(buildTool());

    // A model naming a tool from the in-app registry gains nothing here.
    await expect(
      registry.dispatchTool({
        context: inputContext,
        toolName: 'get_patient_summary',
        arguments: {},
      }),
    ).rejects.toMatchObject({ code: 'CS_TOOL_UNKNOWN' });
  });

  it('refuses arguments the schema rejects, without executing the tool', async () => {
    const mockTool = buildTool();
    const registry = new CsToolRegistry();
    registry.registerTool(mockTool);

    await expect(
      registry.dispatchTool({
        context: inputContext,
        toolName: 'search_faq',
        arguments: { query: 'a' },
      }),
    ).rejects.toBeInstanceOf(CustomerServiceError);
    expect(mockTool.execute).not.toHaveBeenCalled();
  });

  it('strips a field the output allowlist does not name', async () => {
    const registry = new CsToolRegistry();
    registry.registerTool(
      buildTool({
        execute: jest.fn().mockResolvedValue({
          result: {
            passages: [
              {
                documentTitle: 'Jam Buka',
                content: 'Senin-Jumat 08.00-16.00',
                internalChunkId: 'chunk-9',
                score: 0.87,
              },
            ],
          },
        }),
      }),
    );

    const outcome = await registry.dispatchTool({
      context: inputContext,
      toolName: 'search_faq',
      arguments: { query: 'jam buka' },
    });

    // The acceptance criterion: a field nobody listed cannot appear even when
    // the backing service returns it.
    expect(outcome.result).toEqual({
      passages: [{ documentTitle: 'Jam Buka', content: 'Senin-Jumat 08.00-16.00' }],
    });
  });

  it('refuses a result whose shape does not match at all rather than transmitting it', async () => {
    const registry = new CsToolRegistry();
    registry.registerTool(
      buildTool({ execute: jest.fn().mockResolvedValue({ result: { rows: ['anything'] } }) }),
    );

    // Fails closed: a projection that cannot parse means the tool and its
    // declared contract have drifted, and the safe reading is "do not send".
    await expect(
      registry.dispatchTool({
        context: inputContext,
        toolName: 'search_faq',
        arguments: { query: 'jam buka' },
      }),
    ).rejects.toMatchObject({ code: 'CS_TOOL_RESULT_REJECTED' });
  });

  it('carries a deterministic reply through to the caller', async () => {
    const registry = new CsToolRegistry();
    registry.registerTool(
      buildTool({
        execute: jest.fn().mockResolvedValue({
          result: { passages: [] },
          deterministicReply: 'sudah dicatat',
          pausesConversation: true,
          requestContact: true,
        }),
      }),
    );

    const outcome = await registry.dispatchTool({
      context: inputContext,
      toolName: 'search_faq',
      arguments: { query: 'jam buka' },
    });

    expect(outcome.deterministicReply).toBe('sudah dicatat');
    expect(outcome.pausesConversation).toBe(true);
    expect(outcome.requestContact).toBe(true);
  });

  it('refuses to register the same tool name twice', () => {
    const registry = new CsToolRegistry();
    registry.registerTool(buildTool());

    expect(() => registry.registerTool(buildTool())).toThrow(/already registered/);
  });
});
