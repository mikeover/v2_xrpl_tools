import { Module } from '@nestjs/common';
import { XRPLConnectionManagerService } from './services/xrpl-connection-manager.service';
import { XRPLHealthController } from './controllers/xrpl-health.controller';
import { CoreModule } from '../../core/core.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [CoreModule, QueueModule],
  controllers: [XRPLHealthController],
  providers: [XRPLConnectionManagerService],
  exports: [XRPLConnectionManagerService],
})
export class XRPLConnectionModule {}
