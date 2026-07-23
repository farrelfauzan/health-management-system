// DUMMY-DATA: allergy and drug-interaction data have no MVP backend contract — the patient
// and prescription schemas carry no clinical flags. Replace with a real clinical-safety
// endpoint (per-patient allergies + interaction screening) when it exists post-MVP.
export type ClinicalFlags = {
  allergies: readonly string[];
  interactionAlert: {
    title: string;
    message: string;
  };
};

export const MOCK_CLINICAL_FLAGS: ClinicalFlags = {
  allergies: ['Penicillin', 'Latex'],
  interactionAlert: {
    title: 'Clinical Interaction Alert',
    message:
      'Patient is currently on Warfarin. Monitor INR levels closely before dispensing this order.',
  },
};
