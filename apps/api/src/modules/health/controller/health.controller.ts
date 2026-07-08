import { Controller, Get } from '@nestjs/common';

import { PublicRoute } from '../../../common/authorization/public-route.decorator';
import { HealthService } from '../service/health.service';

@Controller({
  version: '1',
  path: 'health',
})
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @PublicRoute(true)
  getHealth(): { status: 'ok'; service: 'api' } {
    return this.healthService.getHealth();
  }
}
