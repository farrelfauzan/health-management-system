import {
  Actor,
  ActorScopeResolution,
  DispenseRecordDetailRecord,
  DispenseRecordResponse,
  isPrescriptionDispensable,
  MedicationRecord,
  MedicationResponse,
  PrescriptionDetailRecord,
  PrescriptionResponse,
} from '@hms/shared-types';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { CreateDispenseDto } from '../dto/create-dispense.dto';
import { CreateMedicationDto } from '../dto/create-medication.dto';
import { CreatePrescriptionDto } from '../dto/create-prescription.dto';
import { ListMedicationsQueryDto } from '../dto/list-medications-query.dto';
import { ListPrescriptionsQueryDto } from '../dto/list-prescriptions-query.dto';
import { UpdateMedicationDto } from '../dto/update-medication.dto';
import { MedicationIdentifierConflictError } from '../repository/medication-identifier-conflict.error';
import { PharmacyFlowRepository } from '../repository/pharmacy-flow.repository';

@Injectable()
export class PharmacyFlowService {
  constructor(
    private readonly pharmacyFlowRepository: PharmacyFlowRepository,
    private readonly authRepository: AuthRepository,
  ) {}

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
        stockQty: payload.stockQty,
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

    const medication = await this.pharmacyFlowRepository.findMedicationById(id);

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
      this.pharmacyFlowRepository.updateMedication(id, payload),
    );

    return this.toMedicationResponse(updated);
  }

  async listPrescriptions(query: ListPrescriptionsQueryDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const readScope = this.resolveScope(actor, 'Prescription', 'read');

    if (!readScope.hasAny && !readScope.hasOwn) {
      throw new ForbiddenException('You are not allowed to read prescriptions');
    }

    const result = await this.pharmacyFlowRepository.listPrescriptions({
      page: query.page,
      limit: query.limit,
      status: query.status,
      patientId: query.patientId,
      doctorId: query.doctorId,
      ownerUserId: readScope.hasAny ? undefined : currentUser.sub,
    });

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

    await this.assertMedicationsExist(payload.items.map((item) => item.medicationId));

    const created = await this.pharmacyFlowRepository.createPrescription({
      patientId: payload.patientId,
      doctorId,
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
    await this.assertSufficientStock(payload);

    const created = await this.pharmacyFlowRepository.createDispense({
      prescriptionId: payload.prescriptionId,
      pharmacistId: currentUser.sub,
      notes: payload.notes,
      items: payload.items,
    });

    return this.toDispenseRecordResponse(created);
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
    const medications = await this.pharmacyFlowRepository.findActiveMedicationsByIds(medicationIds);
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
    const remainingByMedication = this.calculateRemainingQuantities(prescription);

    for (const item of payload.items) {
      const remainingQty = remainingByMedication.get(item.medicationId);

      if (remainingQty === undefined) {
        throw new BadRequestException('Dispense item is not part of the prescription');
      }

      if (item.quantity > remainingQty) {
        throw new ConflictException('Dispense quantity exceeds remaining prescribed quantity');
      }
    }
  }

  private calculateRemainingQuantities(prescription: PrescriptionDetailRecord): Map<string, number> {
    const remainingByMedication = new Map<string, number>(
      prescription.items.map((item) => [item.medicationId, item.quantity]),
    );

    for (const record of prescription.dispenseRecords) {
      for (const item of record.items) {
        const remainingQty = remainingByMedication.get(item.medicationId) ?? 0;
        remainingByMedication.set(item.medicationId, remainingQty - item.quantity);
      }
    }

    return remainingByMedication;
  }

  private async assertSufficientStock(payload: CreateDispenseDto): Promise<void> {
    const medications = await this.pharmacyFlowRepository.findActiveMedicationsByIds(
      payload.items.map((item) => item.medicationId),
    );
    const stockByMedication = new Map<string, number>(
      medications.map((medication) => [medication.id, medication.stockQty]),
    );

    for (const item of payload.items) {
      const stockQty = stockByMedication.get(item.medicationId);

      if (stockQty === undefined || stockQty < item.quantity) {
        throw new ConflictException('Insufficient medication stock');
      }
    }
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

  private toMedicationResponse(medication: MedicationRecord): MedicationResponse {
    return {
      id: medication.id,
      code: medication.code,
      kfaCode: medication.kfaCode ?? undefined,
      name: medication.name,
      form: medication.form ?? undefined,
      strength: medication.strength ?? undefined,
      unit: medication.unit ?? undefined,
      category: medication.category ?? undefined,
      stockQty: medication.stockQty,
      createdAt: medication.createdAt.toISOString(),
      updatedAt: medication.updatedAt.toISOString(),
    };
  }

  private toPrescriptionResponse(prescription: PrescriptionDetailRecord): PrescriptionResponse {
    return {
      id: prescription.id,
      patientId: prescription.patientId,
      doctorId: prescription.doctorId,
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
        medicationId: item.medicationId,
        medicationCode: item.medication.code,
        medicationName: item.medication.name,
        dosage: item.dosage,
        frequency: item.frequency,
        durationDays: item.durationDays ?? undefined,
        quantity: item.quantity,
        instructions: item.instructions ?? undefined,
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
        medicationId: item.medicationId,
        medicationCode: item.medication.code,
        medicationName: item.medication.name,
        quantity: item.quantity,
      })),
    };
  }
}
