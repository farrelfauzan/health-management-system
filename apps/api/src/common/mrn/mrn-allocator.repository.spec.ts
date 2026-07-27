import { ConfigService } from '@nestjs/config';

import { MrnAllocatorRepository } from './mrn-allocator.repository';
import { MrnTransactionClient } from './mrn.types';

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string): string | undefined => overrides[key],
  } as unknown as ConfigService;
}

function buildTransactionClient(allocated?: bigint): {
  tx: MrnTransactionClient;
  queryRaw: jest.Mock;
  executeRaw: jest.Mock;
} {
  const queryRaw = jest.fn().mockResolvedValue(allocated === undefined ? [] : [{ allocated }]);
  const executeRaw = jest.fn().mockResolvedValue(1);
  return {
    tx: { $queryRaw: queryRaw, $executeRaw: executeRaw } as unknown as MrnTransactionClient,
    queryRaw,
    executeRaw,
  };
}

describe('MrnAllocatorRepository', () => {
  describe('configuration', () => {
    it('defaults to an unprefixed eight-digit sequence', () => {
      const repository = new MrnAllocatorRepository(buildConfigService());
      expect(repository.formatMrn(12345n)).toBe('00012345');
    });

    it('applies a configured prefix and width', () => {
      const repository = new MrnAllocatorRepository(
        buildConfigService({ PATIENT_MRN_PREFIX: 'RM-', PATIENT_MRN_WIDTH: '6' }),
      );
      expect(repository.formatMrn(42n)).toBe('RM-000042');
    });

    it('rejects a width outside the supported range', () => {
      expect(
        () => new MrnAllocatorRepository(buildConfigService({ PATIENT_MRN_WIDTH: '2' })),
      ).toThrow(/PATIENT_MRN_WIDTH/);
    });

    it('rejects a prefix with unsupported characters', () => {
      expect(
        () => new MrnAllocatorRepository(buildConfigService({ PATIENT_MRN_PREFIX: 'rm_' })),
      ).toThrow(/PATIENT_MRN_PREFIX/);
    });
  });

  describe('formatMrn', () => {
    it('never truncates a sequence wider than the padding', () => {
      const repository = new MrnAllocatorRepository(buildConfigService({ PATIENT_MRN_WIDTH: '4' }));
      expect(repository.formatMrn(1234567n)).toBe('1234567');
    });
  });

  describe('extractSequence', () => {
    const repository = new MrnAllocatorRepository(buildConfigService({ PATIENT_MRN_PREFIX: 'RM-' }));

    it('reads the numeric part of a generated MRN', () => {
      expect(repository.extractSequence('RM-00000099')).toBe(99n);
    });

    it('ignores an MRN that does not carry the configured prefix', () => {
      expect(repository.extractSequence('LEGACY-0001')).toBeNull();
    });

    it('ignores a non-numeric body', () => {
      expect(repository.extractSequence('RM-000A99')).toBeNull();
    });

    it('ignores a digit run too long to be a counter value', () => {
      expect(repository.extractSequence(`RM-${'9'.repeat(19)}`)).toBeNull();
    });
  });

  describe('allocateMrn', () => {
    it('formats the value returned by the atomic update', async () => {
      const repository = new MrnAllocatorRepository(buildConfigService());
      const { tx, queryRaw } = buildTransactionClient(7n);

      const actualMrn = await repository.allocateMrn(tx);

      expect(actualMrn).toBe('00000007');
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });

    it('fails loudly when the counter row is missing', async () => {
      const repository = new MrnAllocatorRepository(buildConfigService());
      const { tx } = buildTransactionClient();

      await expect(repository.allocateMrn(tx)).rejects.toThrow(/counter row is missing/);
    });
  });

  describe('raiseCounterAbove', () => {
    it('lifts the counter past an imported MRN', async () => {
      const repository = new MrnAllocatorRepository(buildConfigService());
      const { tx, executeRaw } = buildTransactionClient();

      await repository.raiseCounterAbove(tx, '00004200');

      expect(executeRaw).toHaveBeenCalledTimes(1);
      expect(executeRaw.mock.calls[0].slice(1)).toContain(4200n);
    });

    it('leaves the counter alone for an MRN it could never allocate', async () => {
      const repository = new MrnAllocatorRepository(buildConfigService());
      const { tx, executeRaw } = buildTransactionClient();

      await repository.raiseCounterAbove(tx, 'K7QP2M9X');

      expect(executeRaw).not.toHaveBeenCalled();
    });
  });
});
