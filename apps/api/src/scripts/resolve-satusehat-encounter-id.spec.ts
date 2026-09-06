import { resolveSatusehatEncounterId } from './resolve-satusehat-encounter-id';
import { parseSatusehatBackfillOptions } from './parse-satusehat-backfill-options';
import { summariseSatusehatEncounterIdResults } from './summarise-satusehat-encounter-id-results';

const submissionId = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
const encounterId = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';

describe('resolveSatusehatEncounterId', () => {
  it('fills the id when the platform returns exactly one Encounter', () => {
    const actualResult = resolveSatusehatEncounterId({
      submissionId,
      encounterId,
      bundle: { entry: [{ resource: { id: 'ihs-enc-1' } }] },
    });

    expect(actualResult.outcome).toBe('FILLED');
    expect(actualResult.satusehatEncounterId).toBe('ihs-enc-1');
  });

  it('lists a row the platform does not know — it may have gone out under another org id', () => {
    const actualResult = resolveSatusehatEncounterId({
      submissionId,
      encounterId,
      bundle: { entry: [] },
    });

    expect(actualResult.outcome).toBe('NOT_FOUND');
    expect(actualResult.satusehatEncounterId).toBeNull();
  });

  it('lists a row with more than one hit rather than picking the first', () => {
    const actualResult = resolveSatusehatEncounterId({
      submissionId,
      encounterId,
      bundle: { entry: [{ resource: { id: 'ihs-enc-1' } }, { resource: { id: 'ihs-enc-2' } }] },
    });

    expect(actualResult.outcome).toBe('AMBIGUOUS');
    expect(actualResult.satusehatEncounterId).toBeNull();
  });

  it('treats a hit with no usable resource id as ambiguous, never as a miss', () => {
    const actualResult = resolveSatusehatEncounterId({
      submissionId,
      encounterId,
      bundle: { entry: [{ resource: {} }] },
    });

    expect(actualResult.outcome).toBe('AMBIGUOUS');
  });
});

describe('parseSatusehatBackfillOptions', () => {
  it('reads the organisation id and the dry-run flag', () => {
    expect(parseSatusehatBackfillOptions(['--org-id=10000004', '--dry-run'])).toEqual({
      isDryRun: true,
      organizationId: '10000004',
    });
  });

  it('defaults to a real run with no organisation id, which the script refuses', () => {
    expect(parseSatusehatBackfillOptions([])).toEqual({ isDryRun: false, organizationId: null });
  });

  it('treats an empty --org-id as absent rather than as a match for empty config', () => {
    expect(parseSatusehatBackfillOptions(['--org-id=']).organizationId).toBeNull();
  });
});

describe('summariseSatusehatEncounterIdResults', () => {
  it('counts one run per outcome', () => {
    const actualSummary = summariseSatusehatEncounterIdResults([
      { submissionId, encounterId, outcome: 'FILLED', satusehatEncounterId: 'ihs-1' },
      { submissionId, encounterId, outcome: 'FILLED', satusehatEncounterId: 'ihs-2' },
      { submissionId, encounterId, outcome: 'NOT_FOUND', satusehatEncounterId: null },
      { submissionId, encounterId, outcome: 'AMBIGUOUS', satusehatEncounterId: null },
      { submissionId, encounterId, outcome: 'ENCOUNTER_GONE', satusehatEncounterId: null },
    ]);

    expect(actualSummary).toEqual({ filled: 2, notFound: 1, ambiguous: 1, encounterGone: 1 });
  });

  it('summarises an empty run as all zeroes — the second-run case', () => {
    expect(summariseSatusehatEncounterIdResults([])).toEqual({
      filled: 0,
      notFound: 0,
      ambiguous: 0,
      encounterGone: 0,
    });
  });
});
