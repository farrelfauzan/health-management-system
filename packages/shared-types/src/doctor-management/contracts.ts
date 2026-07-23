export type DoctorProfile = {
  id: string;
  licenseNumber: string;
  fullName: string;
  specialty: string;
  phoneNumber?: string;
  ownerUserId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DoctorRelatedPatient = {
  id: string;
  assignmentId: string;
  mrn: string;
  fullName: string;
};

export type DoctorScheduleEntry = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  maxPatients: number | null;
};

export type DoctorListItem = DoctorProfile & {
  patientCount: number;
  schedules: DoctorScheduleEntry[];
};

export type DoctorDetail = DoctorProfile & {
  patientCount: number;
  schedules: DoctorScheduleEntry[];
  patients?: DoctorRelatedPatient[];
};

export type DoctorsListMeta = {
  page: number;
  limit: number;
  total: number;
};
