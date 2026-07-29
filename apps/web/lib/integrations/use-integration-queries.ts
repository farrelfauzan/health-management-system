import type {
  BpjsMappingOverviewView,
  BpjsMonthlyReportView,
  BpjsPcareConfigView,
  BpjsReferenceCatalogStatusView,
  BpjsReferenceItemView,
  BpjsSubmissionView,
  SatusehatSubmissionView,
} from '@hms/shared-types';

import {
  bpjsMappingControllerGetOverviewV1,
  bpjsPcareConfigControllerGetConfigV1,
  bpjsReferenceControllerGetStatusV1,
  bpjsReferenceControllerSearchCatalogV1,
  bpjsReportControllerGetMonthlyReportV1,
  bpjsSubmissionControllerListSubmissionsV1,
  getBpjsMappingControllerGetOverviewV1QueryKey,
  getBpjsPcareConfigControllerGetConfigV1QueryKey,
  getBpjsReferenceControllerGetStatusV1QueryKey,
  getBpjsReferenceControllerSearchCatalogV1QueryKey,
  getBpjsReportControllerGetMonthlyReportV1QueryKey,
  getBpjsSubmissionControllerListSubmissionsV1QueryKey,
} from '#lib/api/generated/bpjs-pcare/bpjs-pcare';
import type { BpjsSubmissionControllerListSubmissionsV1Params } from '#lib/api/generated/model/bpjsSubmissionControllerListSubmissionsV1Params';
import {
  getSatusehatSubmissionControllerListSubmissionsV1QueryKey,
  satusehatSubmissionControllerListSubmissionsV1,
} from '#lib/api/generated/satusehat/satusehat';
import type { SatusehatSubmissionControllerListSubmissionsV1Params } from '#lib/api/generated/model/satusehatSubmissionControllerListSubmissionsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

export function useBpjsConfig(enabled = true) {
  return useApiQuery<BpjsPcareConfigView>({
    queryKey: getBpjsPcareConfigControllerGetConfigV1QueryKey(),
    queryFn: (signal) => bpjsPcareConfigControllerGetConfigV1(signal),
    errorMessage: 'Unable to load the BPJS PCare configuration.',
    enabled,
    options: { retry: false },
  });
}

export function useBpjsMappingOverview(enabled = true) {
  return useApiQuery<BpjsMappingOverviewView>({
    queryKey: getBpjsMappingControllerGetOverviewV1QueryKey(),
    queryFn: (signal) => bpjsMappingControllerGetOverviewV1(signal),
    errorMessage: 'Unable to load BPJS mappings.',
    enabled,
  });
}

export function useBpjsReferenceStatus(enabled = true) {
  return useApiQuery<BpjsReferenceCatalogStatusView[]>({
    queryKey: getBpjsReferenceControllerGetStatusV1QueryKey(),
    queryFn: (signal) => bpjsReferenceControllerGetStatusV1(signal),
    errorMessage: 'Unable to load BPJS reference status.',
    enabled,
  });
}

export function useBpjsReferenceCatalog(
  catalog: 'poli' | 'dokter' | 'dpho',
  search: string,
  enabled = true,
) {
  const params = { search: search || undefined, limit: 100 };
  return useApiQuery<BpjsReferenceItemView[]>({
    queryKey: getBpjsReferenceControllerSearchCatalogV1QueryKey(catalog, params),
    queryFn: (signal) => bpjsReferenceControllerSearchCatalogV1(catalog, params, signal),
    errorMessage: 'Unable to load the BPJS reference catalog.',
    enabled,
  });
}

export function useBpjsSubmissions(
  params: BpjsSubmissionControllerListSubmissionsV1Params,
  enabled = true,
) {
  const query = useApiQuery<BpjsSubmissionView[]>({
    queryKey: getBpjsSubmissionControllerListSubmissionsV1QueryKey(params),
    queryFn: (signal) => bpjsSubmissionControllerListSubmissionsV1(params, signal),
    errorMessage: 'Unable to load BPJS PCare submissions.',
    enabled,
  });
  return { ...query, submissions: query.data ?? [] };
}

export function useSatusehatSubmissions(
  params: SatusehatSubmissionControllerListSubmissionsV1Params,
  enabled = true,
) {
  const query = useApiQuery<SatusehatSubmissionView[]>({
    queryKey: getSatusehatSubmissionControllerListSubmissionsV1QueryKey(params),
    queryFn: (signal) => satusehatSubmissionControllerListSubmissionsV1(params, signal),
    errorMessage: 'Unable to load SATUSEHAT submissions.',
    enabled,
  });
  return { ...query, submissions: query.data ?? [] };
}

export function useBpjsMonthlyReport(month: string, enabled = true) {
  const params = { month };
  return useApiQuery<BpjsMonthlyReportView>({
    queryKey: getBpjsReportControllerGetMonthlyReportV1QueryKey(params),
    queryFn: (signal) => bpjsReportControllerGetMonthlyReportV1(params, signal),
    errorMessage: 'Unable to load the BPJS monthly reconciliation.',
    enabled,
  });
}
