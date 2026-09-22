import type { KohortRegisterKindValue, KohortRegisterResponse } from '@hms/shared-types';

import {
  getMaternalReportsControllerGetKohortBayiV1QueryKey,
  getMaternalReportsControllerGetKohortIbuV1QueryKey,
  getMaternalReportsControllerGetKohortKbV1QueryKey,
  maternalReportsControllerGetKohortBayiV1,
  maternalReportsControllerGetKohortIbuV1,
  maternalReportsControllerGetKohortKbV1,
} from '#lib/api/generated/maternal-reports/maternal-reports';
import { useApiQuery } from '#lib/api/use-api-query';

type UseKohortRegisterParams = {
  register: KohortRegisterKindValue;
  month: string;
  villageCode: string | null;
  enabled: boolean;
};

const REGISTER_CLIENTS = {
  'kohort-ibu': {
    queryKey: getMaternalReportsControllerGetKohortIbuV1QueryKey,
    fetch: maternalReportsControllerGetKohortIbuV1,
  },
  'kohort-bayi': {
    queryKey: getMaternalReportsControllerGetKohortBayiV1QueryKey,
    fetch: maternalReportsControllerGetKohortBayiV1,
  },
  'kohort-kb': {
    queryKey: getMaternalReportsControllerGetKohortKbV1QueryKey,
    fetch: maternalReportsControllerGetKohortKbV1,
  },
} as const;

/** One kohort register's JSON preview for a month and optional village (P25-T15). */
export function useKohortRegister({
  register,
  month,
  villageCode,
  enabled,
}: UseKohortRegisterParams) {
  const client = REGISTER_CLIENTS[register];
  const params = villageCode === null ? { month } : { month, villageCode };
  return useApiQuery<KohortRegisterResponse>({
    queryKey: client.queryKey(params),
    queryFn: (signal) => client.fetch(params, signal),
    errorMessage: 'Unable to load the register.',
    enabled,
  });
}
