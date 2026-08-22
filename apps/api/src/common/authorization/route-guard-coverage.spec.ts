import { RequestMethod, Type } from '@nestjs/common';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from '../../app.module';
import { AuditedRouteOptions } from '../audit/audit.types';
import { AUDITED_ROUTE_KEY } from '../audit/audited.decorator';
import { MfaRouteOptions } from '../auth/mfa-route-options.type';
import { MFA_ROUTE_KEY } from '../auth/mfa-route.decorator';
import { PERMISSION_CHECKER_KEY } from './check-permissions.decorator';
import { PermissionRule } from './permission-rule.type';
import { PUBLIC_ROUTE_KEY } from './public-route.decorator';

/**
 * SJ-3 — structural proof that every registered HTTP route is either
 * permission-guarded (`@CheckPermissions()` / `@Auth()`) or explicitly public
 * (`@PublicRoute()`). A developer who adds an undecorated route breaks this
 * spec — and at runtime `PermissionsGuard` denies the route by default, so the
 * failure mode is a denied route, never an open one.
 */

// Nest route metadata keys (`PATH_METADATA` / `METHOD_METADATA` from
// `@nestjs/common/constants`, redeclared to avoid importing internals).
const ROUTE_PATH_METADATA_KEY = 'path';
const ROUTE_METHOD_METADATA_KEY = 'method';

/**
 * Reviewed decision list: every route that is deliberately public. Growing
 * this array is an explicit, diff-visible act in the PR that adds the route.
 */
const PUBLIC_ROUTE_ALLOWLIST: readonly string[] = [
  'AuthController.answerMfaChallenge',
  'AuthController.beginMfaEnrolment',
  'AuthController.lockSession',
  'AuthController.login',
  'AuthController.logout',
  'AuthController.recordSessionActivity',
  'AuthController.refresh',
  'AuthController.verifyMfaEnrolment',
  'BpjsAntreanWsController.cancel',
  'BpjsAntreanWsController.getRemaining',
  'BpjsAntreanWsController.getStatus',
  'BpjsAntreanWsController.issueToken',
  'BpjsAntreanWsController.registerNewPatient',
  'BpjsAntreanWsController.takeQueueNumber',
  'HealthController.getHealth',
  'TelegramWebhookController.receiveUpdate',
  'WhatsappWebhookController.receiveEvent',
];

/**
 * Fails loudly if route discovery ever silently collapses (157 routes at the
 * time of writing). Lower it consciously if modules are legitimately removed.
 */
const ROUTE_COUNT_SANITY_FLOOR = 150;

type RouteGuardInfo = {
  readonly route: string;
  readonly httpRoute: string;
  readonly isPublic: boolean;
  readonly permissionRules: readonly PermissionRule[] | undefined;
  readonly auditedOptions: AuditedRouteOptions | undefined;
  readonly mfaRouteOptions: MfaRouteOptions | undefined;
};

/**
 * SJ-8 — routes that stand the global guards down and authenticate themselves
 * with `MfaTicketGuard` instead, because they are the machinery that decides
 * whether a session exists yet. They are public in the metadata sense only;
 * the spec below proves each one still declares a credential.
 */
const SELF_AUTHENTICATING_ROUTES: readonly string[] = [
  'AuthController.answerMfaChallenge',
  'AuthController.beginMfaEnrolment',
  'AuthController.verifyMfaEnrolment',
];

/**
 * SJ-4 — the controllers whose routes touch patient-identifiable data. Every
 * route on these classes must carry `@Audited()`, with the named exceptions
 * below. The list is a controller list rather than a route list on purpose: a
 * new route added to `PatientManagementController` is patient data by default
 * and has to be argued out, not argued in.
 */
const AUDITED_CONTROLLERS: readonly string[] = [
  'AdmissionFlowController',
  'AppointmentManagementController',
  'AuditController',
  'ChatController',
  'DispenseController',
  'EncounterClinicalDataController',
  'EncounterController',
  'PatientManagementController',
  'PrescriptionController',
  'RegistrationFlowController',
];

/**
 * Routes on an audited controller that deliberately write no audit row,
 * because they read no patient-identifiable data.
 */
const UNAUDITED_ROUTE_ALLOWLIST: readonly string[] = [
  // The clinic's current privacy-notice text. A published document, identical
  // for every caller, and naming nobody.
  'PatientManagementController.getCurrentPrivacyNotice',
  // Whether a chatbot provider is configured at all. Answers yes or no.
  'ChatController.getAvailability',
];

describe('Route guard coverage (deny by default)', () => {
  let testingModule: TestingModule;
  let discoveredRoutes: RouteGuardInfo[];

  beforeAll(async () => {
    testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    discoveredRoutes = collectRoutes(testingModule.get(ModulesContainer, { strict: false }));
  });

  afterAll(async () => {
    await testingModule.close();
  });

  it('discovers at least the sanity floor of registered routes', () => {
    expect(discoveredRoutes.length).toBeGreaterThanOrEqual(ROUTE_COUNT_SANITY_FLOOR);
  });

  it('leaves no route without permission metadata or an explicit public marker', () => {
    const offendingRoutes = discoveredRoutes
      .filter((route) => !route.isPublic && !hasPermissionRules(route))
      .map((route) => `${route.route} (${route.httpRoute})`);
    expect(offendingRoutes).toEqual([]);
  });

  it('declares no route both public and permission-guarded', () => {
    const contradictoryRoutes = discoveredRoutes
      .filter((route) => route.isPublic && hasPermissionRules(route))
      .map((route) => `${route.route} (${route.httpRoute})`);
    expect(contradictoryRoutes).toEqual([]);
  });

  it('audits every route on a patient-data controller', () => {
    const unauditedRoutes = discoveredRoutes
      .filter((route) => AUDITED_CONTROLLERS.includes(route.route.split('.')[0] ?? ''))
      .filter((route) => route.auditedOptions === undefined)
      .map((route) => route.route)
      .filter((route) => !UNAUDITED_ROUTE_ALLOWLIST.includes(route))
      .sort();
    expect(unauditedRoutes).toEqual([]);
  });

  it('declares a resource and action on every audited route', () => {
    const malformedRoutes = discoveredRoutes
      .filter((route) => route.auditedOptions !== undefined)
      .filter(
        (route) =>
          !route.auditedOptions?.resource?.trim() || !route.auditedOptions?.action?.trim(),
      )
      .map((route) => route.route);
    expect(malformedRoutes).toEqual([]);
  });

  it('never audits a public route, which has no actor to attribute', () => {
    const attributionlessRoutes = discoveredRoutes
      .filter((route) => route.isPublic && route.auditedOptions !== undefined)
      .map((route) => route.route);
    expect(attributionlessRoutes).toEqual([]);
  });

  it('gives every self-authenticating route an MFA credential declaration', () => {
    const undeclaredRoutes = SELF_AUTHENTICATING_ROUTES.filter(
      (route) =>
        discoveredRoutes.find((discovered) => discovered.route === route)?.mfaRouteOptions ===
        undefined,
    );
    expect(undeclaredRoutes).toEqual([]);
  });

  it('declares no MFA credential on a route outside that set', () => {
    // The inverse guard: `@MfaRoute()` also marks a route public, so applying
    // it anywhere else would quietly remove that route's permission check.
    const strayRoutes = discoveredRoutes
      .filter((route) => route.mfaRouteOptions !== undefined)
      .map((route) => route.route)
      .filter((route) => !SELF_AUTHENTICATING_ROUTES.includes(route))
      .sort();
    expect(strayRoutes).toEqual([]);
  });

  it('keeps public routes limited to the reviewed allowlist', () => {
    const publicRoutes = discoveredRoutes
      .filter((route) => route.isPublic)
      .map((route) => route.route)
      .sort();
    expect(publicRoutes).toEqual([...PUBLIC_ROUTE_ALLOWLIST].sort());
  });
});

function hasPermissionRules(route: RouteGuardInfo): boolean {
  return route.permissionRules !== undefined && route.permissionRules.length > 0;
}

function collectRoutes(modulesContainer: ModulesContainer): RouteGuardInfo[] {
  const metadataScanner = new MetadataScanner();
  const reflector = new Reflector();
  const routesByKey = new Map<string, RouteGuardInfo>();
  for (const moduleWrapper of modulesContainer.values()) {
    for (const controllerWrapper of moduleWrapper.controllers.values()) {
      const controllerClass = controllerWrapper.metatype as Type<unknown> | undefined;
      if (typeof controllerClass !== 'function') {
        continue;
      }
      const controllerPrototype = controllerClass.prototype as Record<string, unknown>;
      for (const methodName of metadataScanner.getAllMethodNames(controllerPrototype)) {
        const routeInfo = buildRouteInfo({ controllerClass, controllerPrototype, methodName, reflector });
        if (routeInfo) {
          routesByKey.set(routeInfo.route, routeInfo);
        }
      }
    }
  }
  return [...routesByKey.values()];
}

function buildRouteInfo(input: {
  controllerClass: Type<unknown>;
  controllerPrototype: Record<string, unknown>;
  methodName: string;
  reflector: Reflector;
}): RouteGuardInfo | undefined {
  const { controllerClass, controllerPrototype, methodName, reflector } = input;
  const handler = controllerPrototype[methodName];
  if (typeof handler !== 'function') {
    return undefined;
  }
  const requestMethod = Reflect.getMetadata(ROUTE_METHOD_METADATA_KEY, handler) as
    | RequestMethod
    | undefined;
  if (requestMethod === undefined) {
    return undefined;
  }
  const routePath = (Reflect.getMetadata(ROUTE_PATH_METADATA_KEY, handler) as string | undefined) ?? '/';
  const isPublic =
    reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [handler, controllerClass]) === true;
  const permissionRules = reflector.getAllAndOverride<PermissionRule[] | undefined>(
    PERMISSION_CHECKER_KEY,
    [handler, controllerClass],
  );
  const auditedOptions = reflector.getAllAndOverride<AuditedRouteOptions | undefined>(
    AUDITED_ROUTE_KEY,
    [handler, controllerClass],
  );
  const mfaRouteOptions = reflector.getAllAndOverride<MfaRouteOptions | undefined>(MFA_ROUTE_KEY, [
    handler,
    controllerClass,
  ]);
  return {
    route: `${controllerClass.name}.${methodName}`,
    httpRoute: `${RequestMethod[requestMethod]} ${routePath}`,
    isPublic,
    permissionRules,
    auditedOptions,
    mfaRouteOptions,
  };
}
