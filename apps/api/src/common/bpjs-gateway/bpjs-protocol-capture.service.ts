import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { buildSafeErrorLog } from '../observability/safe-logging';
import {
  redactCapturedHeaders,
  redactCapturedPayload,
  truncateCapturedBody,
} from './redact-bpjs-protocol-capture';

const CAPTURE_DIRECTORY_KEY = 'BPJS_PROTOCOL_CAPTURE_DIR';
const CAPTURE_FILE_NAME = 'bpjs-protocol-capture.ndjson';

export type BpjsProtocolCaptureRecord = {
  readonly service: string;
  readonly direction: 'OUTBOUND' | 'INBOUND';
  readonly method: string;
  readonly path: string;
  readonly statusCode: number | null;
  readonly requestHeaders?: Readonly<Record<string, string>>;
  readonly requestBody?: unknown;
  /** The response exactly as it arrived — encrypted, for the outbound direction. */
  readonly rawResponseBody?: string;
  readonly decodedResponse?: unknown;
  readonly outcome: 'ACCEPTED' | 'REJECTED';
  readonly failureReason?: string;
};

/**
 * Records real BPJS traffic during UAT so `P14-T02`'s fixtures can be
 * *evidence* rather than a restatement of what HMS already believes
 * (P14-T06).
 *
 * The spike is explicit about why this exists: *"No hand-written fixtures. A
 * fixture is evidence. One assembled from a reading of the spec is a
 * restatement of the hypothesis wearing evidence's clothes, and it will pass
 * every test written against it."* Every protocol fact in Phase 14 —
 * the endpoint set, the field names, the codec, the `metaData` casing, the
 * failure taxonomy — is currently a hypothesis, and this is the instrument
 * that settles them in one UAT session instead of one guess at a time.
 *
 * **Off unless an operator turns it on.** With `BPJS_PROTOCOL_CAPTURE_DIR`
 * unset nothing is written and nothing is even formatted, so a production
 * deployment carries no cost and — more to the point — never writes BPJS
 * traffic to disk. It is a UAT instrument, not telemetry.
 *
 * **Capture can never break a call.** Every failure here is swallowed and
 * logged. Losing a fixture is a bad afternoon; failing a member's booking
 * because a disk was full is a patient standing at a counter.
 *
 * Redaction happens before anything reaches the file — no card numbers, no
 * NIK, no names, no credentials or derived keys, per the spike's §3 rule.
 */
@Injectable()
export class BpjsProtocolCaptureService {
  private readonly logger = new Logger(BpjsProtocolCaptureService.name);
  private readonly captureDirectory: string | null;
  private hasEnsuredDirectory = false;

  constructor(configService: ConfigService) {
    const configured = configService.get<string>(CAPTURE_DIRECTORY_KEY)?.trim();
    this.captureDirectory = configured === undefined || configured === '' ? null : configured;
    if (this.captureDirectory !== null) {
      // Loud on purpose. An operator who leaves this on after UAT should be
      // told at every boot that the deployment is writing BPJS traffic to disk.
      this.logger.warn(
        `BPJS protocol capture is ENABLED and writing to ${this.captureDirectory} — turn it off after UAT`,
      );
    }
  }

  get isEnabled(): boolean {
    return this.captureDirectory !== null;
  }

  async record(capture: BpjsProtocolCaptureRecord): Promise<void> {
    if (this.captureDirectory === null) {
      return;
    }
    try {
      await this.appendRecord(this.captureDirectory, capture);
    } catch (caughtError) {
      this.logger.error(
        buildSafeErrorLog('bpjs_protocol_capture_failed', {
          service: capture.service,
          path: capture.path,
          errorName: caughtError instanceof Error ? caughtError.name : 'UnknownError',
        }),
      );
    }
  }

  private async appendRecord(
    directory: string,
    capture: BpjsProtocolCaptureRecord,
  ): Promise<void> {
    if (!this.hasEnsuredDirectory) {
      await mkdir(directory, { recursive: true });
      this.hasEnsuredDirectory = true;
    }
    const line = JSON.stringify({
      capturedAt: new Date().toISOString(),
      redacted: true,
      service: capture.service,
      direction: capture.direction,
      method: capture.method,
      path: capture.path,
      statusCode: capture.statusCode,
      outcome: capture.outcome,
      failureReason: capture.failureReason,
      requestHeaders:
        capture.requestHeaders === undefined
          ? undefined
          : redactCapturedHeaders(capture.requestHeaders),
      requestBody:
        capture.requestBody === undefined ? undefined : redactCapturedPayload(capture.requestBody),
      rawResponseBody:
        capture.rawResponseBody === undefined
          ? undefined
          : truncateCapturedBody(capture.rawResponseBody),
      decodedResponse:
        capture.decodedResponse === undefined
          ? undefined
          : redactCapturedPayload(capture.decodedResponse),
    });
    await appendFile(join(directory, CAPTURE_FILE_NAME), `${line}\n`, 'utf8');
  }
}
