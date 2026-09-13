import { SATUSEHAT_READ_BACK_FIXTURES } from '../fixtures/satusehat-read-back-fixtures';
import { projectCheckedResource } from './project-checked-resource';

/**
 * The whitelist test the ticket asks for, driven by resources **recorded off the
 * live platform** (P21-T01) rather than hand-written ones. That distinction is
 * the point: the leak this guards against is a field nobody thought of, so the
 * input has to be a real payload with all of its real fields.
 */
describe('projectCheckedResource', () => {
  const fixtures = Object.entries(SATUSEHAT_READ_BACK_FIXTURES);

  it('keeps exactly four fields and no others', () => {
    fixtures.forEach(([resourceType, resource]) => {
      const actual = projectCheckedResource(resource);
      expect(Object.keys(actual).sort()).toEqual(['lastUpdated', 'outcome', 'status', 'versionId']);
      expect(resourceType).toBeTruthy();
    });
  });

  /**
   * The finding that made this an allowlist. Every recorded resource carries
   * `subject.display`, so a denylist would have leaked the patient's name.
   */
  it('drops the patient name every real resource carries', () => {
    fixtures.forEach(([resourceType, resource]) => {
      const source = resource as Record<string, unknown>;
      const subject = source['subject'] as { display?: string } | undefined;
      const projected = JSON.stringify(projectCheckedResource(resource));
      if (subject?.display) {
        expect(projected).not.toContain(subject.display);
      }
      expect(resourceType).toBeTruthy();
    });
  });

  it('drops every clinical-bearing key the platform returned', () => {
    const forbidden = [
      'code',
      'category',
      'valueQuantity',
      'valueCodeableConcept',
      'interpretation',
      'referenceRange',
      'note',
      'section',
      'title',
      'diagnosis',
      'finding',
      'dosageInstruction',
      'medicationReference',
      'subject',
      'performer',
      'requester',
      'assessor',
      'author',
      'participant',
      'identifier',
      'encounter',
      'location',
      'extension',
    ];
    fixtures.forEach(([, resource]) => {
      const projected = projectCheckedResource(resource) as Record<string, unknown>;
      forbidden.forEach((key) => {
        expect(projected[key]).toBeUndefined();
      });
    });
  });

  it('carries the version and timestamp the platform stamped', () => {
    const actual = projectCheckedResource(SATUSEHAT_READ_BACK_FIXTURES.Encounter);

    expect(actual.versionId).toBe(SATUSEHAT_READ_BACK_FIXTURES.Encounter.meta.versionId);
    expect(actual.lastUpdated).toBe(SATUSEHAT_READ_BACK_FIXTURES.Encounter.meta.lastUpdated);
    expect(actual.status).toBe('finished');
  });

  /**
   * P21-T01: `Condition` has no `status`, only `clinicalStatus`. Null is the
   * honest answer — reaching for the `clinicalStatus` coding would put a
   * clinical value (`active`, `resolved`) on an admin screen.
   */
  it('reports a null status for a Condition rather than reaching for clinicalStatus', () => {
    const actual = projectCheckedResource(SATUSEHAT_READ_BACK_FIXTURES.Condition);

    expect(actual.status).toBeNull();
    expect(actual.versionId).not.toBeNull();
    expect(JSON.stringify(actual)).not.toContain('active');
  });

  it('survives a resource with no meta at all', () => {
    expect(projectCheckedResource({ resourceType: 'Condition' })).toEqual({
      outcome: 'FOUND',
      versionId: null,
      lastUpdated: null,
      status: null,
    });
  });

  it('survives a body that is not an object', () => {
    expect(projectCheckedResource(null).versionId).toBeNull();
    expect(projectCheckedResource('nope').status).toBeNull();
  });
});
