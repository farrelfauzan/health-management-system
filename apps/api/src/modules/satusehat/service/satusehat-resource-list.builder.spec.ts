import { SatusehatResourceListBuilder } from './satusehat-resource-list.builder';

import type {
  SatusehatCreatedResourceLocation,
  SatusehatFhirTransactionBundle,
} from '../../../common/satusehat/satusehat-fhir.types';

/** A bundle entry carrying only the fields the builder reads. */
const buildEntry = (fullUrl: string, resourceType: string) =>
  ({
    fullUrl,
    resource: {},
    request: { method: 'POST', url: resourceType },
  }) as unknown as SatusehatFhirTransactionBundle['entry'][number];

const buildBundle = (
  entries: SatusehatFhirTransactionBundle['entry'],
): SatusehatFhirTransactionBundle =>
  ({ resourceType: 'Bundle', type: 'transaction', entry: entries }) as SatusehatFhirTransactionBundle;

const created = (id: string): SatusehatCreatedResourceLocation => ({ resourceType: 'X', id });

describe('SatusehatResourceListBuilder', () => {
  it('records one SENT row per bundle entry with the id SATUSEHAT assigned', () => {
    const builder = new SatusehatResourceListBuilder();
    const inputBundle = buildBundle([
      buildEntry('urn:uuid:enc', 'Encounter'),
      buildEntry('urn:uuid:cond-1', 'Condition'),
      buildEntry('urn:uuid:cond-2', 'Condition'),
    ]);
    const inputCreated = new Map([
      ['urn:uuid:enc', created('ihs-enc')],
      ['urn:uuid:cond-1', created('ihs-cond-1')],
      ['urn:uuid:cond-2', created('ihs-cond-2')],
    ]);
    const actual = builder.build(inputBundle, inputCreated);
    expect(actual).toEqual([
      {
        resourceType: 'Encounter',
        outcome: 'SENT',
        skipReason: null,
        satusehatId: 'ihs-enc',
        localRecordId: null,
        isBackfilled: false,
      },
      {
        resourceType: 'Condition',
        outcome: 'SENT',
        skipReason: null,
        satusehatId: 'ihs-cond-1',
        localRecordId: null,
        isBackfilled: false,
      },
      {
        resourceType: 'Condition',
        outcome: 'SENT',
        skipReason: null,
        satusehatId: 'ihs-cond-2',
        localRecordId: null,
        isBackfilled: false,
      },
    ]);
  });

  it('keeps a null id on a sent resource the response could not be paired against, rather than calling it skipped', () => {
    const builder = new SatusehatResourceListBuilder();
    const inputBundle = buildBundle([buildEntry('urn:uuid:obs', 'Observation')]);
    const actual = builder.build(inputBundle, new Map());
    expect(actual).toEqual([
      {
        resourceType: 'Observation',
        outcome: 'SENT',
        skipReason: null,
        satusehatId: null,
        localRecordId: null,
        isBackfilled: false,
      },
    ]);
  });

  it('points a sent row back at the local row it came from when one was tracked', () => {
    const builder = new SatusehatResourceListBuilder();
    builder.trackLocalRecord('urn:uuid:proc', 'procedure-1');
    const inputBundle = buildBundle([
      buildEntry('urn:uuid:proc', 'Procedure'),
      buildEntry('urn:uuid:composition', 'Composition'),
    ]);
    const inputCreated = new Map([['urn:uuid:proc', created('ihs-proc')]]);
    const actual = builder.build(inputBundle, inputCreated);
    expect(actual[0]?.localRecordId).toBe('procedure-1');
    expect(actual[1]?.localRecordId).toBeNull();
  });

  it('records one row per skipped item so the monitor can count by reason', () => {
    const builder = new SatusehatResourceListBuilder();
    builder.recordSkipped('Medication', 'NO_KFA_CODE', 2);
    builder.recordSkipped('Procedure', 'NO_ICD9CM_CODE', 1);
    const actual = builder.build(buildBundle([]), new Map());
    expect(actual).toHaveLength(3);
    expect(actual.filter((row) => row.skipReason === 'NO_KFA_CODE')).toHaveLength(2);
    expect(actual).toContainEqual({
      resourceType: 'Procedure',
      outcome: 'SKIPPED',
      skipReason: 'NO_ICD9CM_CODE',
      satusehatId: null,
      localRecordId: null,
      isBackfilled: false,
    });
  });

  it('records nothing for a zero count, so a clean bundle carries no skip rows', () => {
    const builder = new SatusehatResourceListBuilder();
    builder.recordSkipped('Medication', 'NO_KFA_CODE', 0);
    expect(builder.build(buildBundle([]), new Map())).toEqual([]);
  });

  it('never lets a skipped row carry an id, which the table rejects outright', () => {
    const builder = new SatusehatResourceListBuilder();
    builder.recordSkipped('Medication', 'NO_KFA_CODE', 3);
    const actual = builder.build(buildBundle([]), new Map());
    expect(actual.every((row) => row.outcome === 'SKIPPED' && row.satusehatId === null)).toBe(true);
  });

  it('describes the ticket example: two coded diagnoses sent, one uncoded medication skipped', () => {
    const builder = new SatusehatResourceListBuilder();
    builder.recordSkipped('Medication', 'NO_KFA_CODE', 1);
    const inputBundle = buildBundle([
      buildEntry('urn:uuid:enc', 'Encounter'),
      buildEntry('urn:uuid:cond-1', 'Condition'),
      buildEntry('urn:uuid:cond-2', 'Condition'),
    ]);
    const inputCreated = new Map([
      ['urn:uuid:enc', created('ihs-enc')],
      ['urn:uuid:cond-1', created('ihs-cond-1')],
      ['urn:uuid:cond-2', created('ihs-cond-2')],
    ]);
    const actual = builder.build(inputBundle, inputCreated);
    expect(actual.filter((row) => row.outcome === 'SENT')).toHaveLength(3);
    expect(actual.filter((row) => row.outcome === 'SKIPPED')).toEqual([
      {
        resourceType: 'Medication',
        outcome: 'SKIPPED',
        skipReason: 'NO_KFA_CODE',
        satusehatId: null,
        localRecordId: null,
        isBackfilled: false,
      },
    ]);
  });

  it('carries no clinical value on any row, whatever was skipped', () => {
    const builder = new SatusehatResourceListBuilder();
    builder.recordSkipped('Medication', 'NO_KFA_CODE', 1);
    builder.trackLocalRecord('urn:uuid:proc', 'procedure-1');
    const inputBundle = buildBundle([buildEntry('urn:uuid:proc', 'Procedure')]);
    const actual = builder.build(inputBundle, new Map());
    const allowedKeys = [
      'resourceType',
      'outcome',
      'skipReason',
      'satusehatId',
      'localRecordId',
      'isBackfilled',
    ];
    actual.forEach((row) => {
      expect(Object.keys(row).sort()).toEqual([...allowedKeys].sort());
    });
  });
});
