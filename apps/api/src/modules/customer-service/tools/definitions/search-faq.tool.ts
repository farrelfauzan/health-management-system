import { Injectable } from '@nestjs/common';

import {
  SearchFaqArgumentsInput,
  searchFaqArgumentsSchema,
  searchFaqResultSchema,
} from '@hms/shared-types';

import { FaqSearchService } from '../../../document-management/service/faq-search.service';
import { CsTool } from '../cs-tool.interface';
import { CsToolContext, CsToolExecution } from '../cs-tool.types';

/**
 * `search_faq` — the channel's only read of the clinic corpus (strategy §4.2).
 *
 * The tool is thin because the scope decision was already made one layer down.
 * `FaqSearchService` (`PCS-T04`) takes a question and nothing else: the
 * visibility and the owner are constants inside that file rather than
 * parameters, precisely so that a change here — a new argument, a copied line
 * from the in-app retrieval tool — cannot widen what an anonymous caller can
 * reach. This tool has nothing to pass that could go wrong.
 *
 * **An empty result is a success.** No hit and a failed retrieval are
 * indistinguishable on purpose (see the service's own note), and both mean the
 * model has nothing to ground an answer in — which the system prompt's
 * no-answering-from-memory rule turns into "I don't have that written down and
 * here is the front desk", the honest reply either way.
 */
@Injectable()
export class SearchFaqTool implements CsTool {
  readonly name = 'search_faq' as const;

  readonly description = [
    'Cari jawaban pertanyaan pelanggan di dokumen resmi klinik (jam buka, alur pendaftaran, syarat, biaya, fasilitas).',
    'WAJIB dipakai sebelum menjawab pertanyaan fakta apa pun tentang klinik.',
    'Jika hasilnya kosong, katakan Anda tidak memiliki informasi tersebut dan arahkan ke loket klinik — jangan menjawab dari ingatan.',
  ].join(' ');

  readonly argumentSchema = searchFaqArgumentsSchema;

  readonly resultSchema = searchFaqResultSchema;

  constructor(private readonly faqSearchService: FaqSearchService) {}

  /**
   * The conversation is not a parameter of a FAQ lookup: the corpus is the
   * same for every customer, and passing the chat in would be the first step
   * towards a per-conversation scope this channel must never have.
   */
  async execute(_context: CsToolContext, validatedArguments: unknown): Promise<CsToolExecution> {
    const { query } = validatedArguments as SearchFaqArgumentsInput;
    const passages = await this.faqSearchService.searchFaq(query);
    return {
      result: {
        passages: passages.map((passage) => ({
          documentTitle: passage.documentTitle,
          content: passage.content,
        })),
      },
    };
  }
}
