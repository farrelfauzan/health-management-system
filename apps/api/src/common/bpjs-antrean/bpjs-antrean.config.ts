import { ConfigService } from '@nestjs/config';

import { resolveBpjsGatewayAdapterConfig } from '../bpjs-gateway/resolve-bpjs-gateway-adapter-config';
import { BpjsAntreanAdapterConfig } from './bpjs-antrean.types';

const SERVICE_LABEL = 'BPJS Antrean';
const ENV_PREFIX = 'BPJS_ANTREAN';
const DEFAULT_DEVELOPMENT_BASE_URL = 'https://apijkn-dev.bpjs-kesehatan.go.id/antreanfktp_dev';
const DEFAULT_PRODUCTION_BASE_URL = 'https://apijkn.bpjs-kesehatan.go.id/antreanfktp';

/**
 * Resolves the BPJS Antrean adapter configuration from environment values at
 * startup. No credentials live here — they are per-facility database rows
 * (`BpjsAntreanConfig`), so the environment only carries base URLs and the
 * resilience policy, both read through the shared gateway resolver.
 *
 * The two defaults are the working assumption recorded in the P14 evaluation,
 * **not** confirmed values: whether these hosts are the ones actually issued,
 * and whether a development environment is issued at all, are spike questions
 * Q2 and Q11 (docs/post-mvp/bpjs-antrean-spike.md). Override with
 * `BPJS_ANTREAN_DEVELOPMENT_BASE_URL` / `BPJS_ANTREAN_PRODUCTION_BASE_URL`
 * once the branch office says what they are.
 */
export function resolveBpjsAntreanAdapterConfig(
  configService: ConfigService,
): BpjsAntreanAdapterConfig {
  return resolveBpjsGatewayAdapterConfig({
    configService,
    serviceLabel: SERVICE_LABEL,
    envPrefix: ENV_PREFIX,
    developmentBaseUrlFallback: DEFAULT_DEVELOPMENT_BASE_URL,
    productionBaseUrlFallback: DEFAULT_PRODUCTION_BASE_URL,
  });
}
