/**
 * Repository projections and payloads for SATUSEHAT linkage. The `nik` fields
 * are decrypted by the repository (the only layer allowed to touch identifier
 * ciphertext) solely so the service can send them to the SATUSEHAT master
 * patient index; they must never appear in responses or logs.
 */
export type PatientSatusehatLinkTarget = {
  id: string;
  nik: string | null;
  hasSatusehatPatientId: boolean;
};

export type DoctorSatusehatLinkTarget = {
  id: string;
  nik: string | null;
  satusehatPractitionerId: string | null;
};

export type SavePatientIhsNumberPayload = {
  patientId: string;
  ihsNumber: string;
};

export type SaveDoctorIhsNumberPayload = {
  doctorId: string;
  ihsNumber: string;
};
