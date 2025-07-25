import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggerService } from '../../../core/logger/logger.service';
import { NotificationEntity } from '../../../database/entities/notification.entity';
import { DiscordWebhookService } from './discord-webhook.service';
import { EmailNotificationService } from './email-notification.service';
import { WebhookNotificationService } from './webhook-notification.service';
import {
  NotificationPayload,
  NotificationResult,
  NotificationChannel,
  NFTActivityNotificationData,
} from '../interfaces/notification.interface';

@Injectable()
export class NotificationProcessorService {
  private readonly maxRetries: number = 3;
  private readonly retryDelays: number[] = [1000, 5000, 15000]; // 1s, 5s, 15s

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
    private readonly discordService: DiscordWebhookService,
    private readonly emailService: EmailNotificationService,
    private readonly webhookService: WebhookNotificationService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Process notifications for an NFT activity
   */
  async processActivityNotifications(
    userId: string,
    alertConfigId: string,
    activityId: string,
    channels: NotificationChannel[]
  ): Promise<void> {
    try {
      this.logger.debug(
        `Processing ${channels.length} notification channels for activity ${activityId}`
      );

      // Create notification records for each enabled channel
      const notifications = await this.createNotificationRecords(
        userId,
        alertConfigId,
        activityId,
        channels.filter(channel => channel.enabled)
      );

      // Process each notification
      await Promise.allSettled(
        notifications.map(notification => this.processNotification(notification))
      );

      this.logger.log(
        `Processed ${notifications.length} notifications for activity ${activityId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to process notifications for activity ${activityId}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Create notification records in the database
   */
  private async createNotificationRecords(
    userId: string,
    alertConfigId: string,
    activityId: string,
    channels: NotificationChannel[]
  ): Promise<NotificationEntity[]> {
    const notifications: NotificationEntity[] = [];

    for (const channel of channels) {
      const notification = this.notificationRepository.create({
        userId,
        alertConfigId,
        activityId,
        channel: channel.type,
        status: 'pending',
        retryCount: 0,
        scheduledAt: new Date(),
        sentAt: null,
        errorMessage: null,
      });

      notifications.push(notification);
    }

    // Save all notifications in a single transaction
    return this.notificationRepository.save(notifications);
  }

  /**
   * Process a single notification
   */
  private async processNotification(notification: NotificationEntity): Promise<void> {
    try {
      this.logger.debug(`Processing notification ${notification.id} via ${notification.channel}`);

      // Get the full notification data (with relations)
      const fullNotification = await this.notificationRepository.findOne({
        where: { id: notification.id },
        relations: ['activity', 'activity.nft', 'activity.nft.collection', 'alertConfig'],
      });

      if (!fullNotification?.activity) {
        throw new Error(`Activity data not found for notification ${notification.id}`);
      }

      if (!fullNotification?.alertConfig) {
        throw new Error(`Alert config not found for notification ${notification.id}`);
      }

      // Build notification payload
      const payload = await this.buildNotificationPayload(fullNotification);

      // Send the notification
      const result = await this.sendNotification(payload);

      // Update notification status based on result
      await this.updateNotificationStatus(notification.id, result);

      // If failed and retries are available, schedule retry
      if (!result.success && notification.retryCount < this.maxRetries) {
        await this.scheduleRetry(notification.id, result.retryAfter);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(
        `Failed to process notification ${notification.id}: ${errorMessage}`
      );

      // Update notification with error
      await this.updateNotificationStatus(notification.id, {
        success: false,
        error: errorMessage,
      });

      // Schedule retry if retries are available
      if (notification.retryCount < this.maxRetries) {
        await this.scheduleRetry(notification.id);
      }
    }
  }

  /**
   * Build notification payload from database entities
   */
  private async buildNotificationPayload(
    notification: NotificationEntity
  ): Promise<NotificationPayload> {
    const activity = notification.activity;
    const alertConfig = notification.alertConfig;
    
    // Convert activity entity to notification data format
    const activityData: NFTActivityNotificationData = {
      activityType: activity.activityType,
      transactionHash: activity.transactionHash,
      ledgerIndex: parseInt(activity.ledgerIndex),
      timestamp: activity.timestamp,
    };

    // Add optional properties only if they exist
    if (activity.fromAddress) {
      activityData.fromAddress = activity.fromAddress;
    }
    if (activity.toAddress) {
      activityData.toAddress = activity.toAddress;
    }
    if (activity.priceDrops) {
      activityData.priceDrops = activity.priceDrops;
    }
    if (activity.currency) {
      activityData.currency = activity.currency;
    }
    if (activity.issuer) {
      activityData.issuer = activity.issuer;
    }

    // Include NFT data if available
    if (activity.nft) {
      activityData.nft = {
        id: activity.nft.id,
        nftId: activity.nft.nftId,
        ownerAddress: activity.nft.ownerAddress,
        metadata: activity.nft.metadata,
      };

      // Add optional NFT properties
      if (activity.nft.imageUrl) {
        activityData.nft.imageUrl = activity.nft.imageUrl;
      }

      // Include collection data if available
      if (activity.nft.collection) {
        activityData.nft.collection = {
          id: activity.nft.collection.id,
          issuerAddress: activity.nft.collection.issuerAddress,
          taxon: activity.nft.collection.taxon,
        };

        if (activity.nft.collection.name) {
          activityData.nft.collection.name = activity.nft.collection.name;
        }
      }
    }

    // Get notification channel configuration
    const notificationChannels = alertConfig.notificationChannels || [];
    const channelConfig = notificationChannels['find'](
      (ch: any) => ch.type === notification.channel
    );

    if (!channelConfig) {
      throw new Error(`Channel configuration not found for ${notification.channel}`);
    }

    return {
      id: notification.id,
      userId: notification.userId,
      alertConfigId: notification.alertConfigId,
      activityId: notification.activityId,
      channel: channelConfig,
      data: activityData,
      scheduledAt: notification.scheduledAt,
      retryCount: notification.retryCount,
      maxRetries: this.maxRetries,
    };
  }

  /**
   * Send notification via the appropriate service
   */
  private async sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
    switch (payload.channel.type) {
      case 'discord':
        return this.discordService.sendNotification(payload);
      
      case 'email':
        return this.emailService.sendNotification(payload);
      
      case 'webhook':
        return this.webhookService.sendNotification(payload);
      
      default:
        throw new Error(`Unsupported notification channel: ${payload.channel.type}`);
    }
  }

  /**
   * Update notification status in database
   */
  private async updateNotificationStatus(
    notificationId: string,
    result: NotificationResult
  ): Promise<void> {
    const updateData: Partial<NotificationEntity> = {};

    if (result.success) {
      updateData.status = 'sent';
      updateData.sentAt = new Date();
      updateData.errorMessage = null;
    } else {
      updateData.status = 'failed';
      updateData.errorMessage = result.error || 'Unknown error';
    }

    await this.notificationRepository.update(notificationId, updateData);
  }

  /**
   * Schedule notification retry
   */
  private async scheduleRetry(
    notificationId: string,
    retryAfter?: number
  ): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      this.logger.error(`Notification ${notificationId} not found for retry scheduling`);
      return;
    }

    const nextRetryCount = notification.retryCount + 1;
    const delay = retryAfter || this.retryDelays[nextRetryCount - 1] || 30000; // Default 30s

    // Update notification for retry
    await this.notificationRepository.update(notificationId, {
      status: 'pending',
      retryCount: nextRetryCount,
      scheduledAt: new Date(Date.now() + delay),
      errorMessage: null,
    });

    this.logger.log(
      `Scheduled retry ${nextRetryCount}/${this.maxRetries} for notification ${notificationId} in ${delay}ms`
    );

    // Schedule the retry processing
    setTimeout(() => {
      this.processRetryNotification(notificationId).catch(error => {
        this.logger.error(
          `Failed to process retry for notification ${notificationId}: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }, delay);
  }

  /**
   * Process a retry notification
   */
  private async processRetryNotification(notificationId: string): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      this.logger.error(`Notification ${notificationId} not found for retry processing`);
      return;
    }

    if (notification.status !== 'pending') {
      this.logger.debug(`Skipping retry for notification ${notificationId} - status: ${notification.status}`);
      return;
    }

    this.logger.debug(`Processing retry for notification ${notificationId}`);
    await this.processNotification(notification);
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(userId?: string): Promise<{
    total: number;
    sent: number;
    failed: number;
    pending: number;
    byChannel: Record<string, { sent: number; failed: number; pending: number }>;
  }> {
    const whereClause = userId ? { userId } : {};
    
    const notifications = await this.notificationRepository.find({
      where: whereClause,
    });

    const stats = {
      total: notifications.length,
      sent: 0,
      failed: 0,
      pending: 0,
      byChannel: {} as Record<string, { sent: number; failed: number; pending: number }>,
    };

    notifications.forEach(notification => {
      // Overall stats
      switch (notification.status) {
        case 'sent':
          stats.sent++;
          break;
        case 'failed':
          stats.failed++;
          break;
        case 'pending':
          stats.pending++;
          break;
      }

      // Channel stats
      if (!stats.byChannel[notification.channel]) {
        stats.byChannel[notification.channel] = { sent: 0, failed: 0, pending: 0 };
      }

      const channelStats = stats.byChannel[notification.channel];
      if (channelStats) {
        switch (notification.status) {
          case 'sent':
            channelStats.sent++;
            break;
          case 'failed':
            channelStats.failed++;
            break;
          case 'pending':
            channelStats.pending++;
            break;
        }
      }
    });

    return stats;
  }

  /**
   * Clean up old notifications
   */
  async cleanupOldNotifications(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.notificationRepository
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoffDate', { cutoffDate })
      .execute();

    this.logger.log(`Cleaned up ${result.affected} old notifications older than ${olderThanDays} days`);
    
    return result.affected || 0;
  }

  /**
   * Health check for the notification processor
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
    services: Record<string, boolean>;
  }> {
    const issues: string[] = [];
    const services: Record<string, boolean> = {};

    // Check database connectivity
    try {
      await this.notificationRepository.count();
      services['database'] = true;
    } catch (error) {
      services['database'] = false;
      issues.push(`Database connectivity error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Check individual notification services would go here
    // For now, assume they're healthy if they can be instantiated
    services['discord'] = true;
    services['email'] = true;
    services['webhook'] = true;

    const status = issues.length === 0 ? 'healthy' : issues.length < 2 ? 'degraded' : 'unhealthy';

    return { status, issues, services };
  }
}