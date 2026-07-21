import { useMemo } from 'react';
import type {
  DoctorsListMeta,
  PrescriptionsListMeta,
  RegistrationsListMeta,
} from '@hms/shared-types';

import {
  doctorManagementControllerListDoctorsV1,
  getDoctorManagementControllerListDoctorsV1QueryKey,
} from '#lib/api/generated/doctor-management/doctor-management';
import {
  getPrescriptionControllerListPrescriptionsV1QueryKey,
  prescriptionControllerListPrescriptionsV1,
} from '#lib/api/generated/pharmacy-flow/pharmacy-flow';
import {
  getRegistrationFlowControllerListRegistrationsV1QueryKey,
  registrationFlowControllerListRegistrationsV1,
} from '#lib/api/generated/registration-flow/registration-flow';
import { useApiQuery } from '#lib/api/use-api-query';
import { formatDateParam } from '#lib/appointments/week-range';
import { countUpcomingWithinHour } from '#lib/dashboard/upcoming-within-hour';
import { useTodayAppointments } from '#lib/dashboard/use-today-appointments';

const COUNT_ONLY_PARAMS = { page: 1, limit: 1 } as const;
const PENDING_PRESCRIPTION_STATUS = 'ISSUED' as const;

export function useDashboardStats() {
  const todayDate = useMemo(() => formatDateParam(new Date()), []);
  const registrationParams = {
    ...COUNT_ONLY_PARAMS,
    registeredFrom: todayDate,
    registeredTo: todayDate,
  };
  const todayRegistrationsQuery = useApiQuery({
    queryKey: getRegistrationFlowControllerListRegistrationsV1QueryKey(registrationParams),
    queryFn: (signal) => registrationFlowControllerListRegistrationsV1(registrationParams, signal),
    errorMessage: "Failed to load today's registrations",
  });
  const doctorParams = { ...COUNT_ONLY_PARAMS, isActive: 'true' as const };
  const activeDoctorsQuery = useApiQuery({
    queryKey: getDoctorManagementControllerListDoctorsV1QueryKey(doctorParams),
    queryFn: (signal) => doctorManagementControllerListDoctorsV1(doctorParams, signal),
    errorMessage: 'Failed to load active doctors',
  });
  const prescriptionParams = { ...COUNT_ONLY_PARAMS, status: PENDING_PRESCRIPTION_STATUS };
  const pendingPrescriptionsQuery = useApiQuery({
    queryKey: getPrescriptionControllerListPrescriptionsV1QueryKey(prescriptionParams),
    queryFn: (signal) => prescriptionControllerListPrescriptionsV1(prescriptionParams, signal),
    errorMessage: 'Failed to load pending prescriptions',
  });
  const todayAppointmentsQuery = useTodayAppointments();
  const upcomingWithinHour = useMemo(
    () => countUpcomingWithinHour(todayAppointmentsQuery.appointments, new Date()),
    [todayAppointmentsQuery.appointments],
  );
  return {
    todayRegistrationsQuery,
    todayRegistrationsMeta: todayRegistrationsQuery.meta as RegistrationsListMeta | undefined,
    activeDoctorsQuery,
    activeDoctorsMeta: activeDoctorsQuery.meta as DoctorsListMeta | undefined,
    pendingPrescriptionsQuery,
    pendingPrescriptionsMeta: pendingPrescriptionsQuery.meta as PrescriptionsListMeta | undefined,
    todayAppointmentsQuery,
    upcomingWithinHour,
  };
}
