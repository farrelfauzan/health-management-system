import {
  ShkScreeningRecord,
  ShkScreeningView,
  isShkSampleEarly,
  resolveShkScreeningStatus,
  resolveUserDisplayName,
} from '@hms/shared-types';

/** One worklist row as the wire carries it, with its status derived at `now`. */
export function toShkScreeningView(record: ShkScreeningRecord, now: Date): ShkScreeningView {
  const newborn = record.newbornCareRecord;
  const delivery = newborn.deliveryRecord;
  return {
    id: record.id,
    newbornCareRecordId: record.newbornCareRecordId,
    sequence: record.sequence,
    status: resolveShkScreeningStatus({ ...record, now }),
    dueFrom: record.dueFrom.toISOString(),
    dueUntil: record.dueUntil.toISOString(),
    sampleTakenAt: record.sampleTakenAt?.toISOString() ?? null,
    isEarly: isShkSampleEarly(record),
    sampleTakenByName:
      record.sampleTakenBy === null ? null : resolveUserDisplayName(record.sampleTakenBy),
    sentAt: record.sentAt?.toISOString() ?? null,
    laboratoryName: record.laboratoryName,
    resultReceivedAt: record.resultReceivedAt?.toISOString() ?? null,
    result: record.result,
    notes: record.notes,
    birthAt: delivery.birthAt.toISOString(),
    motherPatientId: delivery.pregnancyEpisode.patientId,
    motherName: delivery.pregnancyEpisode.patient.fullName,
    newbornPatientId: newborn.newbornPatientId,
    newbornName: newborn.newbornPatient?.fullName ?? null,
    sex: newborn.sex,
    attendantName: delivery.attendantDoctor.fullName,
  };
}
