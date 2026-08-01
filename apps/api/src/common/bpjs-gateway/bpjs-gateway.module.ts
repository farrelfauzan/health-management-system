import { Module } from '@nestjs/common';

import { BpjsProtocolCaptureService } from './bpjs-protocol-capture.service';

/**
 * Infrastructure shared by **both** BPJS integrations (P14-T06).
 *
 * The transport itself is not a provider — each service adapter constructs its
 * own instance so one service's outage cannot open the other's circuit
 * breaker. What genuinely must be shared is the UAT capture sink: one
 * instance means one capture file, one "capture is enabled" warning at boot,
 * and one place that has ensured the directory exists. Two providers would
 * have given a UAT operator two of each and no clear answer about which file
 * to commit.
 */
@Module({
  providers: [BpjsProtocolCaptureService],
  exports: [BpjsProtocolCaptureService],
})
export class BpjsGatewayModule {}
