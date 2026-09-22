import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { OwnAccountRepository } from './own-account.repository';

/** Sixteen digits that are nobody's number. */
const NIK_PLACEHOLDER = '0000000000000000';

function buildCrypto(): NationalIdentifierCryptoService {
  return {
    encryptSearchableIdentifier: jest.fn().mockReturnValue({
      ciphertext: 'ciphertext-bytes',
      index: 'blind-index',
      last4: '0000',
      keyVersion: 1,
    }),
  } as unknown as NationalIdentifierCryptoService;
}

function buildPrisma(update: jest.Mock): PrismaService {
  return { user: { update, findFirst: jest.fn() } } as unknown as PrismaService;
}

describe('OwnAccountRepository.saveAccountNik (P24-T15, D-039)', () => {
  it('writes ciphertext, blind index, last4 and key version — never the plaintext', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'user-1' });
    const repository = new OwnAccountRepository(buildPrisma(update), buildCrypto());

    const outcome = await repository.saveAccountNik({ userId: 'user-1', nik: NIK_PLACEHOLDER });

    expect(outcome).toBe('SAVED');
    const [[call]] = update.mock.calls as [[{ data: Record<string, unknown> }]];
    expect(call.data).toEqual({
      nikCiphertext: 'ciphertext-bytes',
      nikIndex: 'blind-index',
      nikLast4: '0000',
      nikKeyVersion: 1,
    });
    expect(JSON.stringify(call)).not.toContain(NIK_PLACEHOLDER);
  });

  it('reports a duplicate when the blind index is already taken', async () => {
    const update = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['nik_index'] } }),
      );
    const repository = new OwnAccountRepository(buildPrisma(update), buildCrypto());

    await expect(
      repository.saveAccountNik({ userId: 'user-2', nik: NIK_PLACEHOLDER }),
    ).resolves.toBe('DUPLICATE_NIK');
  });

  it('rethrows any other database failure', async () => {
    const update = jest.fn().mockRejectedValue(new Error('connection lost'));
    const repository = new OwnAccountRepository(buildPrisma(update), buildCrypto());

    await expect(
      repository.saveAccountNik({ userId: 'user-2', nik: NIK_PLACEHOLDER }),
    ).rejects.toThrow('connection lost');
  });

  it('projects the masked digits and never the sealed columns on read', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'desk@klinik.id',
      fullName: null,
      nikLast4: '0000',
    });
    const prisma = { user: { update: jest.fn(), findFirst } } as unknown as PrismaService;
    const repository = new OwnAccountRepository(prisma, buildCrypto());

    await repository.findAccountById('user-1');

    const [[call]] = findFirst.mock.calls as [[{ select: Record<string, boolean> }]];
    expect(Object.keys(call.select).sort()).toEqual(['email', 'fullName', 'id', 'nikLast4']);
  });
});
