import { buildSatusehatServiceClassExtension } from './satusehat-service-class-extension';
import { SatusehatFhirLocation, SatusehatLocationResourceInput } from './satusehat-fhir.types';

const LOCATION_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/location/';
const PHYSICAL_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/location-physical-type';
const PHYSICAL_TYPE_DISPLAY: Readonly<Record<SatusehatLocationResourceInput['physicalTypeCode'], string>> = {
  si: 'Site',
  ro: 'Room',
  wa: 'Ward',
  bd: 'Bed',
};
/**
 * The identifier system a clinic's Locations are registered under (FR-LOC-06).
 * Scoped by organization, so two clinics' row UUIDs can never collide.
 */
export function buildSatusehatLocationIdentifierSystem(organizationId: string): string {
  return `${LOCATION_IDENTIFIER_SYSTEM_PREFIX}${organizationId}`;
}

/**
 * A FHIR Location for one clinic row (P24-T06, FR-LOC-03/04/06).
 *
 * The identifier value is our row UUID rather than the editable `code`, so a
 * renamed ward is still found by the search that makes a retry safe. `position`
 * is latitude/longitude in that order — the official example swaps them — and
 * is sent whenever the clinic has both. The service class extension carries the
 * inpatient class for rooms and beds; a poli carries none (P24-T01 Q1).
 */
export function buildSatusehatLocationResource(
  input: SatusehatLocationResourceInput,
): SatusehatFhirLocation {
  return {
    resourceType: 'Location',
    ...(input.satusehatLocationId === null ? {} : { id: input.satusehatLocationId }),
    identifier: [
      { system: buildSatusehatLocationIdentifierSystem(input.organizationId), value: input.localId },
    ],
    status: input.isActive ? 'active' : 'inactive',
    name: input.name,
    mode: 'instance',
    physicalType: {
      coding: [
        {
          system: PHYSICAL_TYPE_SYSTEM,
          code: input.physicalTypeCode,
          display: PHYSICAL_TYPE_DISPLAY[input.physicalTypeCode],
        },
      ],
    },
    ...(input.latitude === null || input.longitude === null
      ? {}
      : { position: { longitude: input.longitude, latitude: input.latitude, altitude: 0 } }),
    managingOrganization: { reference: `Organization/${input.organizationId}` },
    ...(input.parent === null
      ? {}
      : {
          partOf: {
            reference: `Location/${input.parent.satusehatLocationId}`,
            display: input.parent.name,
          },
        }),
    ...(input.serviceClassCode === null
      ? {}
      : { extension: [buildSatusehatServiceClassExtension(input.serviceClassCode)] }),
  };
}

