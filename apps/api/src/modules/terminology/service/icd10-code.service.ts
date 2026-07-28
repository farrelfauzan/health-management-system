import { Icd10Code, Icd10CodeRecord, SearchIcd10CodesParams } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { Icd10CodeRepository } from '../repository/icd10-code.repository';

@Injectable()
export class Icd10CodeService {
  constructor(private readonly icd10CodeRepository: Icd10CodeRepository) {}

  async searchIcd10Codes(params: SearchIcd10CodesParams): Promise<Icd10Code[]> {
    const codes = await this.icd10CodeRepository.searchIcd10Codes(params);

    return codes.map((code) => this.toIcd10CodeResponse(code));
  }

  /**
   * Resolves a catalog row for callers that snapshot it onto a clinical record
   * (the EMR module codes diagnoses this way). Returns null when the code does
   * not exist or has been retired.
   */
  async findActiveIcd10CodeById(id: string): Promise<Icd10Code | null> {
    const code = await this.icd10CodeRepository.findActiveIcd10CodeById(id);
    return code ? this.toIcd10CodeResponse(code) : null;
  }

  private toIcd10CodeResponse(code: Icd10CodeRecord): Icd10Code {
    return {
      id: code.id,
      code: code.code,
      display: code.display,
      displayIndonesian: code.displayIndonesian ?? undefined,
      category: code.category ?? undefined,
      chapter: code.chapter ?? undefined,
      isActive: code.isActive,
    };
  }
}
