import { forwardRef, Module } from '@nestjs/common';

import { PdfModule } from '../../common/pdf/pdf.module';
import { PrivacyNoticeModule } from '../../common/privacy-notice/privacy-notice.module';
import { StorageModule } from '../../common/storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ChannelGatewayModule } from '../channel-gateway/channel-gateway.module';
import { InboundOptOutHandler } from '../channel-gateway/service/inbound-opt-out-handler.service';
import { PatientManagementModule } from '../patient-management/patient-management.module';
import { DeliveryActionController } from './controller/delivery-action.controller';
import { DeliveryLinkPublicController } from './controller/delivery-link-public.controller';
import { InvoiceDeliveryController } from './controller/invoice-delivery.controller';
import { PatientDeliveryConsentController } from './controller/patient-delivery-consent.controller';
import { DeliveryGateRepository } from './repository/delivery-gate.repository';
import { DocumentDeliveryRepository } from './repository/document-delivery.repository';
import { PatientDeliveryConsentRepository } from './repository/patient-delivery-consent.repository';
import { DeliveryChannelGateService } from './service/delivery-channel-gate.service';
import { DeliveryLinkService } from './service/delivery-link.service';
import { DeliveryOptOutService } from './service/delivery-opt-out.service';
import { DeliveryPasswordService } from './service/delivery-password.service';
import { DeliverySendService } from './service/delivery-send.service';
import { DocumentDeliveryWorker } from './service/document-delivery.worker';
import { InvoiceDeliveryService } from './service/invoice-delivery.service';
import { PatientDeliveryConsentService } from './service/patient-delivery-consent.service';
import { PatientDocumentDeliveryService } from './service/patient-document-delivery.service';
import { ProtectDeliveryDocumentService } from './service/protect-delivery-document.service';
import { PublicLinkRateLimiter } from './service/public-link-rate-limiter';

/**
 * Document delivery (PRD §7.4, epic E4): the rules under which a rendered
 * document may leave the system for a patient.
 *
 * `P16-T24` lands the Tier 0 half — consent, the verified-number gate, and
 * the patient's own `BERHENTI` — which the send pipeline (`P16-T25`/`T26`),
 * the send dialog (`P16-T27`) and clinical-document release (`P16-T40`) all
 * consume through {@link PatientDeliveryConsentService}. `P16-T37` adds the
 * step between render and transport — {@link ProtectDeliveryDocumentService}
 * locks every attachment with the patient's password before it leaves.
 * `P16-T25` adds the delivery rows, the timeline, retry and revoke, and the
 * revocable link a LINK delivery resolves through; `P16-T26` the lease-claimed
 * worker that sends them, `P16-T38` the send-at. It is its
 * own module rather than a corner of billing because the same gate, the same
 * lock and the same rows serve an invoice and a lab result (D-028), and
 * neither owning module should have to import the other to ask. Billing is
 * imported here, not the other way round: sending asks money for facts.
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
    PdfModule,
    StorageModule,
    PrivacyNoticeModule,
    PatientManagementModule,
    BillingModule,
    forwardRef(() => ChannelGatewayModule),
  ],
  controllers: [
    PatientDeliveryConsentController,
    InvoiceDeliveryController,
    DeliveryActionController,
    DeliveryLinkPublicController,
  ],
  providers: [
    DeliveryGateRepository,
    PatientDeliveryConsentRepository,
    DocumentDeliveryRepository,
    DeliveryChannelGateService,
    PatientDeliveryConsentService,
    DeliveryOptOutService,
    DeliveryPasswordService,
    ProtectDeliveryDocumentService,
    InvoiceDeliveryService,
    PatientDocumentDeliveryService,
    DeliveryLinkService,
    PublicLinkRateLimiter,
    DeliverySendService,
    DocumentDeliveryWorker,
    {
      provide: InboundOptOutHandler,
      useExisting: DeliveryOptOutService,
    },
  ],
  exports: [
    PatientDeliveryConsentService,
    DeliveryChannelGateService,
    ProtectDeliveryDocumentService,
    DeliveryLinkService,
    InboundOptOutHandler,
    // Exported for the document module's release (`P16-T40`): the patient's
    // end of dual delivery is asked for through this service and nowhere
    // else, which is what keeps FR-E4-26 — delivery only on release — a
    // property of the code rather than of the current callers.
    PatientDocumentDeliveryService,
  ],
})
export class DocumentDeliveryModule {}
