import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BpjsAntreanInboundReadiness } from '@hms/shared-types';

import { IpAllowlistEntry, parseIpAllowlistEntry } from './parse-ip-allowlist';

const DEFAULT_TOKEN_LIFETIME_SECONDS = 3_600;
const MAX_TOKEN_LIFETIME_SECONDS = 86_400;
const DEFAULT_READ_REQUESTS_PER_MINUTE = 120;
const DEFAULT_WRITE_REQUESTS_PER_MINUTE = 30;
const DEFAULT_TOKEN_REQUESTS_PER_MINUTE = 10;
const DEFAULT_AVERAGE_SERVICE_MINUTES = 15;

/**
 * Deployment configuration for the inbound Antrean surface (P14-T04), and the
 * thing that decides whether that surface exists at all.
 *
 * **The surface is dark unless an operator lights it.** `isEnabled` is false
 * until `BPJS_ANTREAN_INBOUND_ALLOWED_IPS` names at least one range, and the
 * guards refuse every request while it is false — before any parsing, any
 * credential comparison, and any domain call. This is deliberate and it is
 * the reason this module can be merged while spike questions Q4, Q5 and Q6
 * are still open (`docs/post-mvp/bpjs-antrean-spike.md`): the endpoints exist
 * as code and refuse as deployed, and a clinic gets a public write path only
 * when someone types BPJS's published ranges into their environment.
 *
 * A malformed range is a **startup failure**, not a skipped entry. An
 * allowlist that quietly drops what it could not parse is an allowlist the
 * operator no longer knows the contents of.
 */
@Injectable()
export class BpjsAntreanInboundConfig {
  private readonly allowlist: readonly IpAllowlistEntry[];
  readonly trustedProxyHopCount: number;
  readonly tokenLifetimeSeconds: number;
  readonly readRequestsPerMinute: number;
  readonly writeRequestsPerMinute: number;
  readonly tokenRequestsPerMinute: number;
  /**
   * Minutes per patient used to estimate `estimasidilayani` (§3.6). HMS
   * measures nothing about how long a consultation takes, so this is a
   * configured constant and honestly labelled as one — session start plus
   * (position × this) — rather than a computed figure dressed up as a
   * measurement. A per-doctor observed average is the later refinement, once
   * encounter durations have accumulated.
   */
  readonly averageServiceMinutes: number;

  constructor(configService: ConfigService) {
    this.allowlist = this.readAllowlist(configService);
    this.trustedProxyHopCount = this.readCount(
      configService,
      'BPJS_ANTREAN_INBOUND_TRUSTED_PROXY_HOPS',
      0,
    );
    this.tokenLifetimeSeconds = this.readTokenLifetime(configService);
    this.readRequestsPerMinute = this.readCount(
      configService,
      'BPJS_ANTREAN_INBOUND_READ_RPM',
      DEFAULT_READ_REQUESTS_PER_MINUTE,
    );
    this.writeRequestsPerMinute = this.readCount(
      configService,
      'BPJS_ANTREAN_INBOUND_WRITE_RPM',
      DEFAULT_WRITE_REQUESTS_PER_MINUTE,
    );
    this.tokenRequestsPerMinute = this.readCount(
      configService,
      'BPJS_ANTREAN_INBOUND_TOKEN_RPM',
      DEFAULT_TOKEN_REQUESTS_PER_MINUTE,
    );
    this.averageServiceMinutes = this.readCount(
      configService,
      'BPJS_ANTREAN_AVERAGE_SERVICE_MINUTES',
      DEFAULT_AVERAGE_SERVICE_MINUTES,
    );
  }

  /**
   * Whether the inbound surface accepts anything at all. Tied to the
   * allowlist rather than to a separate feature flag on purpose: two switches
   * where one must be on and the other must be populated is one switch too
   * many, and the failure mode of getting it wrong is a public write path.
   */
  get isEnabled(): boolean {
    return this.allowlist.length > 0;
  }

  get allowedSourceRanges(): readonly IpAllowlistEntry[] {
    return this.allowlist;
  }

  /** Operator-facing readiness, for the settings screen and the ops runbook. */
  buildReadiness(hasInboundCredentials: boolean): BpjsAntreanInboundReadiness {
    return {
      isEnabled: this.isEnabled && hasInboundCredentials,
      hasSourceIpAllowlist: this.allowlist.length > 0,
      allowedSourceRangeCount: this.allowlist.length,
      hasInboundCredentials,
      tokenLifetimeSeconds: this.tokenLifetimeSeconds,
      trustedProxyHopCount: this.trustedProxyHopCount,
    };
  }

  private readAllowlist(configService: ConfigService): readonly IpAllowlistEntry[] {
    const rawValue = configService.get<string>('BPJS_ANTREAN_INBOUND_ALLOWED_IPS')?.trim();
    if (rawValue === undefined || rawValue === '') {
      return [];
    }
    return rawValue
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
      .map((entry) => this.parseEntryOrThrow(entry));
  }

  private parseEntryOrThrow(entry: string): IpAllowlistEntry {
    const parsed = parseIpAllowlistEntry(entry);
    if (parsed === null) {
      throw new Error(
        `BPJS_ANTREAN_INBOUND_ALLOWED_IPS contains an entry that is not an IP address or CIDR range: "${entry}"`,
      );
    }
    return parsed;
  }

  private readTokenLifetime(configService: ConfigService): number {
    const lifetime = this.readCount(
      configService,
      'BPJS_ANTREAN_INBOUND_TOKEN_TTL_SECONDS',
      DEFAULT_TOKEN_LIFETIME_SECONDS,
    );
    if (lifetime > MAX_TOKEN_LIFETIME_SECONDS) {
      throw new Error(
        `BPJS_ANTREAN_INBOUND_TOKEN_TTL_SECONDS must not exceed ${MAX_TOKEN_LIFETIME_SECONDS} seconds`,
      );
    }
    return lifetime;
  }

  private readCount(configService: ConfigService, key: string, fallback: number): number {
    const rawValue = configService.get<string>(key)?.trim();
    if (rawValue === undefined || rawValue === '') {
      return fallback;
    }
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`${key} must be a non-negative integer`);
    }
    return parsed;
  }
}
