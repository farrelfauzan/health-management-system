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
  // `document-management` keeps what it started as: the shared clinic corpus
  // and the personal knowledge bases the assistant retrieves from. `P16-T21`
  // split the Phase-16 epics out from under it, because a clinic buys a
  // patient's clinical file and a doctor's credential drawer separately from
  // a chatbot corpus, and §10 pilots them separately too.
  DocumentAdminController: 'document-management',
  PersonalDocumentController: 'document-management',
  // E1 — the rendered bill and the layouts behind it.
  DocumentTemplateController: 'invoice-documents',
  DocumentTemplateVariableController: 'invoice-documents',
  InvoiceDocumentController: 'invoice-documents',
  // E2 — the patient's clinical file, and the portal that releases it.
  PatientDocumentController: 'patient-documents',
  PatientDocumentDetailController: 'patient-documents',
  EncounterDocumentController: 'patient-documents',
  PortalDocumentController: 'patient-documents',
  // E3 — the doctor's own drawer. The only document feature with no clinic
  // reader at all, so the entitlement is an administrator's only lever.
  VaultDocumentController: 'doctor-credentials',
  VaultDocumentShareController: 'doctor-credentials',
  VaultShareRecipientController: 'doctor-credentials',
  SharedWithMeDocumentController: 'doctor-credentials',
  // E4 — sending a bill out of the building.
  InvoiceDeliveryController: 'invoice-delivery',
  DeliveryActionController: 'invoice-delivery',
  PatientDeliveryConsentController: 'invoice-delivery',
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
  // P16-T31. Only the deciding surface. The registry controller is
  // deliberately absent: with approval switched off the clinic still lists,
  // searches and exports its documents, and issues them directly (FR-E5-12).
  DocumentApprovalController: 'document-approval',
  // P18-T01. The whole module, catalog included: a clinic without the
  // laboratory feature has no lab screens at all, and a catalog it cannot
  // order from is not worth showing.
  LabTestController: 'laboratory',
  LabPanelController: 'laboratory',
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
  // P16-T21, §10.6. A patient holding a link the clinic already sent them
  // must not lose the bill because the clinic stopped *sending* new ones.
  // Withdrawing outstanding links is a second, deliberate step — revoking
  // them — and folding it into the entitlement would make the rollback
  // silently wider than the operator asked for. The token itself is the
  // authorisation here, and it is still checked, rate-limited and revocable.
  'DeliveryLinkPublicController',
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

  /**
   * `P16-T21` §4's acceptance criterion, structurally: with the five keys off,
   * no Phase-16 surface is reachable by any role.
   *
   * Named controller by controller rather than by module, because "the
   * documents module" is not the unit an entitlement sells — three of the five
   * epics live inside `document-management` and are sold apart from it.
   */
  it('gates every Phase-16 epic surface behind one of the five keys', () => {
    const PHASE_16_CONTROLLERS: readonly string[] = [
      'DocumentTemplateController',
      'DocumentTemplateVariableController',
      'InvoiceDocumentController',
      'PatientDocumentController',
      'PatientDocumentDetailController',
      'EncounterDocumentController',
      'PortalDocumentController',
      'VaultDocumentController',
      'VaultDocumentShareController',
      'VaultShareRecipientController',
      'SharedWithMeDocumentController',
      'InvoiceDeliveryController',
      'DeliveryActionController',
      'PatientDeliveryConsentController',
      'DocumentApprovalController',
    ];
    const PHASE_16_KEYS: readonly FeatureKey[] = [
      'invoice-documents',
      'patient-documents',
      'doctor-credentials',
      'invoice-delivery',
      'document-approval',
    ];

    const ungated = PHASE_16_CONTROLLERS.filter((name) => {
      const key = controllerFeatureKeys.get(name);
      return key === undefined || key === null || !PHASE_16_KEYS.includes(key);
    });
    expect(ungated).toEqual([]);
  });

  it('exempts nothing on an ungated controller, where the exemption would be dead', () => {
    const strayExemptions = [...handlerFeatureKeys.entries()]
      .filter(([, featureKey]) => featureKey === null)
      .map(([route]) => route)
      .filter((route) => controllerFeatureKeys.get(route.split('.')[0] ?? '') === undefined);
    expect(strayExemptions).toEqual([]);
  });
});
