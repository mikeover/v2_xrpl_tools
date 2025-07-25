import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertConfigEntity } from '../../database/entities/alert-config.entity';
import { AlertConfigRepository } from './repositories/alert-config.repository';
import { AlertConfigService } from './services/alert-config.service';
import { AlertMatchingService } from './services/alert-matching.service';
import { AlertNotificationService } from './services/alert-notification.service';
import { AlertConfigController } from './controllers/alert-config.controller';
import { AuthModule } from '../auth/auth.module';
import { LoggerModule } from '../../core/logger/logger.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AlertConfigEntity]),
    AuthModule,
    LoggerModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [AlertConfigController],
  providers: [
    AlertConfigRepository,
    AlertConfigService,
    AlertMatchingService,
    AlertNotificationService,
  ],
  exports: [
    AlertConfigService,
    AlertMatchingService,
    AlertNotificationService,
  ],
})
export class AlertsModule {}
