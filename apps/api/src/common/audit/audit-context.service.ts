import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

type AuditContextStore = {
  patientId: string | null;
};

const auditContextStorage = new AsyncLocalStorage<AuditContextStore>();

/**
 * Lets a service contribute the patient a request turned out to concern, for
 * the cases `AuditInterceptor` cannot infer (SJ-4).
 *
 * Most routes name their patient in the URL, the request body, or the
 * response. Clinical sub-resources do not: `POST /encounters/:encounterId/
 * diagnoses` returns a diagnosis, and nothing in the HTTP exchange says whose
 * chart it landed on. Without this, a patient's access history would show the
 * encounter being opened but not the diagnoses written into it — which is the
 * half people actually ask about.
 *
 * `AsyncLocalStorage` rather than a request-scoped provider: request scoping in
 * Nest propagates up the whole injection chain, rebuilding every service in it
 * per request, to move one string. The store is established once per request by
 * `AuditContextMiddleware` and read by the interceptor in the same async
 * context.
 */
@Injectable()
export class AuditContextService {
  runWithContext<TResult>(callback: () => TResult): TResult {
    return auditContextStorage.run({ patientId: null }, callback);
  }

  /**
   * Called from the services that resolve a patient while authorising the
   * request, so the cost is a field assignment on a lookup already performed.
   * First write wins: a handler touching two records should be filed under the
   * one it was authorised against, not the last one it happened to load.
   */
  setPatientId(patientId: string | null | undefined): void {
    const store = auditContextStorage.getStore();
    if (store && store.patientId === null && typeof patientId === 'string') {
      store.patientId = patientId;
    }
  }

  getPatientId(): string | null {
    return auditContextStorage.getStore()?.patientId ?? null;
  }
}
