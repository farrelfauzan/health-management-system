import {
  Actor,
  ActorScopeResolution,
  ExpiryReportResponse,
  getCalendarDateInTimeZone,
  DispenseRecordDetailRecord,
  DispenseRecordResponse,
  isPrescriptionDispensable,
  MedicationRecord,
  MedicationResponse,
  StockReceiptResponse,
  PrescriptionDetailRecord,
  PrescriptionResponse,
  VaccineCatalogEntry,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { CreateDispenseDto } from '../dto/create-dispense.dto';
import { CreateMedicationDto } from '../dto/create-medication.dto';
import { CreatePrescriptionDto } from '../dto/create-prescription.dto';
import { CreateStockReceiptDto } from '../dto/create-stock-receipt.dto';
import { ExpiryReportQueryDto } from '../dto/expiry-report-query.dto';
import { ListMedicationsQueryDto } from '../dto/list-medications-query.dto';
import { ListPrescriptionsQueryDto } from '../dto/list-prescriptions-query.dto';
import { ListStockReceiptsQueryDto } from '../dto/list-stock-receipts-query.dto';
import { UpdateMedicationDto } from '../dto/update-medication.dto';
import { MedicationIdentifierConflictError } from '../repository/medication-identifier-conflict.error';
import { PharmacyFlowRepository } from '../repository/pharmacy-flow.repository';

@Injectable()
export class PharmacyFlowService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly pharmacyFlowRepository: PharmacyFlowRepository,
    private readonly authRepository: AuthRepository,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? 'Asia/Jakarta';
  }

  async listMedications(query: ListMedicationsQueryDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Medication', 'read');

    if (!readScope.hasAny) {
      throw new ForbiddenException('You are not allowed to read medications');
    }

    const result = await this.pharmacyFlowRepository.listMedications({
      page: query.page,
      limit: query.limit,
      search: query.search,
      category: query.category,
      reorderOnly: query.reorderOnly,
      inventoryDate: this.getClinicDate(new Date()),
    });

    return {
      items: result.items.map((medication) => this.toMedicationResponse(medication)),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  async createMedication(
    payload: CreateMedicationDto,
    currentUser: CurrentUser,
  ): Promise<MedicationResponse> {
    const actor = await this.getActorOrThrow(currentUser);
    const createScope = this.resolveScope(actor, 'Medication', 'create');

    if (!createScope.hasAny) {
      throw new ForbiddenException('You are not allowed to create medications');
    }

    await this.assertMedicationCodeAvailable(payload.code);

    if (payload.kfaCode) {
      await this.assertKfaCodeAvailable(payload.kfaCode);
    }

    const created = await this.runWithIdentifierConflictMapping(() =>
      this.pharmacyFlowRepository.createMedication({
        code: payload.code,
        kfaCode: payload.kfaCode,
        name: payload.name,
        form: payload.form,
        strength: payload.strength,
        unit: payload.unit,
        category: payload.category,
        reorderLevel: payload.reorderLevel,
      }),
    );

    return this.toMedicationResponse(created);
  }

  async updateMedication(
    id: string,
    payload: UpdateMedicationDto,
    currentUser: CurrentUser,
  ): Promise<MedicationResponse> {
    const actor = await this.getActorOrThrow(currentUser);
    const updateScope = this.resolveScope(actor, 'Medication', 'update');

    if (!updateScope.hasAny) {
      throw new ForbiddenException('You are not allowed to update medications');
    }

    const inventoryDate = this.getClinicDate(new Date());
    const medication = await this.pharmacyFlowRepository.findMedicationById(id, inventoryDate);

    if (!medication) {
      throw new NotFoundException('Medication not found');
    }

    if (payload.code !== undefined && payload.code !== medication.code) {
      await this.assertMedicationCodeAvailable(payload.code, id);
    }

    if (payload.kfaCode && payload.kfaCode !== medication.kfaCode) {
      await this.assertKfaCodeAvailable(payload.kfaCode, id);
    }

    const updated = await this.runWithIdentifierConflictMapping(() =>
      this.pharmacyFlowRepository.updateMedication(id, payload, inventoryDate),
    );

    return this.toMedicationResponse(updated);
  }

  async listPrescriptions(query: ListPrescriptionsQueryDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Prescription', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read prescriptions');
    }

    const result = await this.pharmacyFlowRepository.listPrescriptions(
      {
        page: query.page,
        limit: query.limit,
        status: query.status,
        patientId: query.patientId,
        doctorId: query.doctorId,
        encounterId: query.encounterId,
      },
      {
        userId: currentUser.sub,
        scope: readScope.hasAny ? 'ANY' : 'OWN',
      },
    );

    return {
      items: result.items.map((prescription) => this.toPrescriptionResponse(prescription)),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  async createPrescription(payload: CreatePrescriptionDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const writeScope = this.resolveScope(actor, 'Prescription', 'write');

    if (!writeScope.hasAny && !writeScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to write prescriptions');
    }

    const doctorId = await this.resolvePrescribingDoctorId(payload, writeScope, currentUser);
    const patient = await this.pharmacyFlowRepository.findActivePatientById(payload.patientId);

    if (!patient) {
      throw new BadRequestException('Patient not found or inactive');
    }

    if (!writeScope.hasAny) {
      await this.assertActiveAssignment(doctorId, payload.patientId);
    }

    // Both shapes are checked: a product line's medication, and every
    // ingredient of every compound line. A compound naming a medication that
    // does not exist is a compound nobody can dispense.
    await this.assertMedicationsExist([
      ...payload.items
        .map((item) => item.medicationId)
        .filter((medicationId): medicationId is string => medicationId !== undefined),
      ...payload.items.flatMap((item) =>
        (item.components ?? []).map((component) => component.medicationId),
      ),
    ]);

    if (payload.encounterId) {
      await this.assertEncounterAcceptsPrescription(payload.encounterId, payload.patientId);
    }

    const created = await this.pharmacyFlowRepository.createPrescription({
      patientId: payload.patientId,
      doctorId,
      encounterId: payload.encounterId,
      notes: payload.notes,
      items: payload.items,
    });

    return this.toPrescriptionResponse(created);
  }

  async createDispense(payload: CreateDispenseDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const writeScope = this.resolveScope(actor, 'DispenseRecord', 'write');

    if (!writeScope.hasAny) {
      throw new ForbiddenException('You are not allowed to dispense medications');
    }

    const prescription = await this.pharmacyFlowRepository.findPrescriptionDetailById(
      payload.prescriptionId,
    );

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    this.assertPrescriptionDispensable(prescription);
    this.assertDispenseWithinRemainingQuantities(prescription, payload);
    const created = await this.pharmacyFlowRepository.createDispense({
      prescriptionId: payload.prescriptionId,
      pharmacistId: currentUser.sub,
      notes: payload.notes,
      items: payload.items,
      inventoryDate: this.getClinicDate(new Date()),
    });

    return this.toDispenseRecordResponse(created);
  }

  async createStockReceipt(
    payload: CreateStockReceiptDto,
    currentUser: CurrentUser,
  ): Promise<StockReceiptResponse> {
    await this.assertInventoryPermission(currentUser, 'write');
    const medication = await this.pharmacyFlowRepository.findMedicationById(
      payload.medicationId,
      this.getClinicDate(new Date()),
    );
    if (!medication) throw new BadRequestException('Medication not found');
    const receipt = await this.pharmacyFlowRepository.createStockReceipt({
      medicationId: payload.medicationId,
      batchNumber: payload.batchNumber,
      expiryDate: new Date(`${payload.expiryDate}T00:00:00Z`),
      quantity: payload.quantity,
      receivedAt: payload.receivedAt ? new Date(payload.receivedAt) : undefined,
      receivedById: currentUser.sub,
      notes: payload.notes,
    });
    return this.toStockReceiptResponse(receipt);
  }

  async listStockReceipts(query: ListStockReceiptsQueryDto, currentUser: CurrentUser) {
    await this.assertInventoryPermission(currentUser, 'read');
    const result = await this.pharmacyFlowRepository.listStockReceipts(query);
    return {
      items: result.items.map((receipt) => this.toStockReceiptResponse(receipt)),
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  async getInventorySummary(currentUser: CurrentUser) {
    await this.assertInventoryPermission(currentUser, 'read');
    const asOfDate = getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
    const items = (
      await this.pharmacyFlowRepository.getInventorySummary(new Date(`${asOfDate}T00:00:00Z`))
    ).map((item) => ({
      ...item,
      needsReorder: item.stockQty <= item.reorderLevel,
      nearestExpiryDate: item.nearestExpiryDate?.toISOString().slice(0, 10),
    }));
    return {
      asOfDate,
      medicationCount: items.length,
      totalStockQty: items.reduce((sum, item) => sum + item.stockQty, 0),
      reorderCount: items.filter((item) => item.needsReorder).length,
      items,
    };
  }

  async getExpiryReport(
    query: ExpiryReportQueryDto,
    currentUser: CurrentUser,
  ): Promise<ExpiryReportResponse> {
    await this.assertInventoryPermission(currentUser, 'read');
    const asOfDate = getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
    const through = new Date(`${asOfDate}T00:00:00Z`);
    through.setUTCDate(through.getUTCDate() + query.days);
    const throughDate = through.toISOString().slice(0, 10);
    const rows = await this.pharmacyFlowRepository.getExpiryReport(through);
    return {
      asOfDate,
      throughDate,
      items: rows.map((row) => {
        const receipt = this.toStockReceiptResponse(row);
        if (!row.expiryDate) return { ...receipt, expiryStatus: 'UNKNOWN' as const };
        const daysUntilExpiry = Math.round(
          (row.expiryDate.getTime() - new Date(`${asOfDate}T00:00:00Z`).getTime()) / 86_400_000,
        );
        return {
          ...receipt,
          expiryStatus: daysUntilExpiry < 0 ? ('EXPIRED' as const) : ('EXPIRING' as const),
          daysUntilExpiry,
        };
      }),
    };
  }

  private async resolvePrescribingDoctorId(
    payload: CreatePrescriptionDto,
    writeScope: ActorScopeResolution,
    currentUser: CurrentUser,
  ): Promise<string> {
    if (!writeScope.hasAny) {
      const ownDoctor = await this.pharmacyFlowRepository.findActiveDoctorByOwnerUserId(
        currentUser.sub,
      );

      if (!ownDoctor) {
        throw new ForbiddenException('You do not have an active doctor profile');
      }

      if (payload.doctorId !== undefined && payload.doctorId !== ownDoctor.id) {
        throw new ForbiddenException('You can only write prescriptions as yourself');
      }

      return ownDoctor.id;
    }

    if (!payload.doctorId) {
      throw new BadRequestException('doctorId is required');
    }

    const doctor = await this.pharmacyFlowRepository.findActiveDoctorById(payload.doctorId);

    if (!doctor) {
      throw new BadRequestException('Doctor not found or inactive');
    }

    return doctor.id;
  }

  /**
   * A prescription may only be attached to an open encounter for the same
   * patient: attaching it to a closed record would add a treatment to a visit
   * that is already signed, and attaching it across patients would put one
   * patient's medication in another's chart.
   */
  private async assertEncounterAcceptsPrescription(
    encounterId: string,
    patientId: string,
  ): Promise<void> {
    const encounter = await this.pharmacyFlowRepository.findEncounterForPrescription(encounterId);

    if (!encounter) {
      throw new BadRequestException('Encounter not found');
    }

    if (encounter.patientId !== patientId) {
      throw new BadRequestException('Encounter belongs to a different patient');
    }

    if (encounter.status !== 'IN_PROGRESS') {
      throw new ConflictException(
        `Encounter in status ${encounter.status} can not receive prescriptions`,
      );
    }
  }

  private async assertActiveAssignment(doctorId: string, patientId: string): Promise<void> {
    const assignment = await this.pharmacyFlowRepository.findActiveDoctorPatientAssignment(
      doctorId,
      patientId,
    );

    if (!assignment) {
      throw new ForbiddenException('You can only prescribe for patients actively assigned to you');
    }
  }

  private async assertMedicationsExist(medicationIds: string[]): Promise<void> {
    const medications = await this.pharmacyFlowRepository.findActiveMedicationsByIds(
      medicationIds,
      this.getClinicDate(new Date()),
    );
    const foundIds = new Set(medications.map((medication) => medication.id));
    const missingIds = medicationIds.filter((medicationId) => !foundIds.has(medicationId));

    if (missingIds.length > 0) {
      throw new BadRequestException(`Medications not found: ${missingIds.join(', ')}`);
    }
  }

  private assertPrescriptionDispensable(prescription: PrescriptionDetailRecord): void {
    if (!isPrescriptionDispensable(prescription.status)) {
      throw new ConflictException(
        `Prescription in status ${prescription.status} can not be dispensed`,
      );
    }
  }

  private assertDispenseWithinRemainingQuantities(
    prescription: PrescriptionDetailRecord,
    payload: CreateDispenseDto,
  ): void {
    const remainingByLine = this.calculateRemainingQuantities(prescription);

    for (const item of payload.items) {
      const lineId = this.resolvePrescriptionLineId(prescription, item);
      const remainingQty = lineId === null ? undefined : remainingByLine.get(lineId);

      if (remainingQty === undefined) {
        throw new BadRequestException('Dispense item is not part of the prescription');
      }

      if (item.quantity > remainingQty) {
        throw new ConflictException('Dispense quantity exceeds remaining prescribed quantity');
      }
    }
  }

  /**
   * Which prescription line a requested dispense item fulfils. Keyed by line
   * rather than by medication since P10-T18: a compound has no medication to
   * key on, and the same product may appear on two lines when one is a
   * compound's ingredient.
   */
  private resolvePrescriptionLineId(
    prescription: PrescriptionDetailRecord,
    item: { medicationId?: string; prescriptionItemId?: string },
  ): string | null {
    if (item.prescriptionItemId) {
      return (
        prescription.items.find((line) => line.id === item.prescriptionItemId)?.id ?? null
      );
    }
    return (
      prescription.items.find((line) => line.medicationId === item.medicationId)?.id ?? null
    );
  }

  private calculateRemainingQuantities(prescription: PrescriptionDetailRecord): Map<string, number> {
    const remainingByLine = new Map<string, number>(
      prescription.items.map((item) => [item.id, item.quantity]),
    );

    for (const record of prescription.dispenseRecords) {
      for (const item of record.items) {
        const lineId = item.prescriptionItemId
          ? item.prescriptionItemId
          : (prescription.items.find((line) => line.medicationId === item.medicationId)?.id ??
            null);
        if (lineId === null) {
          continue;
        }
        remainingByLine.set(lineId, (remainingByLine.get(lineId) ?? 0) - item.quantity);
      }
    }

    return remainingByLine;
  }

  private async assertMedicationCodeAvailable(code: string, excludedId?: string): Promise<void> {
    const existing = await this.pharmacyFlowRepository.findMedicationByCode(code);

    if (existing && existing.id !== excludedId) {
      throw new ConflictException('Medication code already exists');
    }
  }

  private async assertKfaCodeAvailable(kfaCode: string, excludedId?: string): Promise<void> {
    const existing = await this.pharmacyFlowRepository.findMedicationByKfaCode(kfaCode);

    if (existing && existing.id !== excludedId) {
      throw new ConflictException('Medication KFA code already exists');
    }
  }

  /**
   * Maps the repository-level uniqueness race onto the same conflict the
   * pre-checks raise, so concurrent catalog writes never surface a raw Prisma
   * error.
   */
  private async runWithIdentifierConflictMapping<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (err) {
      if (err instanceof MedicationIdentifierConflictError) {
        throw new ConflictException(
          err.field === 'kfaCode'
            ? 'Medication KFA code already exists'
            : 'Medication code already exists',
        );
      }
      throw err;
    }
  }

  private async getActorOrThrow(currentUser: CurrentUser): Promise<Actor> {
    const actor = await this.authRepository.findUserById(currentUser.sub);

    if (!actor) {
      throw new UnauthorizedException('User not found');
    }

    return actor;
  }

  private resolveScope(actor: Actor, resource: string, action: string): ActorScopeResolution {
    const permissions = actor.roles.flatMap((userRole) =>
      userRole.role.permissions.map((rolePermission) => rolePermission.permission),
    );

    const hasAny = permissions.some(
      (permission) =>
        permission.resource === resource &&
        permission.action === action &&
        permission.scope === 'ANY',
    );
    const hasOwn = permissions.some(
      (permission) =>
        permission.resource === resource &&
        permission.action === action &&
        permission.scope === 'OWN',
    );

    return {
      hasAny,
      hasOwn,
    };
  }

  /**
   * The vaccine lookup the EMR module makes before recording an immunisation
   * (P10-T16). A service call rather than a reach into this module's
   * repository, and deliberately narrow: it answers "may this be recorded as a
   * vaccination, and will it be reportable", not "give me the catalog row".
   *
   * Unpermissioned on purpose — the caller has already been checked for
   * `encounter.write`, and a doctor who may record a vaccination does not
   * separately need `medication.read` to name the vaccine they gave.
   */
  async findActiveVaccineById(id: string): Promise<VaccineCatalogEntry | null> {
    return this.pharmacyFlowRepository.findActiveVaccineById(id);
  }

  private toMedicationResponse(medication: MedicationRecord): MedicationResponse {
    return {
      id: medication.id,
      code: medication.code,
      kfaCode: medication.kfaCode ?? undefined,
      dphoCode: medication.dphoCode ?? undefined,
      name: medication.name,
      form: medication.form ?? undefined,
      strength: medication.strength ?? undefined,
      unit: medication.unit ?? undefined,
      category: medication.category ?? undefined,
      stockQty: medication.stockQty,
      reorderLevel: medication.reorderLevel,
      needsReorder: medication.stockQty <= medication.reorderLevel,
      isVaccine: medication.isVaccine,
      createdAt: medication.createdAt.toISOString(),
      updatedAt: medication.updatedAt.toISOString(),
    };
  }

  private toPrescriptionResponse(prescription: PrescriptionDetailRecord): PrescriptionResponse {
    return {
      id: prescription.id,
      patientId: prescription.patientId,
      doctorId: prescription.doctorId,
      encounterId: prescription.encounterId ?? undefined,
      status: prescription.status,
      issuedAt: prescription.issuedAt?.toISOString(),
      notes: prescription.notes ?? undefined,
      createdAt: prescription.createdAt.toISOString(),
      updatedAt: prescription.updatedAt.toISOString(),
      patient: {
        id: prescription.patient.id,
        mrn: prescription.patient.mrn,
        fullName: prescription.patient.fullName,
      },
      doctor: {
        id: prescription.doctor.id,
        licenseNumber: prescription.doctor.licenseNumber,
        fullName: prescription.doctor.fullName,
      },
      items: prescription.items.map((item) => ({
        id: item.id,
        medicationId: item.medicationId ?? undefined,
        medicationCode: item.medication?.code,
        medicationName: item.medication?.name,
        dosage: item.dosage,
        frequency: item.frequency,
        durationDays: item.durationDays ?? undefined,
        quantity: item.quantity,
        instructions: item.instructions ?? undefined,
        isCompound: item.isCompound,
        compoundName: item.compoundName ?? undefined,
        preparation: item.preparation ?? undefined,
        dosageUnit: item.dosageUnit ?? undefined,
        components: item.components.map((component) => ({
          id: component.id,
          medicationId: component.medicationId,
          medicationCode: component.medication.code,
          medicationName: component.medication.name,
          quantity: component.quantity,
          unit: component.unit,
        })),
      })),
    };
  }

  private toDispenseRecordResponse(record: DispenseRecordDetailRecord): DispenseRecordResponse {
    return {
      id: record.id,
      prescriptionId: record.prescriptionId,
      prescriptionStatus: record.prescription.status,
      pharmacistId: record.pharmacistId,
      status: record.status,
      dispensedAt: record.dispensedAt.toISOString(),
      notes: record.notes ?? undefined,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      items: record.items.map((item) => ({
        id: item.id,
        medicationId: item.medicationId ?? undefined,
        medicationCode: item.medication?.code,
        medicationName: item.medication?.name,
        prescriptionItemId: item.prescriptionItemId ?? undefined,
        compoundName: item.prescriptionItem?.compoundName ?? undefined,
        preparation: item.prescriptionItem?.preparation ?? undefined,
        dosageUnit: item.prescriptionItem?.dosageUnit ?? undefined,
        components: (item.prescriptionItem?.components ?? []).map((component) => ({
          id: component.id,
          medicationId: component.medicationId,
          medicationCode: component.medication.code,
          medicationName: component.medication.name,
          quantity: component.quantity,
          unit: component.unit,
        })),
        quantity: item.quantity,
        allocations: item.stockAllocations.map((allocation) => ({
          stockReceiptId: allocation.stockReceipt.id,
          batchNumber: allocation.stockReceipt.batchNumber,
          expiryDate: allocation.stockReceipt.expiryDate?.toISOString().slice(0, 10),
          quantity: allocation.quantity,
        })),
      })),
    };
  }

  private async assertInventoryPermission(
    currentUser: CurrentUser,
    action: 'read' | 'write',
  ): Promise<void> {
    const actor = await this.getActorOrThrow(currentUser);
    if (!this.resolveScope(actor, 'Inventory', action).hasAny) {
      throw new ForbiddenException(`You are not allowed to ${action} inventory`);
    }
  }

  private getClinicDate(instant: Date): Date {
    return new Date(`${getCalendarDateInTimeZone(instant, this.clinicTimeZone)}T00:00:00Z`);
  }

  private toStockReceiptResponse(receipt: {
    id: string;
    medicationId: string;
    batchNumber: string;
    expiryDate: Date | null;
    quantity: number;
    remainingQuantity: number;
    receivedAt: Date;
    receivedById: string | null;
    notes: string | null;
    createdAt: Date;
    medication: { code: string; name: string };
    allocations: Array<{ quantity: number }>;
  }): StockReceiptResponse {
    const allocatedQty = receipt.quantity - receipt.remainingQuantity;
    return {
      id: receipt.id,
      medicationId: receipt.medicationId,
      medicationCode: receipt.medication.code,
      medicationName: receipt.medication.name,
      batchNumber: receipt.batchNumber,
      expiryDate: receipt.expiryDate?.toISOString().slice(0, 10),
      quantity: receipt.quantity,
      allocatedQty,
      remainingQty: receipt.remainingQuantity,
      receivedAt: receipt.receivedAt.toISOString(),
      receivedById: receipt.receivedById ?? undefined,
      notes: receipt.notes ?? undefined,
      createdAt: receipt.createdAt.toISOString(),
    };
  }
}
