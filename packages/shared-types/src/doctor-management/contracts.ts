export type DoctorProfile = {
  id: string;
  licenseNumber: string;
  fullName: string;
  specialtyId: string;
  specialty: string;
  phoneNumber?: string;
  email?: string;
  title?: string;
  degrees?: string;
  ownerUserId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DoctorEducation = {
  id: string;
  institution: string;
  degree: string;
  fieldOfStudy?: string;
  graduationYear?: number;
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
  educations: DoctorEducation[];
  patients?: DoctorRelatedPatient[];
};

export type DoctorsListMeta = {
  page: number;
  limit: number;
  total: number;
};
