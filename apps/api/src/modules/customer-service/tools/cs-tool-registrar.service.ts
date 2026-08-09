import { Injectable, OnModuleInit } from '@nestjs/common';

import { BookAppointmentTool } from './definitions/book-appointment.tool';
import { ListAvailableSessionsTool } from './definitions/list-available-sessions.tool';
import { SearchFaqTool } from './definitions/search-faq.tool';
import { CsToolRegistry } from './cs-tool.registry';

/**
 * Fills the catalogue at boot (strategy §4.2).
 *
 * A registrar rather than construction-time registration inside the registry
 * itself, so the registry stays a plain, dependency-free object that a unit
 * test can fill with one fake tool. It is also the one file where "the channel
 * has exactly three tools" is visible as a list — the property §4.2 calls the
 * security boundary should be readable in a single screen, not assembled from
 * decorators scattered across a directory.
 */
@Injectable()
export class CsToolRegistrarService implements OnModuleInit {
  constructor(
    private readonly registry: CsToolRegistry,
    private readonly searchFaqTool: SearchFaqTool,
    private readonly listAvailableSessionsTool: ListAvailableSessionsTool,
    private readonly bookAppointmentTool: BookAppointmentTool,
  ) {}

  onModuleInit(): void {
    this.registry.registerTool(this.searchFaqTool);
    this.registry.registerTool(this.listAvailableSessionsTool);
    this.registry.registerTool(this.bookAppointmentTool);
  }
}
