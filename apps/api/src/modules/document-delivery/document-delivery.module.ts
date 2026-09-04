import { forwardRef, Module } from '@nestjs/common';

import { PrivacyNoticeModule } from '../../common/privacy-notice/privacy-notice.module';
import { AuthModule } from '../auth/auth.module';
import { ChannelGatewayModule } from '../channel-gateway/channel-gateway.module';
import { InboundOptOutHandler } from '../channel-gateway/service/inbound-opt-out-handler.service';
import { PatientManagementModule } from '../patient-management/patient-management.module';
import { PatientDeliveryConsentController } from './controller/patient-delivery-consent.controller';
import { DeliveryGateRepository } from './repository/delivery-gate.repository';
import { PatientDeliveryConsentRepository } from './repository/patient-delivery-consent.repository';
import { DeliveryChannelGateService } from './service/delivery-channel-gate.service';
import { DeliveryOptOutService } from './service/delivery-opt-out.service';
import { PatientDeliveryConsentService } from './service/patient-delivery-consent.service';

/**
 * Document delivery (PRD §7.4, epic E4): the rules under which a rendered
 * document may leave the system for a patient.
 *
 * `P16-T24` lands the Tier 0 half — consent, the verified-number gate, and
 * the patient's own `BERHENTI` — which the send pipeline (`P16-T25`/`T26`),
 * the send dialog (`P16-T27`) and clinical-document release (`P16-T40`) all
 * consume through {@link PatientDeliveryConsentService}. It is its own
 * module rather than a corner of billing because the same gate guards an
 * invoice and a lab result, and neither owning module should have to import
 * the other to ask it.
 *
 * The `forwardRef` to `ChannelGatewayModule` is a real cycle: the gateway
 * calls in through `InboundOptOutHandler` when a patient types `STOP`, and
 * this module calls out through `WhatsappGatewayService` to confirm it. The
 * binding is made here, in the module that knows what an opt-out is, for the
 * same reason `CustomerServiceModule` binds the sink — the dependency runs
 * from the thing that thinks to the pipe, never the other way.
 */
@Module({
  imports: [
    AuthModule,
    PrivacyNoticeModule,
    PatientManagementModule,
    forwardRef(() => ChannelGatewayModule),
  ],
  controllers: [PatientDeliveryConsentController],
  providers: [
    DeliveryGateRepository,
    PatientDeliveryConsentRepository,
    DeliveryChannelGateService,
    PatientDeliveryConsentService,
    DeliveryOptOutService,
    {
      provide: InboundOptOutHandler,
      useExisting: DeliveryOptOutService,
    },
  ],
  exports: [
    PatientDeliveryConsentService,
    DeliveryChannelGateService,
    InboundOptOutHandler,
  ],
})
export class DocumentDeliveryModule {}
