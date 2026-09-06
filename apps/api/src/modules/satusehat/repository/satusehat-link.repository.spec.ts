import { NationalIdentifierCryptoService } from '../../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SatusehatLinkRepository } from './satusehat-link.repository';

describe('SatusehatLinkRepository', () => {
  const patientId = 'f5e4d3c2-b1a0-4918-a7b6-c5d4e3f2a1b0';
  const ihsNumber = 'P02478375538';
  const updateMock = jest.fn();
  const prismaMock = {
    patientProfile: { update: updateMock },
    doctorProfile: { update: jest.fn() },
    findFirstActive: jest.fn(),
  } as unknown as PrismaService;
  const cryptoMock = {
    encryptSealedIdentifier: jest.fn(() => ({
      ciphertext: 'sealed-ciphertext',
      last4: '5538',
      keyVersion: 3,
    })),
    decryptIdentifier: jest.fn(),
  } as unknown as NationalIdentifierCryptoService;
  const repository = new SatusehatLinkRepository(prismaMock, cryptoMock);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes the ciphertext, key version and partial value in one update', async () => {
    await repository.savePatientIhsNumber({ patientId, ihsNumber });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: patientId },
      data: {
        satusehatPatientIdCiphertext: 'sealed-ciphertext',
        satusehatPatientIdKeyVersion: 3,
        satusehatPatientIdLast4: '5538',
      },
    });
  });

  it('derives the partial value from the plaintext, never from the ciphertext', async () => {
    await repository.savePatientIhsNumber({ patientId, ihsNumber });

    expect(cryptoMock.encryptSealedIdentifier).toHaveBeenCalledWith(ihsNumber);
    const written = updateMock.mock.calls[0]?.[0] as {
      data: { satusehatPatientIdLast4: string };
    };
    expect(ihsNumber.endsWith(written.data.satusehatPatientIdLast4)).toBe(true);
  });
});
