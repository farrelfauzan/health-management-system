import {
  blocksTighten,
  buildDraftPatientCsv,
  buildDraftPatientReport,
  resolveDisposition,
} from './build-draft-patient-report';
import { DraftPatientRow } from './draft-patient-report.types';

function buildRow(overrides: Partial<DraftPatientRow> = {}): DraftPatientRow {
  return {
    id: 'patient-1',
    mrn: 'RM-000119',
    source: 'CHANNEL_BOOKING',
    isSoftDeleted: false,
    hasDateOfBirth: false,
    hasSex: false,
    hasAddress: false,
    hasClinicalActivity: false,
    hasPrivacyEvidence: false,
    appointmentCount: 1,
    channelLinkCount: 1,
    ...overrides,
  };
}

describe('resolveDisposition', () => {
  it('converts a chat record nobody ever attended on', () => {
    const actual = resolveDisposition(buildRow({ hasClinicalActivity: false }));

    expect(actual).toBe('CONVERT');
  });

  it('keeps a chat record with clinical activity', () => {
    // That person attended. Moving encounters or invoices between records to
    // tidy a table is not something a migration gets to do.
    const actual = resolveDisposition(buildRow({ hasClinicalActivity: true }));

    expect(actual).toBe('KEEP');
  });

  it('leaves a front-desk record alone however incomplete it is', () => {
    const actual = resolveDisposition(buildRow({ source: 'FRONT_DESK' }));

    expect(actual).toBe('OUT_OF_SCOPE');
  });
});

describe('blocksTighten', () => {
  it('passes a row carrying all three columns', () => {
    const actual = blocksTighten(
      buildRow({ hasDateOfBirth: true, hasSex: true, hasAddress: true }),
    );

    expect(actual).toBe(false);
  });

  it.each(['hasDateOfBirth', 'hasSex', 'hasAddress'] as const)(
    'blocks a row missing %s',
    (column) => {
      const actual = blocksTighten(
        buildRow({ hasDateOfBirth: true, hasSex: true, hasAddress: true, [column]: false }),
      );

      expect(actual).toBe(true);
    },
  );

  it('blocks a soft-deleted row too', () => {
    // NOT NULL is table-wide. A dry run that filtered on `deleted_at IS NULL`
    // would report all-clear and then watch the deploy fail.
    const actual = blocksTighten(
      buildRow({ isSoftDeleted: true, hasDateOfBirth: true, hasSex: true, hasAddress: false }),
    );

    expect(actual).toBe(true);
  });
});

describe('buildDraftPatientReport', () => {
  it('splits chat records by whether anybody attended on them', () => {
    const actual = buildDraftPatientReport([
      buildRow({ mrn: 'RM-1', hasClinicalActivity: false }),
      buildRow({ mrn: 'RM-2', hasClinicalActivity: true }),
      buildRow({ mrn: 'RM-3', source: 'FRONT_DESK', hasClinicalActivity: false }),
    ]);

    expect(actual.channelBookingTotal).toBe(2);
    expect(actual.convert).toEqual({ count: 1, mrns: ['RM-1'] });
    expect(actual.keep).toEqual({ count: 1, mrns: ['RM-2'] });
  });

  it('names the convertible records whose profile cannot actually be removed', () => {
    // The finding this dry run exists to catch: immutable privacy-notice
    // evidence with an ON DELETE RESTRICT foreign key means "remove the
    // PatientProfile" is not an available operation.
    const actual = buildDraftPatientReport([
      buildRow({ mrn: 'RM-1', hasPrivacyEvidence: true }),
      buildRow({ mrn: 'RM-2', hasPrivacyEvidence: false }),
    ]);

    expect(actual.convertBlockedByPrivacyEvidence).toEqual({ count: 1, mrns: ['RM-1'] });
  });

  it('totals the bookings and chat links the drain would repoint', () => {
    const actual = buildDraftPatientReport([
      buildRow({ mrn: 'RM-1', appointmentCount: 2, channelLinkCount: 1 }),
      buildRow({ mrn: 'RM-2', appointmentCount: 3, channelLinkCount: 2 }),
      // Attended, so it stays put and its bookings go nowhere.
      buildRow({ mrn: 'RM-3', hasClinicalActivity: true, appointmentCount: 9, channelLinkCount: 9 }),
    ]);

    expect(actual.appointmentsToRepoint).toBe(5);
    expect(actual.channelLinksToRepoint).toBe(3);
  });

  it('counts every source and every retired row among the tighten blockers', () => {
    const actual = buildDraftPatientReport([
      buildRow({ mrn: 'RM-1', source: 'FRONT_DESK', hasDateOfBirth: true, hasSex: true }),
      buildRow({ mrn: 'RM-2', isSoftDeleted: true }),
      buildRow({
        mrn: 'RM-3',
        source: 'FRONT_DESK',
        hasDateOfBirth: true,
        hasSex: true,
        hasAddress: true,
      }),
    ]);

    expect(actual.tightenBlockers.count).toBe(2);
    expect(actual.tightenBlockersBySource).toEqual({ FRONT_DESK: 1, CHANNEL_BOOKING: 1 });
    expect(actual.tightenBlockersByColumn).toEqual({ dateOfBirth: 1, sex: 1, address: 2 });
  });

  it('separates the blockers the drain will never reach', () => {
    const actual = buildDraftPatientReport([
      // Converted away by the drain, so it stops being a blocker on its own.
      buildRow({ mrn: 'RM-1' }),
      // Attended: the drain leaves it, and a person has to complete it.
      buildRow({ mrn: 'RM-2', hasClinicalActivity: true }),
      // Never in scope at all.
      buildRow({ mrn: 'RM-3', source: 'FRONT_DESK' }),
    ]);

    expect(actual.tightenBlockers.count).toBe(3);
    expect(actual.tightenBlockersOutsideDrainScope).toEqual({
      count: 2,
      mrns: ['RM-2', 'RM-3'],
    });
  });
});

describe('buildDraftPatientCsv', () => {
  it('lists the records somebody has to deal with, and no demographics', () => {
    const actual = buildDraftPatientCsv([
      buildRow({ mrn: 'RM-1', hasPrivacyEvidence: true, appointmentCount: 2 }),
      // Complete and out of scope: nothing for anyone to do, so it is omitted.
      buildRow({
        mrn: 'RM-9',
        source: 'FRONT_DESK',
        hasDateOfBirth: true,
        hasSex: true,
        hasAddress: true,
      }),
    ]);

    const lines = actual.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      'mrn,source,disposition,softDeleted,blocksTighten,missing,appointments,privacyEvidence',
    );
    expect(lines[1]).toBe(
      'RM-1,CHANNEL_BOOKING,CONVERT,false,true,dateOfBirth sex address,2,true',
    );
  });

  it('keeps an out-of-scope record that would still abort the tightening', () => {
    const actual = buildDraftPatientCsv([
      buildRow({ mrn: 'RM-9', source: 'FRONT_DESK', hasDateOfBirth: true, hasSex: true }),
    ]);

    expect(actual).toContain('RM-9,FRONT_DESK,OUT_OF_SCOPE,false,true,address,1,false');
  });
});
