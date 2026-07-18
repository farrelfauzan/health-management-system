import {
  Actor,
  ActivityRecord,
  AssignmentRecord,
  DoctorPatientActivityEvent,
  DoctorPatientAssignment,
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
import { CreateDoctorPatientAssignmentDto } from '../dto/create-doctor-patient-assignment.dto';
import { ListDoctorPatientActivityQueryDto } from '../dto/list-doctor-patient-activity-query.dto';
import { DoctorPatientRepository } from '../repository/doctor-patient.repository';

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

@Injectable()
export class DoctorPatientService {
  constructor(
    private readonly doctorPatientRepository: DoctorPatientRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async assignDoctorToPatient(payload: CreateDoctorPatientAssignmentDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const assignScope = this.resolveScope(actor, 'DoctorPatient', 'assign');

    if (!assignScope.hasAny) {
      throw new ForbiddenException('You are not allowed to assign doctors to patients');
    }

    const doctor = await this.doctorPatientRepository.findActiveDoctorById(payload.doctorId);

    if (!doctor) {
      throw new BadRequestException('Doctor not found or inactive');
    }

    const patient = await this.doctorPatientRepository.findActivePatientById(payload.patientId);

    if (!patient) {
      throw new BadRequestException('Patient not found or inactive');
    }

    const existingAssignment = await this.doctorPatientRepository.findActiveAssignment(
      payload.doctorId,
      payload.patientId,
    );

    if (existingAssignment) {
      return {
        assignment: this.toAssignmentResponse(existingAssignment),
        created: false,
      };
    }

    try {
      const createdAssignment = await this.doctorPatientRepository.createAssignment({
        doctorId: payload.doctorId,
        patientId: payload.patientId,
        actorUserId: currentUser.sub,
      });

      return {
        assignment: this.toAssignmentResponse(createdAssignment),
        created: true,
      };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException('Doctor is already assigned to this patient');
      }

      throw err;
    }
  }

  async unassignDoctorFromPatient(assignmentId: string, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const unassignScope = this.resolveScope(actor, 'DoctorPatient', 'unassign');

    if (!unassignScope.hasAny) {
      throw new ForbiddenException('You are not allowed to unassign doctors from patients');
    }

    const assignment = await this.doctorPatientRepository.findAssignmentById(assignmentId);

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (assignment.unassignedAt) {
      return {
        assignment: this.toAssignmentResponse(assignment),
        unassigned: false,
      };
    }

    const unassignedAssignment = await this.doctorPatientRepository.unassignAssignment({
      assignmentId,
      actorUserId: currentUser.sub,
    });

    return {
      assignment: this.toAssignmentResponse(unassignedAssignment),
      unassigned: true,
    };
  }

  async listActivity(query: ListDoctorPatientActivityQueryDto, currentUser: CurrentUser) {
    const actor = await this.getActorOrThrow(currentUser);
    const activityReadScope = this.resolveScope(actor, 'DoctorPatientActivity', 'read');

    if (!activityReadScope.hasAny) {
      throw new ForbiddenException('You are not allowed to read assignment activity');
    }

    const result = await this.doctorPatientRepository.listActivities({
      page: query.page,
      limit: query.limit,
      doctorId: query.doctorId,
      patientId: query.patientId,
      action: query.action,
      actorUserId: query.actorUserId,
      occurredFrom: query.occurredFrom ? new Date(query.occurredFrom) : undefined,
      occurredTo: query.occurredTo ? new Date(query.occurredTo) : undefined,
    });

    return {
      items: result.items.map((activity) => this.toActivityResponse(activity)),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  private async getActorOrThrow(currentUser: CurrentUser): Promise<Actor> {
    const actor = await this.authRepository.findUserById(currentUser.sub);

    if (!actor) {
      throw new UnauthorizedException('User not found');
    }

    return actor;
  }

  private resolveScope(actor: Actor, resource: string, action: string) {
    const permissions = actor.roles.flatMap((userRole) =>
      userRole.role.permissions.map((rolePermission) => rolePermission.permission),
    );

    const hasAny = permissions.some(
      (permission) =>
        permission.resource === resource && permission.action === action && permission.scope === 'ANY',
    );
    const hasOwn = permissions.some(
      (permission) =>
        permission.resource === resource && permission.action === action && permission.scope === 'OWN',
    );

    return {
      hasAny,
      hasOwn,
    };
  }

  private toAssignmentResponse(assignment: AssignmentRecord): DoctorPatientAssignment {
    return {
      id: assignment.id,
      doctorId: assignment.doctorId,
      patientId: assignment.patientId,
      assignedById: assignment.assignedById ?? undefined,
      assignedAt: assignment.assignedAt.toISOString(),
      unassignedById: assignment.unassignedById ?? undefined,
      unassignedAt: assignment.unassignedAt?.toISOString(),
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  }

  private toActivityResponse(activity: ActivityRecord): DoctorPatientActivityEvent {
    return {
      id: activity.id,
      assignmentId: activity.assignmentId,
      doctorId: activity.assignment.doctorId,
      patientId: activity.assignment.patientId,
      action: activity.action,
      actorUserId: activity.actorUserId,
      occurredAt: activity.occurredAt.toISOString(),
    };
  }
}
