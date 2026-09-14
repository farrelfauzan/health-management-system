import { buildSatusehatLocationResource } from './build-satusehat-location-resource';
import { SatusehatLocationResourceInput } from './satusehat-fhir.types';

describe('buildSatusehatLocationResource', () => {
  const inputBed: SatusehatLocationResourceInput = {
    organizationId: '10000004',
    localId: 'bed-uuid',
    satusehatLocationId: null,
    physicalTypeCode: 'bd',
    name: 'Kamar 1 · B1',
    isActive: true,
    latitude: -6.1754,
    longitude: 106.8272,
    parent: { satusehatLocationId: 'room-ihs', name: 'Kamar 1' },
    serviceClassCode: '2',
  };

  it('identifies the row by its UUID under the organization-scoped system (FR-LOC-06)', () => {
    const actualResource = buildSatusehatLocationResource(inputBed);

    expect(actualResource.identifier).toEqual([
      { system: 'http://sys-ids.kemkes.go.id/location/10000004', value: 'bed-uuid' },
    ]);
    expect(actualResource.id).toBeUndefined();
  });

  it('sends latitude and longitude the right way round, with partOf and the service class', () => {
    const actualResource = buildSatusehatLocationResource(inputBed);

    expect(actualResource.position).toEqual({ longitude: 106.8272, latitude: -6.1754, altitude: 0 });
    expect(actualResource.partOf).toEqual({ reference: 'Location/room-ihs', display: 'Kamar 1' });
    expect(actualResource.physicalType.coding[0]?.code).toBe('bd');
    expect(actualResource.extension?.[0]?.valueCodeableConcept.coding[0]).toEqual({
      system: 'http://terminology.kemkes.go.id/CodeSystem/locationServiceClass-Inpatient',
      code: '2',
      display: 'Kelas 2',
    });
  });

  it('builds a poli with no service class and a site with no parent', () => {
    const actualSite = buildSatusehatLocationResource({
      ...inputBed,
      physicalTypeCode: 'si',
      parent: null,
      serviceClassCode: null,
    });

    expect(actualSite.partOf).toBeUndefined();
    expect(actualSite.extension).toBeUndefined();
    expect(actualSite.managingOrganization).toEqual({ reference: 'Organization/10000004' });
  });

  it('carries the id and status inactive when a registered row is deactivated (FR-LOC-08)', () => {
    const actualResource = buildSatusehatLocationResource({
      ...inputBed,
      satusehatLocationId: 'bed-ihs',
      isActive: false,
    });

    expect(actualResource.id).toBe('bed-ihs');
    expect(actualResource.status).toBe('inactive');
  });
});
