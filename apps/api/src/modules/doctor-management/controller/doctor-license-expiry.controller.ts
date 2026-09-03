import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '../../../common/authorization/auth.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { DOCTOR_LICENSE_EXPIRY_EXAMPLES } from '../../../common/openapi/doctor-license-expiry-examples';
import { DoctorLicenseExpiryService } from '../service/doctor-license-expiry.service';

/**
 * The clinic's licence expiry dashboard (`P16-T19`, FR-E3-33).
 *
 * Its own controller rather than another route on `DoctorManagementController`
 * because it answers to its own permission: `doctor.read:any` is held by
 * DOCTOR and PATIENT as well as ADMIN, and the roster of who is out of
 * licence is not part of the clinic's public directory.
 *
 * The response carries licence numbers and dates and **nothing else**. There
 * is no document id, no filename, and no field saying whether a scan exists —
 * not even for a document the viewing administrator has been given access to
 * (FR-E3-35). The service behind it reads `doctor_licenses` and never joins
 * `documents`, so the omission is a property of the query rather than a
 * filter someone has to remember to apply.
 */
@ApiTags('Doctor Management')
@Controller({
  version: '1',
  path: 'doctor-licenses',
})
export class DoctorLicenseExpiryController {
  constructor(private readonly doctorLicenseExpiryService: DoctorLicenseExpiryService) {}

  @Get('expiry')
  @Auth([{ action: 'read', subject: 'DoctorLicenseExpiry' }])
  @ApiEndpoint({
    summary: 'List practitioner licences by expiry urgency',
    responseDescription:
      'Licences already lapsed plus those lapsing inside 90 days, bucketed by urgency and sorted soonest-first within each bucket. Each row carries the doctor’s name, the licence type, its number and its dates. Nothing here refers to a document: whether a doctor has uploaded a scan of a licence is private to their vault, and this surface is built so that reading it cannot reveal even the existence of one. Licences with no expiry date, and those on retired or soft-deleted records, are absent — the list is of obligations the clinic still has.',
    responseExample: { data: DOCTOR_LICENSE_EXPIRY_EXAMPLES.buckets },
  })
  async listExpiryBuckets() {
    const buckets = await this.doctorLicenseExpiryService.getExpiryBuckets();

    return { data: buckets };
  }
}
