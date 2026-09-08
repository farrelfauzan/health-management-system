import {
  CancelLabOrderInput,
  CancelLabOrderMeta,
  ClinicalRequestDispositionInput,
  ClinicalRequestDocumentView,
  CreateLabOrderInput,
  CreateLabOrderItemPayload,
  CreateWalkInLabOrderInput,
  LabOrderListItem,
  ActorScopeResolution,
  LabOrderRecord,
  LabOrderSummary,
  LabOrderView,
  LabOrdersListMeta,
  LabPanelRecord,
  LabTestRecord,
  getStartOfCalendarDateInTimeZone,
} from '@hms/shared-types';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { BillingService } from '../../billing/service/billing.service';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { ClinicalRequestDocumentService } from '../../clinical-request-document/service/clinical-request-document.service';
import { buildLabRequestContext } from './build-lab-request-context';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { CreateLabOrderDto } from '../dto/create-lab-order.dto';
import { ListLabOrdersQueryDto } from '../dto/list-lab-orders-query.dto';
import { LabOrderRepository } from '../repository/lab-order.repository';
import { LabCatalogService } from './lab-catalog.service';
import { LabOrderAccessService } from './lab-order-access.service';
import { RegistrationFlowService } from '../../registration-flow/service/registration-flow.service';
import { LabOrderMapper } from './lab-order.mapper';
import { resolveLabRequesterLabel } from './resolve-lab-requester-label';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

const DEFAULT_PAGE = 1;

const DEFAULT_PAGE_SIZE = 20;

const DAY_IN_MILLISECONDS = 86_400_000;

/** Statuses from which an order can still be withdrawn: nothing has been measured yet. */
const CANCELLABLE_STATUSES = ['ORDERED', 'COLLECTED'] as const;

/**
 * Lab ordering: the clinical instruction, and the unit every later part of P18
 * attaches to.
 *
 * The rules that matter here are the ones that stop a patient being drawn or
 * charged twice — a panel is expanded once, a test already live on the visit is
 * refused with the order number the patient is waiting on, and a withdrawn
 * order always says why.
 */
@Injectable()
export class LabOrderService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly labOrderRepository: LabOrderRepository,
    private readonly labCatalogService: LabCatalogService,
    private readonly labOrderAccessService: LabOrderAccessService,
    private readonly labOrderMapper: LabOrderMapper,
    private readonly auditService: AuditService,
    private readonly billingService: BillingService,
    private readonly clinicProfileService: ClinicProfileService,
    private readonly clinicalRequestDocumentService: ClinicalRequestDocumentService,
    private readonly registrationFlowService: RegistrationFlowService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async createLabOrder(
    encounterId: string,
    payload: CreateLabOrderDto,
    currentUser: CurrentUser,
  ): Promise<LabOrderView> {
    const scope = await this.labOrderAccessService.resolveScopeOrThrow(currentUser, 'write');
    const encounter = await this.findEncounterOrThrow(encounterId);
    this.labOrderAccessService.assertCanOrderOnEncounter({ encounter, scope, currentUser });
    this.assertEncounterOpen(encounter.status);
    const items = await this.buildOrderItems(payload);
    await this.assertTestsNotAlreadyOrdered(encounterId, items);
    const created = await this.labOrderRepository.createLabOrder({
      encounterId,
      registrationId: encounter.registrationId,
      source: 'ENCOUNTER',
      patientId: encounter.patientId,
      orderedById: encounter.doctorId,
      externalRequesterName: null,
      externalRequesterFacility: null,
      priority: payload.priority ?? 'ROUTINE',
      clinicalNotes: payload.clinicalNotes ?? null,
      isFasting: payload.isFasting ?? false,
      fulfilmentSite: payload.fulfilmentSite ?? 'INTERNAL',
      chargeMode: payload.chargeMode ?? 'CLINIC',
      externalFacilityName: payload.externalFacilityName ?? null,
      orderedAt: new Date(),
      items,
    });
    await this.auditService.record({
      action: 'LAB_ORDER_CREATED',
      resource: 'LabOrder',
      resourceId: created.id,
      actorUserId: currentUser.sub,
      patientId: encounter.patientId,
      metadata: {
        orderNumber: created.orderNumber,
        encounterId,
        itemCount: created.items.length,
        priority: created.priority,
      },
    });

    return this.labOrderMapper.toLabOrderView(created);
  }

  async listEncounterLabOrders(
    encounterId: string,
    currentUser: CurrentUser,
  ): Promise<LabOrderView[]> {
    const scope = await this.labOrderAccessService.resolveScopeOrThrow(currentUser, 'read');
    const encounter = await this.findEncounterOrThrow(encounterId);
    this.labOrderAccessService.assertCanReadEncounterOrders({ encounter, scope, currentUser });
    const records = await this.labOrderRepository.findLabOrdersByEncounterId(encounterId);

    return records.map((record) => this.labOrderMapper.toLabOrderView(record));
  }

  /**
   * The clinic-wide list, behind `lab-order.read:any`. No OWN branch: a list
   * filtered to one doctor's own orders is what the encounter route already
   * returns, and widening this one to OWN would leak every other patient's
   * order numbers to anyone holding the narrower key.
   */
  async listLabOrders(query: ListLabOrdersQueryDto): Promise<{
    items: LabOrderListItem[];
    meta: LabOrdersListMeta;
  }> {
    const result = await this.labOrderRepository.listLabOrders({
      page: query.page ?? DEFAULT_PAGE,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      orderNumber: query.orderNumber,
      status: query.status,
      patientId: query.patientId,
      orderedFrom: query.from ? this.toClinicDayStart(query.from) : undefined,
      orderedTo: query.to ? this.toExclusiveClinicDayEnd(query.to) : undefined,
    });

    return {
      items: result.items.map((item) => this.labOrderMapper.toLabOrderListItem(item)),
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  async getLabOrderById(id: string, currentUser: CurrentUser): Promise<LabOrderView> {
    const order = await this.findLabOrderOrThrow(id);
    const scope = await this.labOrderAccessService.resolveScopeOrThrow(currentUser, 'read');
    await this.assertCanAccessOrder(order, scope, currentUser, 'read');

    return this.labOrderMapper.toLabOrderView(order);
  }

  /**
   * Withdraws an order that has not been measured yet. Once a result exists the
   * order is history: correcting it is a result-level act, not a cancellation.
   */
  async cancelLabOrder(
    id: string,
    payload: CancelLabOrderInput,
    currentUser: CurrentUser,
  ): Promise<{ order: LabOrderView; meta: CancelLabOrderMeta }> {
    const order = await this.findLabOrderOrThrow(id);
    const scope = await this.labOrderAccessService.resolveScopeOrThrow(currentUser, 'write');
    await this.assertCanAccessOrder(order, scope, currentUser, 'write');
    this.assertCancellable(order);
    const cancelled = await this.labOrderRepository.cancelLabOrder({
      id: order.id,
      cancelledAt: new Date(),
      cancelReason: payload.reason,
    });
    // P18-T06: an issued bill is corrected by voiding and reissuing, which is
    // not the laboratory's to do. Say so rather than leave the patient charged
    // for a test nobody ran.
    const requiresManualCredit = await this.billingService.hasIssuedInvoiceForVisit(
      order.registrationId,
    );
    await this.auditService.record({
      action: 'LAB_ORDER_CANCELLED',
      resource: 'LabOrder',
      resourceId: order.id,
      actorUserId: currentUser.sub,
      patientId: order.patientId,
      metadata: {
        orderNumber: order.orderNumber,
        previousStatus: order.status,
        requiresManualCredit,
      },
    });

    return { order: this.labOrderMapper.toLabOrderView(cancelled), meta: { requiresManualCredit } };
  }

  /**
   * Moves an order between "we run it" and "they run it", and between "we bill
   * it" and "somebody else does" (P18-T11).
   *
   * A separate route because the decision is usually made after the doctor has
   * finished: the patient reaches the counter, hears the price, and says they
   * will go to the lab their insurer uses. Audited with the before and the
   * after, because "we were told the patient would go elsewhere" is exactly
   * what a later billing dispute turns on.
   */
  async updateDisposition(
    id: string,
    payload: ClinicalRequestDispositionInput,
    currentUser: CurrentUser,
  ): Promise<LabOrderView> {
    const order = await this.findLabOrderOrThrow(id);
    const scope = await this.labOrderAccessService.resolveScopeOrThrow(currentUser, 'write');
    await this.assertCanAccessOrder(order, scope, currentUser, 'write');
    this.assertDispositionStillOpen(order);
    const updated = await this.labOrderRepository.updateLabOrderDisposition({
      id: order.id,
      fulfilmentSite: payload.fulfilmentSite,
      chargeMode: payload.chargeMode,
      externalFacilityName: payload.externalFacilityName ?? null,
    });
    await this.auditService.record({
      action: 'LAB_ORDER_DISPOSITION_CHANGED',
      resource: 'LabOrder',
      resourceId: order.id,
      actorUserId: currentUser.sub,
      patientId: order.patientId,
      metadata: {
        orderNumber: order.orderNumber,
        from: { fulfilmentSite: order.fulfilmentSite, chargeMode: order.chargeMode },
        to: { fulfilmentSite: payload.fulfilmentSite, chargeMode: payload.chargeMode },
        externalFacilityName: payload.externalFacilityName ?? null,
      },
    });

    return this.labOrderMapper.toLabOrderView(updated);
  }

  /**
   * Renders the surat pengantar the patient carries to the lab counter
   * (P18-T12), and files it as a clinical document on the visit.
   *
   * Rendered from the order rather than drafted, which is the whole point: the
   * letter and the order can then never disagree about which tests were
   * requested. Reprinting is allowed and expected — paper gets lost — and
   * replaces the stored file rather than filing a second copy.
   *
   * Never a state change: printing does not move the order, and a request that
   * was never printed is still a request the lab must run.
   */
  async printRequestLetter(
    id: string,
    currentUser: CurrentUser,
  ): Promise<ClinicalRequestDocumentView> {
    const order = await this.findLabOrderOrThrow(id);
    const scope = await this.labOrderAccessService.resolveScopeOrThrow(currentUser, 'read');
    await this.assertCanAccessOrder(order, scope, currentUser, 'read');
    const worklistOrder = await this.labOrderRepository.findWorklistOrderById(order.id);

    if (!worklistOrder) {
      throw new NotFoundException('Lab order not found');
    }
    const context = buildLabRequestContext({
      order,
      patient: worklistOrder.patient,
      doctorName: resolveLabRequesterLabel(order),
      doctorLicenseNumber: worklistOrder.orderedByLicenseNumber,
      clinic: await this.clinicProfileService.getProfile(),
      clinicLogoDataUri: null,
    });

    return this.clinicalRequestDocumentService.renderAndFile(context, currentUser.sub);
  }

  /**
   * The orders still outstanding when a visit is closed (P18-T02). Closing is
   * allowed with work in flight — results arrive after the patient has gone
   * home — so the close response names them instead of refusing.
   */
  async findOpenOrdersForEncounter(encounterId: string): Promise<LabOrderSummary[]> {
    const records = await this.labOrderRepository.findLabOrdersByEncounterId(encounterId);

    return records
      .filter((record) => record.status !== 'RELEASED' && record.status !== 'CANCELLED')
      .map((record) => this.labOrderMapper.toLabOrderSummary(record));
  }

  /**
   * Expands panels into their members at order time so a later panel edit never
   * rewrites what was actually ordered, and keeps `panelId` on each expanded
   * row so billing can price the panel once (P18-T06).
   *
   * A test named both loosely and inside a panel keeps its panel: the clinic
   * sold the panel, and charging the loose price on top of it would double-bill
   * the same tube.
   */
  private async buildOrderItems(
    payload: CreateLabOrderInput,
  ): Promise<CreateLabOrderItemPayload[]> {
    this.assertNoRepeatsInRequest(payload.testIds ?? [], 'test');
    this.assertNoRepeatsInRequest(payload.panelIds ?? [], 'panel');
    const testIds = payload.testIds ?? [];
    const panelIds = payload.panelIds ?? [];
    const [tests, panels] = await Promise.all([
      testIds.length > 0 ? this.labCatalogService.findOrderableLabTests(testIds) : [],
      panelIds.length > 0 ? this.labCatalogService.findOrderableLabPanels(panelIds) : [],
    ]);
    this.assertAllOrderable(testIds, tests, 'test');
    this.assertAllOrderable(panelIds, panels, 'panel');
    const panelIdByTestId = new Map<string, string>();
    for (const panel of panels) {
      for (const member of panel.members) {
        panelIdByTestId.set(member.labTestId, panel.id);
      }
    }
    const items = new Map<string, CreateLabOrderItemPayload>();
    for (const labTestId of [...panelIdByTestId.keys(), ...testIds]) {
      items.set(labTestId, { labTestId, panelId: panelIdByTestId.get(labTestId) ?? null });
    }

    return [...items.values()];
  }

  /**
   * A request naming the same test twice is a mistake in the form, not an
   * instruction to run it twice — the database's `@@unique([labOrderId,
   * labTestId])` would refuse it anyway, and a readable 409 says which one.
   *
   * Distinct from the panel overlap handled above: a test named loosely *and*
   * inside a panel is two different ways of asking for one test, and is merged.
   */
  private assertNoRepeatsInRequest(ids: readonly string[], label: 'test' | 'panel'): void {
    const seen = new Set<string>();
    const repeated = ids.find((id) => {
      const isRepeat = seen.has(id);
      seen.add(id);
      return isRepeat;
    });
    if (repeated) {
      throw new ConflictException(`The same laboratory ${label} is listed twice: ${repeated}`);
    }
  }

  private assertAllOrderable(
    requestedIds: readonly string[],
    found: ReadonlyArray<LabTestRecord | LabPanelRecord>,
    label: 'test' | 'panel',
  ): void {
    if (found.length === requestedIds.length) {
      return;
    }
    const foundIds = new Set(found.map((row) => row.id));
    const missing = requestedIds.filter((id) => !foundIds.has(id));
    throw new NotFoundException(
      `No active laboratory ${label} exists for: ${missing.join(', ')}`,
    );
  }

  /**
   * The duplicate rule is per encounter, not per order: a test ordered twice on
   * one visit is a second draw and a second charge. The 409 names the order the
   * patient is already waiting on so the doctor can look at it instead.
   */
  private async assertTestsNotAlreadyOrdered(
    encounterId: string,
    items: readonly CreateLabOrderItemPayload[],
  ): Promise<void> {
    const live = await this.labOrderRepository.findLiveItemsByEncounterId(encounterId);
    if (live.length === 0) {
      return;
    }
    const orderNumberByTestId = new Map(live.map((item) => [item.labTestId, item.orderNumber]));
    const clash = items.find((item) => orderNumberByTestId.has(item.labTestId));
    if (clash) {
      throw new ConflictException(
        `A test on this request is already ordered on this visit under ${orderNumberByTestId.get(clash.labTestId)}`,
      );
    }
  }

  /**
   * Once a tube has been drawn the question is settled: the clinic did the
   * work, and sending it outside afterwards would leave a specimen belonging to
   * an order nobody here is running. Correct a mistake by cancelling and
   * re-ordering, which is the same rule every other lab correction follows.
   */
  private assertDispositionStillOpen(order: LabOrderRecord): void {
    if (order.status !== 'ORDERED') {
      throw new ConflictException(
        `Lab order ${order.orderNumber} is ${order.status}; where it is filled can no longer change`,
      );
    }
  }

  private assertEncounterOpen(status: string): void {
    if (status !== 'IN_PROGRESS') {
      throw new ConflictException(
        `Encounter in status ${status} can no longer be ordered against — only IN_PROGRESS visits are`,
      );
    }
  }

  private assertCancellable(order: LabOrderRecord): void {
    if (!CANCELLABLE_STATUSES.some((status) => status === order.status)) {
      throw new ConflictException(
        `Lab order ${order.orderNumber} is ${order.status} and can no longer be cancelled`,
      );
    }
  }

  /**
   * Opens a LAB_ONLY visit and orders against it in one front-desk action
   * (P18-T10) — the patient who arrived with a letter from another doctor, or
   * who wants a check-up panel without seeing anyone.
   *
   * Two steps rather than one transaction, deliberately: the registration is
   * written first and the order second, so a failure in the second leaves a
   * visit with no tests on it. That is a state the front desk can see and
   * retry or cancel, where the reverse — an order belonging to no visit — is
   * one the schema forbids outright.
   */
  async createWalkInLabOrder(
    payload: CreateWalkInLabOrderInput,
    currentUser: CurrentUser,
  ): Promise<LabOrderView> {
    // `:any` only. Ordering for oneself is what an appointment is for, and a
    // patient must not be able to raise a request in a doctor's name.
    await this.labOrderAccessService.resolveAnyScopeOrThrow(currentUser, 'write');
    const items = await this.buildOrderItems({
      testIds: payload.testIds,
      panelIds: payload.panelIds,
    });
    const visit = await this.registrationFlowService.createLabOnlyRegistration({
      patientId: payload.patientId,
      privacyNotice: payload.privacyNotice,
      currentUser,
    });
    const created = await this.labOrderRepository.createLabOrder({
      encounterId: null,
      registrationId: visit.registrationId,
      source: payload.source,
      patientId: visit.patientId,
      orderedById: null,
      externalRequesterName: payload.externalRequesterName ?? null,
      externalRequesterFacility: payload.externalRequesterFacility ?? null,
      priority: payload.priority ?? 'ROUTINE',
      clinicalNotes: payload.clinicalNotes ?? null,
      isFasting: payload.isFasting ?? false,
      fulfilmentSite: 'INTERNAL',
      chargeMode: 'CLINIC',
      externalFacilityName: null,
      requestLetterDocumentId: payload.requestLetterDocumentId ?? null,
      orderedAt: new Date(),
      items,
    });
    await this.auditService.record({
      action: 'LAB_ORDER_CREATED',
      resource: 'LabOrder',
      resourceId: created.id,
      actorUserId: currentUser.sub,
      patientId: visit.patientId,
      metadata: {
        orderNumber: created.orderNumber,
        source: payload.source,
        registrationId: visit.registrationId,
        itemCount: created.items.length,
        priority: created.priority,
      },
    });

    return this.labOrderMapper.toLabOrderView(created);
  }

  /**
   * The access rule for one order, whichever way it was raised (P18-T10).
   *
   * An order from a consultation is governed by its encounter, as it always
   * was. One without an encounter has no attending practitioner for `:own` to
   * resolve through, so only the clinic-wide grant can reach it — the same
   * rule that governs raising it.
   */
  private async assertCanAccessOrder(
    order: LabOrderRecord,
    scope: ActorScopeResolution,
    currentUser: CurrentUser,
    action: 'read' | 'write',
  ): Promise<void> {
    if (order.encounterId === null) {
      if (!scope.hasAny) {
        throw new ForbiddenException(
          `You are not allowed to ${action} laboratory orders raised outside an encounter`,
        );
      }
      return;
    }
    const encounter = await this.findEncounterOrThrow(order.encounterId);
    if (action === 'read') {
      this.labOrderAccessService.assertCanReadEncounterOrders({ encounter, scope, currentUser });
      return;
    }
    this.labOrderAccessService.assertCanOrderOnEncounter({ encounter, scope, currentUser });
  }

  private async findEncounterOrThrow(encounterId: string) {
    const encounter = await this.labOrderRepository.findEncounterForOrdering(encounterId);

    if (!encounter) {
      throw new NotFoundException('Encounter not found');
    }

    return encounter;
  }

  private async findLabOrderOrThrow(id: string): Promise<LabOrderRecord> {
    const order = await this.labOrderRepository.findLabOrderById(id);

    if (!order) {
      throw new NotFoundException('Lab order not found');
    }

    return order;
  }

  private toClinicDayStart(date: string): Date {
    return getStartOfCalendarDateInTimeZone(date, this.clinicTimeZone);
  }

  /** `to` names a whole clinic day, so the bound is the next local midnight. */
  private toExclusiveClinicDayEnd(date: string): Date {
    return new Date(this.toClinicDayStart(date).getTime() + DAY_IN_MILLISECONDS);
  }
}
