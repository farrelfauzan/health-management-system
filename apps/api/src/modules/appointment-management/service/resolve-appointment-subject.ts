import { AppointmentSubject } from '@hms/shared-types';

type AppointmentSubjectSources = {
  patient: { id: string; mrn: string; fullName: string } | null;
  prospectivePatient: { id: string; fullName: string } | null;
};

/**
 * Collapses `P17-T02`'s two foreign keys into the one thing every read wants:
 * who this appointment is for.
 *
 * **This is the only place that branch is allowed to live.** A queue board, a
 * calendar chip and the arrival worklist all want a name and a badge, and three
 * independent branches would be three chances for one of them to render a
 * prospective patient as a registered one — showing a blank MRN where a clerk
 * reads a real record, which is the mistake that ends in a duplicate patient.
 *
 * Both sides are tested for a *value* rather than against `null`, because a
 * projection that omits the key entirely arrives as `undefined` — and
 * `undefined !== null` is true, so a strict null check would take the branch
 * for the side that is not there and fail on a property of nothing. A missing
 * relation and a null relation mean the same thing here and must behave the
 * same way.
 *
 * Throws rather than defaulting when neither side is set. The database CHECK
 * makes that state unreachable, so reaching it means the constraint was dropped
 * or a query forgot to select the relations — and a placeholder subject would
 * turn either into a booking silently attributed to nobody.
 */
export function resolveAppointmentSubject(sources: AppointmentSubjectSources): AppointmentSubject {
  if (sources.patient) {
    return {
      kind: 'PATIENT',
      id: sources.patient.id,
      fullName: sources.patient.fullName,
      mrn: sources.patient.mrn,
    };
  }
  if (sources.prospectivePatient) {
    return {
      kind: 'PROSPECTIVE_PATIENT',
      id: sources.prospectivePatient.id,
      fullName: sources.prospectivePatient.fullName,
    };
  }
  throw new Error(
    'Appointment has neither a patient nor a prospective patient; the one-subject CHECK should make this unreachable',
  );
}
