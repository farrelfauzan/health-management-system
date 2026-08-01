import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import {
  AntreanEnvelope,
  AntreanNewPatientResponse,
  AntreanRemainingResponse,
  AntreanStatusResponse,
  AntreanTakeResponse,
  AntreanTokenResponse,
} from '@hms/shared-types';

import { PublicRoute } from '../../../common/authorization/public-route.decorator';
import { AuditAction } from '../../../generated/prisma/client';
import { AntreanCancelDto } from '../dto/antrean-cancel.dto';
import { AntreanInboundTokenDto } from '../dto/antrean-inbound-token.dto';
import { AntreanNewPatientDto } from '../dto/antrean-new-patient.dto';
import { AntreanRemainingDto } from '../dto/antrean-remaining.dto';
import { AntreanStatusDto } from '../dto/antrean-status.dto';
import { AntreanTakeDto } from '../dto/antrean-take.dto';
import { BpjsAntreanInboundRateLimitGuard } from '../guard/bpjs-antrean-inbound-rate-limit.guard';
import { BpjsAntreanInboundRequest } from '../guard/bpjs-antrean-inbound-request.type';
import { BpjsAntreanInboundTokenGuard } from '../guard/bpjs-antrean-inbound-token.guard';
import { BpjsAntreanSourceIpGuard } from '../guard/bpjs-antrean-source-ip.guard';
import { InboundService } from '../guard/inbound-service.decorator';
import { BpjsAntreanInboundAuditService } from '../service/bpjs-antrean-inbound-audit.service';
import { BpjsAntreanInboundTokenService } from '../service/bpjs-antrean-inbound-token.service';
import { BpjsAntreanNewPatientService } from '../service/bpjs-antrean-new-patient.service';
import { BpjsAntreanQueueService } from '../service/bpjs-antrean-queue.service';
import { BpjsAntreanSystemActorService } from '../service/bpjs-antrean-system-actor.service';
import { BpjsAntreanWsExceptionFilter } from './bpjs-antrean-ws-exception.filter';

const OK_META_CODE = 200;
const OK_MESSAGE = 'Ok';

/**
 * The inbound Antrean Online web services — the third public surface in HMS,
 * and the first one that writes (P14-T04).
 *
 * Read the decorator stack as the security model, because that is what it is:
 *
 * - `@PublicRoute()` takes these routes out of `JwtAuthGuard` and
 *   `PermissionsGuard`. That is not a weakening — BPJS has no HMS identity to
 *   present — but it does mean **everything** protecting this surface is in
 *   the three guards named on each route and nowhere else.
 * - `BpjsAntreanSourceIpGuard` refuses anything that is not BPJS, and refuses
 *   *everything* while no allowlist is configured. It runs first so the token
 *   check is never an oracle for arbitrary callers.
 * - `BpjsAntreanInboundRateLimitGuard` bounds each endpoint per source, before
 *   the expensive bcrypt comparison behind the token check.
 * - `BpjsAntreanInboundTokenGuard` verifies the token BPJS obtained from
 *   `/token`. Never `JwtAuthGuard`, and it grants no identity.
 *
 * Authorisation is not skipped, it is relocated: every handler resolves the
 * reserved system actor and passes it to domain services, which run the same
 * permission checks as for any other user. The account's grants are in the
 * RBAC tables, and they are narrow.
 *
 * `@ApiExcludeController()` keeps these routes out of `openapi.yaml` and the
 * Orval client. They are BPJS's contract, not the web app's, and publishing a
 * public write surface in the clinic's own API documentation would describe it
 * to everyone who reads the docs. The contract BPJS holds is the UAT document.
 *
 * Every endpoint answers 200 with BPJS's `metaData` envelope, including on
 * failure — see {@link BpjsAntreanWsExceptionFilter}.
 */
@ApiExcludeController()
@Controller({ version: '1', path: 'bpjs/antrean/ws' })
@UseFilters(BpjsAntreanWsExceptionFilter)
export class BpjsAntreanWsController {
  constructor(
    private readonly tokenService: BpjsAntreanInboundTokenService,
    private readonly queueService: BpjsAntreanQueueService,
    private readonly newPatientService: BpjsAntreanNewPatientService,
    private readonly systemActorService: BpjsAntreanSystemActorService,
    private readonly auditService: BpjsAntreanInboundAuditService,
  ) {}

  /**
   * Token issuance is the one route the token guard must not protect — it is
   * where the token comes from. Nest *appends* method guards to controller
   * guards rather than replacing them, so this controller declares no guards
   * at class level and every route names its own chain: an inherited token
   * guard here would have made the token unobtainable, and an inherited chain
   * anywhere else is a chain nobody re-reads when a route is added.
   */
  @Post('token')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @InboundService({ service: 'TOKEN', rateClass: 'TOKEN' })
  @UseGuards(BpjsAntreanSourceIpGuard, BpjsAntreanInboundRateLimitGuard)
  async issueToken(
    @Body() body: AntreanInboundTokenDto,
    @Req() request: BpjsAntreanInboundRequest,
  ): Promise<AntreanEnvelope<AntreanTokenResponse>> {
    const token = await this.tokenService.issueToken(body);
    await this.auditService.recordAccepted({
      action: AuditAction.BPJS_ANTREAN_INBOUND_TOKEN_ISSUED,
      service: 'TOKEN',
      sourceIp: request.bpjsAntreanSourceIp ?? null,
    });
    return this.ok({ token });
  }

  @Post('status-antrean')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @InboundService({ service: 'STATUS_ANTREAN', rateClass: 'READ' })
  @UseGuards(
    BpjsAntreanSourceIpGuard,
    BpjsAntreanInboundRateLimitGuard,
    BpjsAntreanInboundTokenGuard,
  )
  async getStatus(
    @Body() body: AntreanStatusDto,
    @Req() request: BpjsAntreanInboundRequest,
  ): Promise<AntreanEnvelope<AntreanStatusResponse>> {
    const actor = await this.systemActorService.resolveActor();
    const status = await this.queueService.getStatus(body, actor);
    await this.auditService.recordAccepted({
      action: AuditAction.BPJS_ANTREAN_INBOUND_QUEUE_READ,
      service: 'STATUS_ANTREAN',
      sourceIp: request.bpjsAntreanSourceIp ?? null,
      detail: { kodepoli: body.kodepoli, tanggalperiksa: body.tanggalperiksa },
    });
    return this.ok(status);
  }

  @Post('ambil-antrean')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @InboundService({ service: 'AMBIL_ANTREAN', rateClass: 'WRITE' })
  @UseGuards(
    BpjsAntreanSourceIpGuard,
    BpjsAntreanInboundRateLimitGuard,
    BpjsAntreanInboundTokenGuard,
  )
  async takeQueueNumber(
    @Body() body: AntreanTakeDto,
    @Req() request: BpjsAntreanInboundRequest,
  ): Promise<AntreanEnvelope<AntreanTakeResponse>> {
    const actor = await this.systemActorService.resolveActor();
    const taken = await this.queueService.takeQueueNumber(body, actor);
    await this.auditService.recordAccepted({
      action: AuditAction.BPJS_ANTREAN_INBOUND_BOOKING_CREATED,
      service: 'AMBIL_ANTREAN',
      sourceIp: request.bpjsAntreanSourceIp ?? null,
      memberIdentifier: body.nomorkartu,
      detail: { kodebooking: taken.kodebooking, kodepoli: body.kodepoli },
    });
    return this.ok(taken);
  }

  @Post('sisa-antrean')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @InboundService({ service: 'SISA_ANTREAN', rateClass: 'READ' })
  @UseGuards(
    BpjsAntreanSourceIpGuard,
    BpjsAntreanInboundRateLimitGuard,
    BpjsAntreanInboundTokenGuard,
  )
  async getRemaining(
    @Body() body: AntreanRemainingDto,
    @Req() request: BpjsAntreanInboundRequest,
  ): Promise<AntreanEnvelope<AntreanRemainingResponse>> {
    const actor = await this.systemActorService.resolveActor();
    const remaining = await this.queueService.getRemaining(body, actor);
    await this.auditService.recordAccepted({
      action: AuditAction.BPJS_ANTREAN_INBOUND_QUEUE_READ,
      service: 'SISA_ANTREAN',
      sourceIp: request.bpjsAntreanSourceIp ?? null,
      detail: { kodebooking: body.kodebooking },
    });
    return this.ok(remaining);
  }

  @Post('pasien-baru')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @InboundService({ service: 'PASIEN_BARU', rateClass: 'WRITE' })
  @UseGuards(
    BpjsAntreanSourceIpGuard,
    BpjsAntreanInboundRateLimitGuard,
    BpjsAntreanInboundTokenGuard,
  )
  async registerNewPatient(
    @Body() body: AntreanNewPatientDto,
    @Req() request: BpjsAntreanInboundRequest,
  ): Promise<AntreanEnvelope<AntreanNewPatientResponse>> {
    const actor = await this.systemActorService.resolveActor();
    const registered = await this.newPatientService.registerMember(body, actor);
    await this.auditService.recordAccepted({
      action: AuditAction.BPJS_ANTREAN_INBOUND_PATIENT_REGISTERED,
      service: 'PASIEN_BARU',
      sourceIp: request.bpjsAntreanSourceIp ?? null,
      memberIdentifier: body.nomorkartu,
    });
    return this.ok(registered);
  }

  @Post('batal-antrean')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @InboundService({ service: 'BATAL_ANTREAN', rateClass: 'WRITE' })
  @UseGuards(
    BpjsAntreanSourceIpGuard,
    BpjsAntreanInboundRateLimitGuard,
    BpjsAntreanInboundTokenGuard,
  )
  async cancel(
    @Body() body: AntreanCancelDto,
    @Req() request: BpjsAntreanInboundRequest,
  ): Promise<AntreanEnvelope<null>> {
    const actor = await this.systemActorService.resolveActor();
    const appointmentId = await this.queueService.cancel(body, actor);
    await this.auditService.recordAccepted({
      action: AuditAction.BPJS_ANTREAN_INBOUND_BOOKING_CANCELLED,
      service: 'BATAL_ANTREAN',
      sourceIp: request.bpjsAntreanSourceIp ?? null,
      resourceId: appointmentId,
      detail: { kodebooking: body.kodebooking },
    });
    return this.ok(null);
  }

  private ok<TResponse>(response: TResponse): AntreanEnvelope<TResponse> {
    return { metaData: { code: OK_META_CODE, message: OK_MESSAGE }, response };
  }
}
