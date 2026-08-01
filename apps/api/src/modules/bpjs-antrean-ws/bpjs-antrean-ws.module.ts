import { Module } from '@nestjs/common';

import { AuditModule } from '../../common/audit/audit.module';
import { BpjsAntreanModule } from '../../common/bpjs-antrean/bpjs-antrean.module';
import { PrivacyNoticeModule } from '../../common/privacy-notice/privacy-notice.module';
import { AppointmentManagementModule } from '../appointment-management/appointment-management.module';
import { AuthModule } from '../auth/auth.module';
import { BpjsAntreanIntegrationModule } from '../bpjs-antrean/bpjs-antrean-integration.module';
import { BpjsPcareIntegrationModule } from '../bpjs-pcare/bpjs-pcare-integration.module';
import { PatientManagementModule } from '../patient-management/patient-management.module';
import { BpjsAntreanWsController } from './controller/bpjs-antrean-ws.controller';
import { BpjsAntreanInboundRateLimitGuard } from './guard/bpjs-antrean-inbound-rate-limit.guard';
import { BpjsAntreanInboundTokenGuard } from './guard/bpjs-antrean-inbound-token.guard';
import { BpjsAntreanSourceIpGuard } from './guard/bpjs-antrean-source-ip.guard';
import { BpjsAntreanInboundAuditService } from './service/bpjs-antrean-inbound-audit.service';
import { BpjsAntreanInboundRateLimiter } from './service/bpjs-antrean-inbound-rate-limiter.service';
import { BpjsAntreanInboundTokenService } from './service/bpjs-antrean-inbound-token.service';
import { BpjsAntreanNewPatientService } from './service/bpjs-antrean-new-patient.service';
import { BpjsAntreanQueueService } from './service/bpjs-antrean-queue.service';
import { BpjsAntreanScheduleResolver } from './service/bpjs-antrean-schedule-resolver.service';
import { BpjsAntreanSystemActorService } from './service/bpjs-antrean-system-actor.service';

/**
 * The inbound half of Antrean Online bridging (P14-T04).
 *
 * A separate module from `BpjsAntreanIntegrationModule` even though both speak
 * to the same BPJS service, because they have opposite security postures:
 * the other one is an authenticated admin screen making outbound calls, this
 * one is a public write surface receiving them. Keeping them apart means the
 * guard stack, the response envelope, and the audit vocabulary that belong to
 * the public half cannot be reused by accident on the private half.
 *
 * It owns **no repository**. Every write goes through a domain service
 * (§4.2), so business invariants — MRN allocation, identifier dedupe, session
 * capacity, the booking cutoff — hold on this path exactly as they do at the
 * front desk.
 */
@Module({
  imports: [
    AuditModule,
    AuthModule,
    BpjsAntreanModule,
    PrivacyNoticeModule,
    PatientManagementModule,
    AppointmentManagementModule,
    BpjsAntreanIntegrationModule,
    BpjsPcareIntegrationModule,
  ],
  controllers: [BpjsAntreanWsController],
  providers: [
    BpjsAntreanInboundRateLimiter,
    BpjsAntreanInboundAuditService,
    BpjsAntreanInboundTokenService,
    BpjsAntreanSystemActorService,
    BpjsAntreanScheduleResolver,
    BpjsAntreanQueueService,
    BpjsAntreanNewPatientService,
    BpjsAntreanSourceIpGuard,
    BpjsAntreanInboundRateLimitGuard,
    BpjsAntreanInboundTokenGuard,
  ],
})
export class BpjsAntreanWsModule {}
