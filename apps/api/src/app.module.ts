import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from './common/prisma/prisma.module';
import { SecurityConfigModule } from './common/config/config.module';
import { JwtSecretsService } from './common/config/jwt-secrets.service';
import { AuditModule } from './common/audit/audit.module';
import { AuthorizationModule } from './common/authorization/authorization.module';
import { BpjsPcareModule } from './common/bpjs-pcare/bpjs-pcare.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { MrnModule } from './common/mrn/mrn.module';
import { ObservabilityModule } from './common/observability/observability.module';
import { SatusehatModule } from './common/satusehat/satusehat.module';
import { RetentionModule } from './common/retention/retention.module';
import { StorageModule } from './common/storage/storage.module';
import { AdminManagementModule } from './modules/admin-management/admin-management.module';
import { AuditQueryModule } from './modules/audit/audit-query.module';
import { AiChatbotModule } from './modules/ai-chatbot/ai-chatbot.module';
import { AppointmentManagementModule } from './modules/appointment-management/appointment-management.module';
import { AuthModule } from './modules/auth/auth.module';
import { BpjsAntreanIntegrationModule } from './modules/bpjs-antrean/bpjs-antrean-integration.module';
import { BpjsAntreanWsModule } from './modules/bpjs-antrean-ws/bpjs-antrean-ws.module';
import { BpjsPcareIntegrationModule } from './modules/bpjs-pcare/bpjs-pcare-integration.module';
import { DoctorManagementModule } from './modules/doctor-management/doctor-management.module';
import { DoctorPatientModule } from './modules/doctor-patient/doctor-patient.module';
import { ChannelGatewayModule } from './modules/channel-gateway/channel-gateway.module';
import { CustomerServiceModule } from './modules/customer-service/customer-service.module';
import { DocumentManagementModule } from './modules/document-management/document-management.module';
import { BillingModule } from './modules/billing/billing.module';
import { EmrModule } from './modules/emr/emr.module';
import { HealthModule } from './modules/health/health.module';
import { PatientManagementModule } from './modules/patient-management/patient-management.module';
import { PharmacyFlowModule } from './modules/pharmacy-flow/pharmacy-flow.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RegistrationFlowModule } from './modules/registration-flow/registration-flow.module';
import { SatusehatIntegrationModule } from './modules/satusehat/satusehat-integration.module';
import { SpecialtyModule } from './modules/specialty/specialty.module';
import { TerminologyModule } from './modules/terminology/terminology.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SecurityConfigModule,
    PrismaModule,
    JwtModule.registerAsync({
      inject: [JwtSecretsService],
      useFactory: (jwtSecrets: JwtSecretsService) => ({
        secret: jwtSecrets.getAccessSigningSecret(),
      }),
    }),
    ObservabilityModule,
    AuditModule,
    CryptoModule,
    MrnModule,
    RetentionModule,
    AuthorizationModule,
    StorageModule,
    SatusehatModule,
    BpjsPcareModule,
    AdminManagementModule,
    AuditQueryModule,
    PatientManagementModule,
    SpecialtyModule,
    TerminologyModule,
    DoctorManagementModule,
    DoctorPatientModule,
    AppointmentManagementModule,
    RegistrationFlowModule,
    EmrModule,
    PharmacyFlowModule,
    BillingModule,
    SatusehatIntegrationModule,
    BpjsPcareIntegrationModule,
    BpjsAntreanIntegrationModule,
    BpjsAntreanWsModule,
    AiChatbotModule,
    ChannelGatewayModule,
    CustomerServiceModule,
    DocumentManagementModule,
    AuthModule,
    RbacModule,
    HealthModule,
  ],
})
export class AppModule {}
