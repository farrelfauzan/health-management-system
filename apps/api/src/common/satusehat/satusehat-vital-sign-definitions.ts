import { SatusehatVitalSignDefinition } from './satusehat-fhir.types';

/**
 * LOINC and UCUM codings for the fixed-unit vital-sign columns. This table is
 * the only place the codes exist — the database deliberately stores none
 * (`P8-T02`), so a coding correction is an adapter change, not a migration.
 *
 * Its own module since P21-T04: the mapper sends these codings and the
 * doctor's comparison reads them back, and a second copy of the table would
 * let the two disagree about which LOINC code a vital sign is.
 */
export const SATUSEHAT_VITAL_SIGN_DEFINITIONS: readonly SatusehatVitalSignDefinition[] = [
  {
    field: 'heightCm',
    loincCode: '8302-2',
    loincDisplay: 'Body height',
    unit: 'cm',
    ucumCode: 'cm',
  },
  {
    field: 'weightKg',
    loincCode: '29463-7',
    loincDisplay: 'Body weight',
    unit: 'kg',
    ucumCode: 'kg',
  },
  {
    field: 'systolicBloodPressure',
    loincCode: '8480-6',
    loincDisplay: 'Systolic blood pressure',
    unit: 'mmHg',
    ucumCode: 'mm[Hg]',
  },
  {
    field: 'diastolicBloodPressure',
    loincCode: '8462-4',
    loincDisplay: 'Diastolic blood pressure',
    unit: 'mmHg',
    ucumCode: 'mm[Hg]',
  },
  {
    field: 'pulseRate',
    loincCode: '8867-4',
    loincDisplay: 'Heart rate',
    unit: 'beats/minute',
    ucumCode: '/min',
  },
  {
    field: 'respiratoryRate',
    loincCode: '9279-1',
    loincDisplay: 'Respiratory rate',
    unit: 'breaths/minute',
    ucumCode: '/min',
  },
  {
    field: 'temperatureCelsius',
    loincCode: '8310-5',
    loincDisplay: 'Body temperature',
    unit: 'C',
    ucumCode: 'Cel',
  },
  {
    field: 'oxygenSaturation',
    loincCode: '2708-6',
    loincDisplay: 'Oxygen saturation in Arterial blood',
    unit: '%',
    ucumCode: '%',
  },
];
