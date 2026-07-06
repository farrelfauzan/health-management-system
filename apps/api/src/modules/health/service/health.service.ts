import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getHealth(): { status: 'ok'; service: 'api' } {
    return {
      status: 'ok',
      service: 'api',
    };
  }
}
