import { hash as bcryptHash } from 'bcryptjs';

import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService', () => {
  const service = new PasswordHasherService();
  const INPUT_PASSWORD = 'correct horse battery staple';

  describe('hashing', () => {
    it('writes an Argon2id hash carrying its own parameters', async () => {
      const actualHash = await service.hashPassword(INPUT_PASSWORD);

      expect(actualHash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
    });

    it('salts, so the same password never hashes to the same string twice', async () => {
      const [first, second] = await Promise.all([
        service.hashPassword(INPUT_PASSWORD),
        service.hashPassword(INPUT_PASSWORD),
      ]);

      expect(first).not.toBe(second);
    });

    it('round-trips the password it hashed and refuses anything else', async () => {
      const actualHash = await service.hashPassword(INPUT_PASSWORD);

      await expect(service.verifyPassword(actualHash, INPUT_PASSWORD)).resolves.toBe(true);
      await expect(service.verifyPassword(actualHash, 'not the password')).resolves.toBe(false);
    });
  });

  /**
   * Every account predating SJ-7 holds a bcrypt hash. If verification could not
   * read them, this ticket would be a forced password reset for the entire
   * clinic on the morning it deployed.
   */
  describe('legacy bcrypt hashes', () => {
    it('verifies a bcrypt hash written before this ticket', async () => {
      const legacyHash = await bcryptHash(INPUT_PASSWORD, 4);

      await expect(service.verifyPassword(legacyHash, INPUT_PASSWORD)).resolves.toBe(true);
      await expect(service.verifyPassword(legacyHash, 'wrong')).resolves.toBe(false);
    });

    it('marks a bcrypt hash for upgrade', async () => {
      const legacyHash = await bcryptHash(INPUT_PASSWORD, 4);

      expect(service.needsRehash(legacyHash)).toBe(true);
    });
  });

  describe('rehash detection', () => {
    it('leaves a current-parameter hash alone', async () => {
      const currentHash = await service.hashPassword(INPUT_PASSWORD);

      expect(service.needsRehash(currentHash)).toBe(false);
    });

    /**
     * Raising the cost constants has to be self-applying, or the tuning knob
     * only ever affects accounts created after the change.
     */
    it('marks a hash written under weaker parameters for upgrade', () => {
      const weakerHash = '$argon2id$v=19$m=4096,t=2,p=4$c29tZXNhbHQ$aGFzaA';

      expect(service.needsRehash(weakerHash)).toBe(true);
    });

    it('marks an unreadable hash for upgrade rather than trusting it', () => {
      expect(service.needsRehash('$argon2id$totally-malformed')).toBe(true);
      expect(service.needsRehash('')).toBe(true);
    });
  });

  describe('failure handling', () => {
    it('treats a corrupt stored hash as a wrong password, not an error', async () => {
      await expect(service.verifyPassword('$argon2id$garbage', INPUT_PASSWORD)).resolves.toBe(
        false,
      );
      await expect(service.verifyPassword('', INPUT_PASSWORD)).resolves.toBe(false);
      await expect(service.verifyPassword('plaintext-somehow', INPUT_PASSWORD)).resolves.toBe(
        false,
      );
    });

    it('always reports failure for the dummy verification', async () => {
      await expect(service.verifyAgainstDummy(INPUT_PASSWORD)).resolves.toBe(false);
    });

    /**
     * The point of the dummy hash: an unknown account must not answer faster
     * than a known one. The bound is deliberately loose — this asserts the
     * order-of-magnitude gap is gone, not that timing is constant, which no
     * test on a shared CI runner could claim honestly.
     */
    it('spends real time on an unknown account, not none', async () => {
      // Warm the lazily-created dummy hash so the measurement is of a verify,
      // not of the one-off hash that backs it.
      await service.verifyAgainstDummy('warmup');
      const startedAt = process.hrtime.bigint();

      await service.verifyAgainstDummy(INPUT_PASSWORD);

      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      expect(elapsedMs).toBeGreaterThan(10);
    });
  });
});
