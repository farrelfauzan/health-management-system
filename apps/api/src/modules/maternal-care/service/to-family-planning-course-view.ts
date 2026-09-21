import { FamilyPlanningCourseRecord, FamilyPlanningCourseView } from '@hms/shared-types';

import { toDateOnly } from '../to-date-only';

function toDateOnlyOrNull(value: Date | null): string | null {
  return value === null ? null : toDateOnly(value);
}

/** A stored course as the KB contract reads it (P25-T14). */
export function toFamilyPlanningCourseView(
  course: FamilyPlanningCourseRecord,
): FamilyPlanningCourseView {
  return {
    id: course.id,
    patientId: course.patientId,
    method: course.method,
    acceptorType: course.acceptorType,
    startedOn: toDateOnly(course.startedOn),
    providerDoctorId: course.providerDoctorId,
    providerName: course.providerDoctor.fullName,
    startEncounterId: course.startEncounterId,
    deliveryRecordId: course.deliveryRecordId,
    mandateId: course.mandateId,
    nextDueOn: toDateOnlyOrNull(course.nextDueOn),
    sideEffects: course.sideEffects,
    discontinuedOn: toDateOnlyOrNull(course.discontinuedOn),
    discontinuationReason: course.discontinuationReason,
    isLive: course.discontinuedOn === null,
    services: course.services.map((service) => ({
      id: service.id,
      encounterId: service.encounterId,
      servedOn: toDateOnly(service.servedOn),
      action: service.action,
      nextDueOn: toDateOnlyOrNull(service.nextDueOn),
    })),
  };
}
