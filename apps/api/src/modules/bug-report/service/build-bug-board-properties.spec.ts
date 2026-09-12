import { BugReportPublishRecord } from '@hms/shared-types';

import { buildBugBoardProperties } from './build-bug-board-properties';

function buildReport(overrides: Partial<BugReportPublishRecord> = {}): BugReportPublishRecord {
  return {
    id: 'report-1',
    reference: 'BR-000042',
    reporterRole: 'DOCTOR',
    triage: {
      title: 'Hasil lab tidak muncul',
      summary: 'Daftar hasil lab kosong.',
      stepsToReproduce: ['Buka daftar lab'],
      expected: 'Hasil tampil',
      actual: 'Layar kosong',
      severity: 'P1',
      type: 'Bug',
      module: 'Laboratory',
      mayContainPersonalData: false,
    },
    triagedBy: 'AI',
    redactedText: null,
    pagePath: '/admin/laboratory',
    requestIds: ['req-1', 'req-2'],
    appVersion: '1.4.2',
    attemptCount: 0,
    notionPageId: null,
    createdAt: new Date('2026-09-12T08:00:00.000Z'),
    ...overrides,
  };
}

describe('buildBugBoardProperties', () => {
  it('maps a triaged report onto every column the board requires', () => {
    const actualProperties = buildBugBoardProperties({
      report: buildReport(),
      clinicLabel: 'Klinik Sehat Bandung',
    });

    expect(actualProperties).toEqual({
      Title: { title: [{ text: { content: 'Hasil lab tidak muncul' } }] },
      'Report ID': { rich_text: [{ text: { content: 'BR-000042' } }] },
      Status: { select: { name: 'Triaged' } },
      Severity: { select: { name: 'P1 - High' } },
      Type: { select: { name: 'Bug' } },
      Module: { select: { name: 'Laboratory' } },
      Clinic: { rich_text: [{ text: { content: 'Klinik Sehat Bandung' } }] },
      'Reporter Role': { select: { name: 'Doctor' } },
      Page: { rich_text: [{ text: { content: '/admin/laboratory' } }] },
      'Request IDs': { rich_text: [{ text: { content: 'req-1, req-2' } }] },
      'Triaged By': { select: { name: 'AI' } },
      'App Version': { rich_text: [{ text: { content: '1.4.2' } }] },
      'Reported At': { date: { start: '2026-09-12T08:00:00.000Z' } },
    });
  });

  /**
   * `Status` is the field a triager reads first, and the difference it records is
   * not cosmetic: `Triaged` means a model summarised the report, `New` means
   * nobody did and these are the reporter's raw words. Someone who cannot tell
   * them apart will trust a summary that was never written.
   */
  it('files a fallback ticket as New, not Triaged', () => {
    const actualProperties = buildBugBoardProperties({
      report: buildReport({ triage: null, triagedBy: 'FALLBACK', redactedText: 'Layar kosong' }),
      clinicLabel: 'Klinik Sehat',
    });

    expect(actualProperties.Status).toEqual({ select: { name: 'New' } });
    expect(actualProperties['Triaged By']).toEqual({ select: { name: 'Fallback' } });
  });

  /**
   * A fallback title is the reference rather than the reporter's own words: a
   * title is free text the detector may have redacted mid-sentence, and Title is
   * the column that appears in every Notion view, search result and
   * notification. The words belong in the page body, read deliberately.
   */
  it('titles a fallback ticket from the reference rather than the reporter text', () => {
    const actualProperties = buildBugBoardProperties({
      report: buildReport({ triage: null, triagedBy: 'FALLBACK' }),
      clinicLabel: 'Klinik Sehat',
    });

    expect(actualProperties.Title).toEqual({
      title: [{ text: { content: 'Bug report BR-000042' } }],
    });
  });

  it('gives a fallback ticket the middle severity and the Other module', () => {
    const actualProperties = buildBugBoardProperties({
      report: buildReport({ triage: null, triagedBy: 'FALLBACK' }),
      clinicLabel: 'Klinik Sehat',
    });

    expect(actualProperties.Severity).toEqual({ select: { name: 'P2 - Medium' } });
    expect(actualProperties.Module).toEqual({ select: { name: 'Other' } });
  });

  it.each([
    ['SUPER_ADMIN', 'Super Admin'],
    ['ADMIN', 'Admin'],
    ['DOCTOR', 'Doctor'],
    ['PHARMACIST', 'Pharmacist'],
    ['LAB_TECHNICIAN', 'Lab Technician'],
  ])('maps the %s role code onto the board option %s', (inputRole, expectedLabel) => {
    const actualProperties = buildBugBoardProperties({
      report: buildReport({ reporterRole: inputRole }),
      clinicLabel: 'Klinik Sehat',
    });

    expect(actualProperties['Reporter Role']).toEqual({ select: { name: expectedLabel } });
  });

  /**
   * A clinic can create its own roles, and a code with no board option would
   * otherwise fail the whole publish on a `validation_error`. Getting the ticket
   * onto the board with a slightly wrong role beats losing the bug report.
   */
  it('falls back to Admin rather than failing on an unknown role code', () => {
    const actualProperties = buildBugBoardProperties({
      report: buildReport({ reporterRole: 'WARD_CLERK' }),
      clinicLabel: 'Klinik Sehat',
    });

    expect(actualProperties['Reporter Role']).toEqual({ select: { name: 'Admin' } });
  });

  /** Notion rejects a rich-text element with empty content, so an absent version clears the cell. */
  it('clears the app version cell rather than sending an empty rich-text element', () => {
    const actualProperties = buildBugBoardProperties({
      report: buildReport({ appVersion: null }),
      clinicLabel: 'Klinik Sehat',
    });

    expect(actualProperties['App Version']).toEqual({ rich_text: [] });
  });

  it('never puts a reporter identity on the board', () => {
    const serialisedProperties = JSON.stringify(
      buildBugBoardProperties({ report: buildReport(), clinicLabel: 'Klinik Sehat' }),
    );

    expect(serialisedProperties).not.toContain('report-1');
    expect(serialisedProperties).toContain('Doctor');
  });
});
