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
export * from '#patient-management/schemas';
export * from '#patient-management/contracts';
export * from '#doctor-patient/schemas';
export * from '#doctor-patient/contracts';
export * from '#auth/schemas';
export * from '#rbac/schemas';
