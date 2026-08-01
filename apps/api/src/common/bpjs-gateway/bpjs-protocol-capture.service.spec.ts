import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';

import { BpjsProtocolCaptureService } from './bpjs-protocol-capture.service';

const CAPTURE_FILE_NAME = 'bpjs-protocol-capture.ndjson';

function buildService(captureDirectory?: string): BpjsProtocolCaptureService {
  return new BpjsProtocolCaptureService(
    new ConfigService(
      captureDirectory === undefined ? {} : { BPJS_PROTOCOL_CAPTURE_DIR: captureDirectory },
    ),
  );
}

describe('BpjsProtocolCaptureService', () => {
  it('is off unless an operator configures a directory', async () => {
    // The default state on every deployment. Production must never write BPJS
    // traffic to disk as a side effect of shipping the instrument.
    const service = buildService();

    expect(service.isEnabled).toBe(false);
    await expect(
      service.record({
        service: 'BPJS Antrean',
        direction: 'OUTBOUND',
        method: 'GET',
        path: 'ref/poli',
        statusCode: 200,
        outcome: 'ACCEPTED',
      }),
    ).resolves.toBeUndefined();
  });

  it('treats a blank directory as off', () => {
    expect(buildService('   ').isEnabled).toBe(false);
  });

  it('writes one redacted NDJSON line per exchange', async () => {
    const captureDirectory = await mkdtemp(join(tmpdir(), 'bpjs-capture-'));
    const service = buildService(captureDirectory);

    await service.record({
      service: 'BPJS Antrean',
      direction: 'OUTBOUND',
      method: 'POST',
      path: 'antrean/add',
      statusCode: 200,
      requestHeaders: { 'X-Signature': 'secret-signature', 'X-Timestamp': '1775000000' },
      requestBody: { nomorkartu: '0001234567890', kodepoli: '001' },
      rawResponseBody: 'encrypted-blob',
      decodedResponse: { metaData: { code: 200, message: 'Ok' } },
      outcome: 'ACCEPTED',
    });

    const written = await readFile(join(captureDirectory, CAPTURE_FILE_NAME), 'utf8');
    const actual = JSON.parse(written.trim());
    expect(actual.redacted).toBe(true);
    expect(actual.path).toBe('antrean/add');
    // Credentials out, the timestamp that keys the codec in.
    expect(actual.requestHeaders['X-Signature']).toBe('[redacted]');
    expect(actual.requestHeaders['X-Timestamp']).toBe('1775000000');
    expect(actual.requestBody.nomorkartu).not.toBe('0001234567890');
    expect(actual.requestBody.kodepoli).toBe('001');
    // The encrypted body is the actual evidence of the codec and is kept as-is.
    expect(actual.rawResponseBody).toBe('encrypted-blob');
  });

  it('appends rather than overwriting, so a session builds one file', async () => {
    const captureDirectory = await mkdtemp(join(tmpdir(), 'bpjs-capture-'));
    const service = buildService(captureDirectory);

    await service.record({
      service: 'BPJS Antrean',
      direction: 'OUTBOUND',
      method: 'GET',
      path: 'ref/poli',
      statusCode: 200,
      outcome: 'ACCEPTED',
    });
    await service.record({
      service: 'BPJS Antrean',
      direction: 'INBOUND',
      method: 'POST',
      path: '/api/v1/bpjs/antrean/ws/ambil-antrean',
      statusCode: 200,
      outcome: 'ACCEPTED',
    });

    const written = await readFile(join(captureDirectory, CAPTURE_FILE_NAME), 'utf8');
    expect(written.trim().split('\n')).toHaveLength(2);
  });

  it('records a rejected exchange, because the failure taxonomy is a fixture too', async () => {
    // The spike wants every error envelope observed, so the taxonomy is built
    // from real codes rather than guessed ones.
    const captureDirectory = await mkdtemp(join(tmpdir(), 'bpjs-capture-'));
    const service = buildService(captureDirectory);

    await service.record({
      service: 'BPJS Antrean',
      direction: 'OUTBOUND',
      method: 'POST',
      path: 'antrean/add',
      statusCode: 400,
      rawResponseBody: 'blob',
      outcome: 'REJECTED',
      failureReason: 'BPJS_ANTREAN_DECRYPT_FAILED',
    });

    const actual = JSON.parse(
      (await readFile(join(captureDirectory, CAPTURE_FILE_NAME), 'utf8')).trim(),
    );
    expect(actual.outcome).toBe('REJECTED');
    expect(actual.failureReason).toBe('BPJS_ANTREAN_DECRYPT_FAILED');
  });

  it('never throws when the directory cannot be written', async () => {
    // Losing a fixture is a bad afternoon; failing a member's booking because
    // a disk was full is a patient standing at a counter.
    const service = buildService('/proc/definitely-not-writable/bpjs-capture');

    await expect(
      service.record({
        service: 'BPJS Antrean',
        direction: 'OUTBOUND',
        method: 'GET',
        path: 'ref/poli',
        statusCode: 200,
        outcome: 'ACCEPTED',
      }),
    ).resolves.toBeUndefined();
  });
});
