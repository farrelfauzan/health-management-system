export type ApiSuccess<T> = {
  data: T;
  meta?: Record<string, unknown>;
  message?: string;
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export * from '#admin-management/schemas';
export * from '#admin-management/contracts';
export * from '#admin-management/types';
export * from '#patient-management/schemas';
export * from '#patient-management/contracts';
export * from '#patient-management/types';
export * from '#doctor-management/schemas';
export * from '#doctor-management/contracts';
export * from '#doctor-management/types';
export * from '#appointment-management/schemas';
export * from '#appointment-management/contracts';
export * from '#appointment-management/types';
export * from '#doctor-patient/schemas';
export * from '#doctor-patient/contracts';
export * from '#doctor-patient/types';
export * from '#auth/schemas';
export * from '#auth/types';
export * from '#rbac/schemas';
export * from '#rbac/types';
