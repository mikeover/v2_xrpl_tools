import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DiscordWebhookService } from './services/discord-webhook.service';
import { EmailNotificationService } from './services/email-notification.service';
import { WebhookNotificationService } from './services/webhook-notification.service';
import { NotificationProcessorService } from './services/notification-processor.service';
import { NotificationEntity } from '../../database/entities/notification.entity';
import { CoreModule } from '../../core/core.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationEntity]),
    ConfigModule,
    CoreModule,
  ],
  providers: [
    DiscordWebhookService,
    EmailNotificationService,
    WebhookNotificationService,
    NotificationProcessorService,
  ],
  exports: [
    DiscordWebhookService,
    EmailNotificationService,
    WebhookNotificationService,
    NotificationProcessorService,
  ],
})
export class NotificationsModule {}
