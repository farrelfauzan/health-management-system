export type SoapSectionKey = 'subjective' | 'objective' | 'assessment' | 'plan';

export type SoapSection = {
  key: SoapSectionKey;
  label: string;
  placeholder: string;
};

export const SOAP_SECTIONS: readonly SoapSection[] = [
  {
    key: 'subjective',
    label: 'Subjective',
    placeholder: 'What the patient reports — complaint, history, symptoms.',
  },
  {
    key: 'objective',
    label: 'Objective',
    placeholder: 'What was observed and measured on examination.',
  },
  {
    key: 'assessment',
    label: 'Assessment',
    placeholder: 'Clinical impression. Coded diagnoses are recorded separately.',
  },
  {
    key: 'plan',
    label: 'Plan',
    placeholder: 'Treatment, prescriptions, follow-up, and referral intent.',
  },
] as const;
