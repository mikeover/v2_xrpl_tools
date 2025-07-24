import { Controller, Get } from '@nestjs/common';
import { XRPLConnectionManagerService } from '../services/xrpl-connection-manager.service';

@Controller('xrpl')
export class XRPLHealthController {
  constructor(private readonly connectionManager: XRPLConnectionManagerService) {}

  @Get('health')
  getHealth() {
    return this.connectionManager.getConnectionHealth();
  }

  @Get('gaps')
  getLedgerGaps() {
    return {
      gaps: this.connectionManager.detectLedgerGaps(),
    };
  }
}