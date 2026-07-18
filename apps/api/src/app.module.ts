import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from './common/prisma/prisma.module';
import { AuthorizationModule } from './common/authorization/authorization.module';
import { StorageModule } from './common/storage/storage.module';
import { AdminManagementModule } from './modules/admin-management/admin-management.module';
import { AppointmentManagementModule } from './modules/appointment-management/appointment-management.module';
import { AuthModule } from './modules/auth/auth.module';
import { DoctorManagementModule } from './modules/doctor-management/doctor-management.module';
import { DoctorPatientModule } from './modules/doctor-patient/doctor-patient.module';
import { HealthModule } from './modules/health/health.module';
import { PatientManagementModule } from './modules/patient-management/patient-management.module';
import { RbacModule } from './modules/rbac/rbac.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
      }),
    }),
    AuthorizationModule,
    StorageModule,
    AdminManagementModule,
    PatientManagementModule,
    DoctorManagementModule,
    DoctorPatientModule,
    AppointmentManagementModule,
    AuthModule,
    RbacModule,
    HealthModule,
  ],
})
export class AppModule {}
