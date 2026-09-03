import { Type } from '@nestjs/common';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { FEATURE_KEYS, FeatureKey, isFeatureKey } from '@hms/shared-types';

import { AppModule } from '../../app.module';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';

/**
 * IMP-8 — structural proof of which controllers an entitlement can switch off,
 * and which it deliberately cannot.
 *
 * `@RequireFeature()` is class-level, so this is a controller list rather than
 * a route list: a route added to `ChatController` tomorrow is part of the
 * chatbot whether or not anyone remembers to say so. Changing either list
 * below is an explicit, diff-visible act in the PR that changes the gating.
 */

/**
 * The controllers a disabled feature silences, and which feature silences
 * them.
 */
const GATED_CONTROLLERS: Readonly<Record<string, FeatureKey>> = {
  AiProviderController: 'ai-chatbot',
  ChatController: 'ai-chatbot',
  DocumentAdminController: 'document-management',
  PersonalDocumentController: 'document-management',
  PatientDocumentController: 'document-management',
  PatientDocumentDetailController: 'document-management',
  EncounterDocumentController: 'document-management',
  PortalDocumentController: 'document-management',
  VaultDocumentController: 'document-management',
  VaultDocumentShareController: 'document-management',
  SharedWithMeDocumentController: 'document-management',
  BpjsEligibilityController: 'bpjs-pcare',
  BpjsMappingController: 'bpjs-pcare',
  BpjsPcareConfigController: 'bpjs-pcare',
  BpjsReferenceController: 'bpjs-pcare',
  BpjsReportController: 'bpjs-pcare',
  BpjsSubmissionController: 'bpjs-pcare',
  BpjsAntreanConfigController: 'bpjs-antrean',
  BpjsAntreanWsController: 'bpjs-antrean',
  SatusehatLinkController: 'satusehat',
  SatusehatSubmissionController: 'satusehat',
  ChannelGatewayAdminController: 'cs-channels',
  TelegramWebhookController: 'cs-channels',
  WhatsappWebhookController: 'cs-channels',
  CsAdminController: 'cs-channels',
  ChannelArrivalController: 'cs-channels',
  RoomClassController: 'room-management',
  WardController: 'room-management',
  RoomController: 'room-management',
  BedController: 'room-management',
  RoomOccupancyController: 'room-management',
  AdmissionFlowController: 'room-management',
};

/**
 * Platform core: no entitlement may take these away. A clinic that switched
 * off patients would not have a cheaper HMS, it would have a broken one — and
 * `rbac` and `admin-management` are how anyone would switch a feature back on.
 */
const NEVER_GATED_CONTROLLERS: readonly string[] = [
  'AuthController',
  'HealthController',
  'RbacController',
  'AdminManagementController',
  'AuditController',
  'FeatureAdminController',
  'FeatureAvailabilityController',
  // SJ-1. The org chart is back-office structure with no clinical surface
  // hanging off it, so there is nothing an entitlement would be selling. It
  // sits beside `admin-management` for the same reason: it describes the
  // clinic itself, not a module the clinic bought.
  'OrganizationUnitController',
  'OrganizationUnitMemberController',
];

/**
 * Catalog keys that hide navigation (IMP-9) but do not yet refuse endpoints.
 * `pharmacy` and `billing` were left out of IMP-8's enumerated scope; IMP-18
 * closes them. Listing them here is what keeps the gap a decision rather than
 * an oversight. `room-management` left this list when IMP-13 gave it a module.
 */
const NOT_YET_ENFORCED_KEYS: readonly FeatureKey[] = ['pharmacy', 'billing'];

/**
 * Routes that stay reachable while their controller's feature is off, so a
 * client can discover the state rather than infer it from a failure.
 */
const FEATURE_INDEPENDENT_ROUTES: readonly string[] = ['ChatController.getAvailability'];

describe('Feature guard coverage', () => {
  let testingModule: TestingModule;
  let controllerFeatureKeys: Map<string, FeatureKey | null | undefined>;
  let handlerFeatureKeys: Map<string, FeatureKey | null | undefined>;

  beforeAll(async () => {
    testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const reflector = new Reflector();
    const modulesContainer = testingModule.get(ModulesContainer, { strict: false });
    controllerFeatureKeys = new Map();
    handlerFeatureKeys = new Map();
    for (const moduleWrapper of modulesContainer.values()) {
      for (const controllerWrapper of moduleWrapper.controllers.values()) {
        const controllerClass = controllerWrapper.metatype as Type<unknown> | undefined;
        if (typeof controllerClass !== 'function') {
          continue;
        }
        controllerFeatureKeys.set(
          controllerClass.name,
          reflector.get<FeatureKey | null | undefined>(REQUIRE_FEATURE_KEY, controllerClass),
        );
        const prototype = controllerClass.prototype as Record<string, unknown>;
        for (const methodName of Object.getOwnPropertyNames(prototype)) {
          const handler = prototype[methodName];
          if (typeof handler !== 'function' || methodName === 'constructor') {
            continue;
          }
          const declared = reflector.get<FeatureKey | null | undefined>(
            REQUIRE_FEATURE_KEY,
            handler,
          );
          if (declared !== undefined) {
            handlerFeatureKeys.set(`${controllerClass.name}.${methodName}`, declared);
          }
        }
      }
    }
  });

  afterAll(async () => {
    await testingModule.close();
  });

  it('gates exactly the reviewed controllers, with the reviewed keys', () => {
    const actual = Object.fromEntries(
      [...controllerFeatureKeys.entries()]
        .filter(([, featureKey]) => featureKey !== undefined && featureKey !== null)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    const expected = Object.fromEntries(
      Object.entries(GATED_CONTROLLERS).sort(([left], [right]) => left.localeCompare(right)),
    );
    expect(actual).toEqual(expected);
  });

  it('names only real catalog keys', () => {
    const strayKeys = Object.values(GATED_CONTROLLERS).filter((key) => !isFeatureKey(key));
    expect(strayKeys).toEqual([]);
  });

  it('leaves platform core ungated', () => {
    const gatedCore = NEVER_GATED_CONTROLLERS.filter(
      (name) => controllerFeatureKeys.get(name) !== undefined,
    );
    expect(gatedCore).toEqual([]);
  });

  it('accounts for every catalog key as enforced or explicitly not yet enforced', () => {
    const enforcedKeys = new Set(Object.values(GATED_CONTROLLERS));
    const unaccountedKeys = FEATURE_KEYS.filter(
      (key) => !enforcedKeys.has(key) && !NOT_YET_ENFORCED_KEYS.includes(key),
    );
    expect(unaccountedKeys).toEqual([]);
  });

  it('keeps the feature-independent exemptions limited to the reviewed list', () => {
    const exemptRoutes = [...handlerFeatureKeys.entries()]
      .filter(([, featureKey]) => featureKey === null)
      .map(([route]) => route)
      .sort();
    expect(exemptRoutes).toEqual([...FEATURE_INDEPENDENT_ROUTES].sort());
  });

  it('exempts nothing on an ungated controller, where the exemption would be dead', () => {
    const strayExemptions = [...handlerFeatureKeys.entries()]
      .filter(([, featureKey]) => featureKey === null)
      .map(([route]) => route)
      .filter((route) => controllerFeatureKeys.get(route.split('.')[0] ?? '') === undefined);
    expect(strayExemptions).toEqual([]);
  });
});
