import { LAB_REPORT_CONFIGURATION_FAILURE_MESSAGES, LabReportRecord } from '@hms/shared-types';

import { LabReportMapper } from './lab-report.mapper';

/**
 * The wire shape of one version, and in particular how a row parked by a
 * missing setting (P18-T16) is told apart from one the renderer gave up on:
 * by the registry's message, and only while the row is FAILED.
 */
describe('LabReportMapper', () => {
  const mapper = new LabReportMapper();
  const releasedAt = new Date('2026-09-07T04:40:00.000Z');

  function buildRecord(overrides: Partial<LabReportRecord> = {}): LabReportRecord {
    return {
      id: '77777777-eeee-4eee-8eee-777777777777',
      labOrderId: 'c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f',
      version: 1,
      status: 'FAILED',
      isAmended: false,
      releasedAt,
      documentId: null,
      attemptCount: 1,
      nextAttemptAt: null,
      lastError: LAB_REPORT_CONFIGURATION_FAILURE_MESSAGES.CLINIC_PROFILE_MISSING,
      renderedAt: null,
      pageCount: null,
      requestedById: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
      note: null,
      createdAt: releasedAt,
      ...overrides,
    };
  }

  it('names the setting a FAILED version is waiting on', () => {
    const actual = mapper.toVersionView(buildRecord());

    expect(actual.configurationFailure).toBe('CLINIC_PROFILE_MISSING');
    expect(actual.lastError).toBe(LAB_REPORT_CONFIGURATION_FAILURE_MESSAGES.CLINIC_PROFILE_MISSING);
  });

  it('carries no setting for a transient failure', () => {
    const actual = mapper.toVersionView(buildRecord({ lastError: 'Renderer unavailable' }));

    expect(actual.configurationFailure).toBeUndefined();
  });

  // A re-opened row keeps its last reason until it settles again; while it
  // is trying, the screen should say so, not point at a setting.
  it('drops the setting once the version has been re-queued', () => {
    const actual = mapper.toVersionView(
      buildRecord({ status: 'PENDING', nextAttemptAt: releasedAt }),
    );

    expect(actual.configurationFailure).toBeUndefined();
  });

  it('drops nulls to absent and keeps the note', () => {
    const actual = mapper.toVersionView(
      buildRecord({ status: 'READY', lastError: null, note: 'Sampel lipemik.' }),
    );

    expect(actual.lastError).toBeUndefined();
    expect(actual.note).toBe('Sampel lipemik.');
  });
});
