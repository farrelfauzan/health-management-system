import type {
  BpjsAntreanConfigView,
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
import {
  bpjsAntreanConfigControllerGetConfigV1,
  getBpjsAntreanConfigControllerGetConfigV1QueryKey,
} from '#lib/api/generated/bpjs-antrean/bpjs-antrean';
import type { BpjsSubmissionControllerListSubmissionsV1Params } from '#lib/api/generated/model/bpjsSubmissionControllerListSubmissionsV1Params';
import {
  getSatusehatSubmissionControllerListSubmissionsV1QueryKey,
  satusehatSubmissionControllerListSubmissionsV1,
} from '#lib/api/generated/satusehat/satusehat';
import type { SatusehatSubmissionControllerListSubmissionsV1Params } from '#lib/api/generated/model/satusehatSubmissionControllerListSubmissionsV1Params';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * How often the submission monitors re-read their outbox lists. Matched to the
 * workers' own cadence (`SATUSEHAT_WORKER_POLL_INTERVAL_MS` /
 * `BPJS_WORKER_POLL_INTERVAL_MS`, both 15 s): polling faster only adds traffic,
 * polling slower leaves an admin watching a retry in front of a stale table.
 */
export const INTEGRATION_MONITOR_POLL_INTERVAL_MS = 15_000;

export function useBpjsConfig(enabled = true) {
  return useApiQuery<BpjsPcareConfigView>({
    queryKey: getBpjsPcareConfigControllerGetConfigV1QueryKey(),
    queryFn: (signal) => bpjsPcareConfigControllerGetConfigV1(signal),
    errorMessage: 'Unable to load the BPJS PCare configuration.',
    enabled,
    options: { retry: false },
  });
}

export function useBpjsAntreanConfig(enabled = true) {
  return useApiQuery<BpjsAntreanConfigView>({
    queryKey: getBpjsAntreanConfigControllerGetConfigV1QueryKey(),
    queryFn: (signal) => bpjsAntreanConfigControllerGetConfigV1(signal),
    errorMessage: 'Unable to load the BPJS Antrean configuration.',
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

/**
 * `isPollingPaused` is set while a retry mutation is in flight for this list.
 * The retry endpoint answers with the settled row and the mutation invalidates
 * on success; a poll landing in between would paint the pre-retry state over
 * it and flash. Pausing the interval is not the same as disabling the query —
 * the rows stay on screen throughout.
 */
export function useBpjsSubmissions(
  params: BpjsSubmissionControllerListSubmissionsV1Params,
  enabled = true,
  isPollingPaused = false,
) {
  const query = useApiQuery<BpjsSubmissionView[]>({
    queryKey: getBpjsSubmissionControllerListSubmissionsV1QueryKey(params),
    queryFn: (signal) => bpjsSubmissionControllerListSubmissionsV1(params, signal),
    errorMessage: 'Unable to load BPJS PCare submissions.',
    enabled,
    options: {
      refetchInterval: isPollingPaused ? false : INTEGRATION_MONITOR_POLL_INTERVAL_MS,
      refetchIntervalInBackground: false,
    },
  });
  return { ...query, submissions: query.data ?? [] };
}

export function useSatusehatSubmissions(
  params: SatusehatSubmissionControllerListSubmissionsV1Params,
  enabled = true,
  isPollingPaused = false,
) {
  const query = useApiQuery<SatusehatSubmissionView[]>({
    queryKey: getSatusehatSubmissionControllerListSubmissionsV1QueryKey(params),
    queryFn: (signal) => satusehatSubmissionControllerListSubmissionsV1(params, signal),
    errorMessage: 'Unable to load SATUSEHAT submissions.',
    enabled,
    options: {
      refetchInterval: isPollingPaused ? false : INTEGRATION_MONITOR_POLL_INTERVAL_MS,
      refetchIntervalInBackground: false,
    },
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
