export type ListDoctorsParams = {
  page: number;
  limit: number;
  search?: string;
  patientId?: string;
};

export type CreateDoctorRecordPayload = {
  licenseNumber: string;
  fullName: string;
  specialty: string;
  phoneNumber: string;
  ownerUserId?: string;
  isActive: boolean;
  patientIds?: string[];
  actorUserId: string;
};

export type DoctorRecord = {
  id: string;
  licenseNumber: string;
  fullName: string;
  specialty: string;
  phoneNumber: string | null;
  ownerUserId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type DoctorScheduleRecord = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
};

export type ReplaceDoctorSchedulesPayload = {
  doctorId: string;
  entries: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }>;
};
