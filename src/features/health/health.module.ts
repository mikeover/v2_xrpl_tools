import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './controllers/health.controller';
import { HealthCheckService } from './services/health-check.service';
import { CoreModule } from '../../core/core.module';
import { XRPLConnectionModule } from '../../modules/xrpl-connection/xrpl-connection.module';
import { QueueModule } from '../../modules/queue/queue.module';
import { AlertsModule } from '../alerts/alerts.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MetadataModule } from '../metadata/metadata.module';
import { UserEntity } from '../../database/entities/user.entity';
import { NftActivityEntity } from '../../database/entities/nft-activity.entity';
import { NotificationEntity } from '../../database/entities/notification.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      NftActivityEntity,
      NotificationEntity,
    ]),
    CoreModule,
    XRPLConnectionModule,
    QueueModule,
    AlertsModule,
    NotificationsModule,
    MetadataModule,
  ],
  controllers: [HealthController],
  providers: [HealthCheckService],
  exports: [HealthCheckService],
})
export class HealthModule {}