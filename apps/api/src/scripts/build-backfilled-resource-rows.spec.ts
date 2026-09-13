import { SATUSEHAT_READ_BACK_FIXTURES } from '../modules/satusehat/fixtures/satusehat-read-back-fixtures';
import { buildBackfilledResourceRows } from './build-backfilled-resource-rows';

/**
 * Driven by the payloads P21-T01 recorded off the live platform, because the two
 * failures this guards against are both shape surprises the docs do not mention:
 * `Composition.identifier` is an object where the others are arrays, and
 * `MedicationRequest` returns two identifiers.
 */
describe('buildBackfilledResourceRows', () => {
  /** The organization id the recorded fixtures were stamped with. */
  const organizationId = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

  it('records what the platform holds, marked as backfilled', () => {
    const actual = buildBackfilledResourceRows({
      resourceType: 'Procedure',
      resources: [SATUSEHAT_READ_BACK_FIXTURES.Procedure],
      organizationId,
    });

    expect(actual).toHaveLength(1);
    expect(actual[0]).toMatchObject({
      resourceType: 'Procedure',
      outcome: 'SENT',
      skipReason: null,
      satusehatId: SATUSEHAT_READ_BACK_FIXTURES.Procedure.id,
      isBackfilled: true,
    });
  });

  it('recovers the local record id from the org-scoped identifier', () => {
    const actual = buildBackfilledResourceRows({
      resourceType: 'Procedure',
      resources: [SATUSEHAT_READ_BACK_FIXTURES.Procedure],
      organizationId,
    });

    expect(actual[0]?.localRecordId).not.toBeNull();
  });

  /**
   * `Composition.identifier` is a bare object. A matcher calling `.map` on it
   * throws — it did, during the spike.
   */
  it('handles an identifier returned as an object rather than an array', () => {
    const actual = buildBackfilledResourceRows({
      resourceType: 'Composition',
      resources: [SATUSEHAT_READ_BACK_FIXTURES.Composition],
      organizationId,
    });

    expect(actual).toHaveLength(1);
    expect(actual[0]?.localRecordId).not.toBeNull();
  });

  /**
   * `MedicationRequest` carries `prescription` **and** `prescription-item`, so
   * taking `identifier[0]` would attach the prescription's id to a line item.
   */
  it('selects by system when a resource carries several identifiers', () => {
    const actual = buildBackfilledResourceRows({
      resourceType: 'MedicationRequest',
      resources: [SATUSEHAT_READ_BACK_FIXTURES.MedicationRequest],
      organizationId,
    });

    const identifiers = SATUSEHAT_READ_BACK_FIXTURES.MedicationRequest.identifier;
    const itemIdentifier = identifiers.find((entry) => entry.system.includes('prescription-item'));
    expect(identifiers.length).toBeGreaterThan(1);
    expect(actual[0]?.localRecordId).toBe(itemIdentifier?.value);
  });

  /**
   * P21-T01: the platform stamps no org-scoped identifier on these two, so a
   * backfilled row cannot know which local record it came from.
   */
  it('leaves the local id null for Condition and Observation, which carry none', () => {
    const condition = buildBackfilledResourceRows({
      resourceType: 'Condition',
      resources: [SATUSEHAT_READ_BACK_FIXTURES.Condition],
      organizationId,
    });
    const observation = buildBackfilledResourceRows({
      resourceType: 'Observation',
      resources: [SATUSEHAT_READ_BACK_FIXTURES.Observation],
      organizationId,
    });

    expect(condition[0]?.localRecordId).toBeNull();
    expect(condition[0]?.satusehatId).toBe(SATUSEHAT_READ_BACK_FIXTURES.Condition.id);
    expect(observation[0]?.localRecordId).toBeNull();
  });

  it('ignores an identifier belonging to another organisation', () => {
    const actual = buildBackfilledResourceRows({
      resourceType: 'Procedure',
      resources: [SATUSEHAT_READ_BACK_FIXTURES.Procedure],
      organizationId: 'a-different-organisation',
    });

    expect(actual[0]?.localRecordId).toBeNull();
  });

  it('never records a resource with no id, which cannot be read back', () => {
    expect(
      buildBackfilledResourceRows({
        resourceType: 'Condition',
        resources: [{ resourceType: 'Condition' }, null, 'nope'],
        organizationId,
      }),
    ).toEqual([]);
  });

  it('carries no clinical value from the payloads it read', () => {
    const actual = buildBackfilledResourceRows({
      resourceType: 'Condition',
      resources: [SATUSEHAT_READ_BACK_FIXTURES.Condition],
      organizationId,
    });

    const rendered = JSON.stringify(actual);
    expect(rendered).not.toContain(SATUSEHAT_READ_BACK_FIXTURES.Condition.subject.display);
    expect(rendered).not.toContain('J06.9');
  });
});
