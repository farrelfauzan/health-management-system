import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PublicRoute } from '../../../common/authorization/public-route.decorator';
import { ApiEndpoint } from '../../../common/openapi/api-endpoint.decorator';
import { PHASE_THREE_EXAMPLES } from '../../../common/openapi/phase-three-examples';
import { HealthService } from '../service/health.service';

@ApiTags('Health')
@Controller({
  version: '1',
  path: 'health',
})
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @PublicRoute(true)
  @ApiEndpoint({
    summary: 'Check API liveness',
    responseDescription: 'Static liveness payload for probes and uptime checks.',
    responseExample: PHASE_THREE_EXAMPLES.health.status,
    isPublic: true,
  })
  getHealth(): { status: 'ok'; service: 'api' } {
    return this.healthService.getHealth();
  }
}
