import { readFileSync } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { COMMON_BREACHED_PASSWORDS } from './common-breached-passwords';
import { buildSafeErrorLog } from '../observability/safe-logging';

/**
 * Rejects passwords that appear in breach corpora (SJ-7).
 *
 * NIST 800-63B's position, which this follows: composition rules (a digit, a
 * symbol, a capital) push people towards `Password1!` and buy nothing, while
 * checking the password against what attackers actually guess buys most of the
 * protection. So the only rules are a length floor and this list.
 *
 * **The built-in list is a few hundred entries, not the top ten thousand.**
 * It covers the passwords that dominate real credential-stuffing traffic, and
 * it is deliberately vendored rather than fetched — a clinic server is
 * expected to run without internet access, which also rules out the Pwned
 * Passwords range API. Point `BREACHED_PASSWORD_LIST_PATH` at a full
 * SecLists-style file to replace it; see docs/security/password-policy.md.
 *
 * Matching is case-insensitive because `PASSWORD` is not meaningfully stronger
 * than `password`, and an attacker's dictionary is case-folded too.
 */
@Injectable()
export class BreachedPasswordCheckerService {
  private readonly logger = new Logger(BreachedPasswordCheckerService.name);
  private readonly deniedPasswords: ReadonlySet<string>;

  constructor(configService: ConfigService) {
    this.deniedPasswords = this.loadDeniedPasswords(
      configService.get<string>('BREACHED_PASSWORD_LIST_PATH'),
    );
  }

  isBreached(plainPassword: string): boolean {
    return this.deniedPasswords.has(plainPassword.trim().toLowerCase());
  }

  /** How many entries are actually loaded — surfaced so the size is auditable. */
  get deniedPasswordCount(): number {
    return this.deniedPasswords.size;
  }

  private loadDeniedPasswords(listPath: string | undefined): ReadonlySet<string> {
    const builtIn = COMMON_BREACHED_PASSWORDS.map((password) => password.toLowerCase());
    if (!listPath) {
      return new Set(builtIn);
    }
    try {
      const fileEntries = readFileSync(listPath, 'utf8')
        .split('\n')
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line.length > 0);
      this.logger.log(`Loaded ${fileEntries.length} breached passwords from ${listPath}`);
      return new Set([...builtIn, ...fileEntries]);
    } catch {
      // A missing or unreadable file must not take the API down, but it must
      // not silently weaken the check either — hence the warning and the
      // built-in fallback.
      this.logger.warn(buildSafeErrorLog('breached_password_list_unreadable', { listPath }));
      return new Set(builtIn);
    }
  }
}
