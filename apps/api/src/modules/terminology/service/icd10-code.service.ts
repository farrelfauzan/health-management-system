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
