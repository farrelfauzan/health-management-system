import { Icd9cmCode, Icd9cmCodeRecord, SearchIcd9cmCodesParams } from '@hms/shared-types';
import { Injectable } from '@nestjs/common';

import { Icd9cmCodeRepository } from '../repository/icd9cm-code.repository';

@Injectable()
export class Icd9cmCodeService {
  constructor(private readonly icd9cmCodeRepository: Icd9cmCodeRepository) {}

  async searchIcd9cmCodes(params: SearchIcd9cmCodesParams): Promise<Icd9cmCode[]> {
    const codes = await this.icd9cmCodeRepository.searchIcd9cmCodes(params);

    return codes.map((code) => this.toIcd9cmCodeResponse(code));
  }

  private toIcd9cmCodeResponse(code: Icd9cmCodeRecord): Icd9cmCode {
    return {
      id: code.id,
      code: code.code,
      display: code.display,
      displayIndonesian: code.displayIndonesian ?? undefined,
      category: code.category ?? undefined,
      isActive: code.isActive,
    };
  }
}
