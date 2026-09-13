import { readPractitionerSummary } from './read-practitioner-summary';

/**
 * Shaped after the live sandbox read probed for P21-T08: `id`, `identifier`
 * (a masked NIK and the org-scoped practitioner id), `name` with only `text`,
 * and `meta`. Values are placeholders; the repository is public.
 */
describe('readPractitionerSummary', () => {
  const RECORDED_SHAPE = {
    resourceType: 'Practitioner',
    id: '10000000009',
    meta: { lastUpdated: '2026-08-29T03:00:00.000Z', versionId: 'MTc4OTE0MTU5NTg4MjIyOTAwMA' },
    identifier: [
      { system: 'https://fhir.kemkes.go.id/id/nik', value: '*************009' },
      { system: 'http://sys-ids.kemkes.go.id/practitioner', value: '10000000009' },
    ],
    name: [{ text: 'dr. Placeholder Practitioner' }],
  };

  it('reads the name and the masked NIK off the recorded shape', () => {
    expect(readPractitionerSummary(RECORDED_SHAPE, '10000000009')).toEqual({
      ihsNumber: '10000000009',
      name: 'dr. Placeholder Practitioner',
      maskedNik: '*************009',
    });
  });

  it('never picks the org-scoped practitioner identifier as the NIK', () => {
    const actual = readPractitionerSummary(
      { ...RECORDED_SHAPE, identifier: [RECORDED_SHAPE.identifier[1]] },
      '10000000009',
    );

    expect(actual.maskedNik).toBeNull();
  });

  it('falls back to given and family parts when there is no text', () => {
    const actual = readPractitionerSummary(
      { ...RECORDED_SHAPE, name: [{ given: ['Placeholder'], family: 'Practitioner' }] },
      '10000000009',
    );

    expect(actual.name).toBe('Placeholder Practitioner');
  });

  it('returns nulls rather than throwing for a shape it cannot read', () => {
    expect(readPractitionerSummary('not a resource', 'x')).toEqual({
      ihsNumber: 'x',
      name: null,
      maskedNik: null,
    });
  });
});
