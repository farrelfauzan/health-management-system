import type { PatientManagementControllerListPatientsV1200DataItem } from '#lib/api/generated/model/patientManagementControllerListPatientsV1200DataItem';

/**
 * The patient as the intake picker needs them (P18-T10): the name to recognise
 * and the MRN to tell two people with the same name apart.
 *
 * Taken from the generated contract rather than `PatientListItem`, which does
 * not carry the MRN the endpoint actually returns — and choosing the wrong
 * patient here files a result in a stranger's record.
 */
export type LabIntakePatient = Pick<
  PatientManagementControllerListPatientsV1200DataItem,
  'id' | 'fullName' | 'mrn'
>;
