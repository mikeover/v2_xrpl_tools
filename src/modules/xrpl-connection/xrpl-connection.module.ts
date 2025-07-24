import { Module } from '@nestjs/common';
import { XRPLConnectionManagerService } from './services/xrpl-connection-manager.service';
import { XRPLHealthController } from './controllers/xrpl-health.controller';
import { CoreModule } from '../../core/core.module';

@Module({
  imports: [CoreModule],
  controllers: [XRPLHealthController],
  providers: [XRPLConnectionManagerService],
  exports: [XRPLConnectionManagerService],
})
export class XRPLConnectionModule {}
