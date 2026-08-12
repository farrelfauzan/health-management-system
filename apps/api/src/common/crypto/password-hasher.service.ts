import { Algorithm, hash, verify } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';

/**
 * Argon2id parameters (SJ-7). Measured at ~90–125 ms per hash on an Apple
 * Silicon dev machine and ~110 ms on the CI runner, inside the 100–300 ms band
 * the ticket asks for: slow enough that offline cracking is expensive, fast
 * enough that a clinic's morning login rush is not.
 *
 * The numbers live here rather than inline because raising them is the
 * intended response to faster hardware, and because every one of them is
 * encoded into the hash string — so a row hashed under the old settings stays
 * verifiable and is upgraded on the owner's next login.
 *
 * `memoryCost` is the parameter that matters against GPU attacks; 64 MiB is
 * the OWASP floor for Argon2id at t=3.
 */
const ARGON2_PARAMS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const;

/**
 * A hash of a password nobody has. Verified against whenever the account does
 * not exist, so an unknown email costs the same wall-clock time as a wrong
 * password — see {@link PasswordHasherService.verifyAgainstDummy}.
 *
 * Generated once at module load rather than checked in, because a fixed hash
 * in the repository is a fixed target: an attacker who recognises it in a
 * timing trace learns the account does not exist, which is the leak this is
 * supposed to close.
 */
const DUMMY_HASH_PROMISE = hash(
  'a password that exists only to burn the same milliseconds',
  ARGON2_PARAMS,
);

const ARGON2ID_PREFIX = '$argon2id$';

/**
 * Password hashing for the whole API (SJ-7).
 *
 * Handles two formats on purpose. Everything written from now on is Argon2id;
 * everything written before this ticket is bcrypt, and those rows are upgraded
 * silently as their owners log in. A forced reset would have been the
 * alternative, and it trades a real security improvement for a support burden
 * that lands on the clinic rather than the attacker.
 */
@Injectable()
export class PasswordHasherService {
  async hashPassword(plainPassword: string): Promise<string> {
    return hash(plainPassword, ARGON2_PARAMS);
  }

  /**
   * True when the password matches. Never throws on a malformed stored hash —
   * a corrupt row must read as "wrong password", not as a 500 that tells the
   * caller their account is special.
   */
  async verifyPassword(storedHash: string, plainPassword: string): Promise<boolean> {
    try {
      if (storedHash.startsWith(ARGON2ID_PREFIX)) {
        return await verify(storedHash, plainPassword);
      }
      if (isBcryptHash(storedHash)) {
        const { compare } = await import('bcryptjs');
        return await compare(plainPassword, storedHash);
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Burns a comparable amount of time when there is no account to check
   * against, so "no such user" and "wrong password" are indistinguishable by
   * stopwatch as well as by response body.
   *
   * Not perfectly constant — Argon2 timing varies by a few milliseconds run to
   * run, and a bcrypt row costs differently again — but it removes the
   * order-of-magnitude difference between "hash a password" and "return
   * immediately", which is the one an attacker can actually measure over the
   * internet.
   */
  async verifyAgainstDummy(plainPassword: string): Promise<false> {
    try {
      await verify(await DUMMY_HASH_PROMISE, plainPassword);
    } catch {
      // Deliberately swallowed: the result is discarded either way.
    }
    return false;
  }

  /**
   * True when the stored hash should be replaced — a bcrypt survivor, or an
   * Argon2id hash written under weaker parameters than the current ones.
   *
   * Parameters are read out of the hash string rather than assumed, which is
   * what makes raising {@link ARGON2_PARAMS} self-applying: every login after
   * the change re-hashes anything below the new floor.
   */
  needsRehash(storedHash: string): boolean {
    if (!storedHash.startsWith(ARGON2ID_PREFIX)) {
      return true;
    }
    const parameters = parseArgon2Parameters(storedHash);
    if (!parameters) {
      return true;
    }
    return (
      parameters.memoryCost < ARGON2_PARAMS.memoryCost ||
      parameters.timeCost < ARGON2_PARAMS.timeCost ||
      parameters.parallelism !== ARGON2_PARAMS.parallelism
    );
  }
}

function isBcryptHash(storedHash: string): boolean {
  return /^\$2[aby]?\$/.test(storedHash);
}

function parseArgon2Parameters(
  storedHash: string,
): { memoryCost: number; timeCost: number; parallelism: number } | null {
  const match = /\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(storedHash);
  if (!match?.[1] || !match?.[2] || !match?.[3]) {
    return null;
  }
  return {
    memoryCost: Number(match[1]),
    timeCost: Number(match[2]),
    parallelism: Number(match[3]),
  };
}
