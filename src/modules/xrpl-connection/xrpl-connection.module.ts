import { Module } from '@nestjs/common';
import { XRPLConnectionManagerService } from './services/xrpl-connection-manager.service';
import { CoreModule } from '../../core/core.module';

@Module({
  imports: [CoreModule],
  providers: [XRPLConnectionManagerService],
  exports: [XRPLConnectionManagerService],
})
export class XRPLConnectionModule {}
