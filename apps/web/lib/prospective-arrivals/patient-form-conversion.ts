/**
 * Turns the patient form into the arrival conversion (`P17-T04`).
 *
 * Present only when the form was opened from a prospective booking. The two
 * fields are everything the chatbot was allowed to collect, and they are here
 * so the clerk does not retype what the customer already gave — retyping is
 * where a name acquires a spelling the registry search will never find again.
 */
export type PatientFormConversion = {
  prospectivePatientId: string;
  fullName: string;
  phoneNumber: string;
};
