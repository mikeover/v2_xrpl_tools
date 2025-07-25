import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertMatchingService, NFTActivity } from './alert-matching.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { NftActivityEntity } from '../../../database/entities/nft-activity.entity';
import { NotificationEntity } from '../../../database/entities/notification.entity';
import { AlertMatchResult } from '../interfaces/alert.interface';

@Injectable()
export class AlertNotificationService {
  constructor(
    private readonly alertMatchingService: AlertMatchingService,
    private readonly logger: LoggerService,
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
  ) {}

  /**
   * Process a batch of NFT activities and generate notifications for matching alerts
   */
  async processActivityBatch(activities: NftActivityEntity[]): Promise<void> {
    try {
      this.logger.debug(`Processing ${activities.length} NFT activities for alert matching`);

      const processedActivities = await Promise.allSettled(
        activities.map(activity => this.processActivity(activity))
      );

      const successful = processedActivities.filter(result => result.status === 'fulfilled').length;
      const failed = processedActivities.length - successful;

      this.logger.log(
        `Alert processing completed: ${successful} successful, ${failed} failed out of ${activities.length} activities`
      );

      if (failed > 0) {
        const errors = processedActivities
          .filter(result => result.status === 'rejected')
          .map(result => (result as PromiseRejectedResult).reason);
        
        this.logger.warn(`Failed to process some activities: ${errors.join(', ')}`);
      }
    } catch (error) {
      this.logger.error(
        `Critical error in processActivityBatch: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Process a single NFT activity and generate notifications for matching alerts
   */
  async processActivity(activity: NftActivityEntity): Promise<void> {
    try {
      // Convert database entity to the format expected by AlertMatchingService
      const nftActivity = await this.convertToNFTActivity(activity);
      
      // Find matching alerts
      const matchResults = await this.alertMatchingService.findMatchingAlerts(nftActivity);
      
      // Filter for successful matches
      const successfulMatches = matchResults.filter(result => result.matched);
      
      if (successfulMatches.length > 0) {
        this.logger.debug(
          `Found ${successfulMatches.length} matching alerts for activity ${activity.id}`
        );

        // Generate notifications for each match
        await Promise.allSettled(
          successfulMatches.map(match => this.generateNotification(activity, match))
        );
      } else {
        this.logger.debug(`No matching alerts found for activity ${activity.id}`);
      }
    } catch (error) {
      this.logger.error(
        `Error processing activity ${activity.id}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Convert NftActivityEntity to NFTActivity format expected by AlertMatchingService
   */
  private async convertToNFTActivity(activity: NftActivityEntity): Promise<NFTActivity> {
    const nftActivity: NFTActivity = {
      id: activity.id,
      nftId: activity.nftId || '',
      transactionHash: activity.transactionHash,
      ledgerIndex: parseInt(activity.ledgerIndex),
      activityType: activity.activityType,
      timestamp: activity.timestamp,
    };

    // Add optional properties only if they exist
    if (activity.fromAddress) {
      nftActivity.fromAddress = activity.fromAddress;
    }
    if (activity.toAddress) {
      nftActivity.toAddress = activity.toAddress;
    }
    if (activity.priceDrops) {
      nftActivity.priceDrops = activity.priceDrops;
    }
    if (activity.currency) {
      nftActivity.currency = activity.currency;
    }
    if (activity.issuer) {
      nftActivity.issuer = activity.issuer;
    }

    // Include NFT data if available
    if (activity.nft) {
      nftActivity.nft = {
        id: activity.nft.id,
        nftId: activity.nft.nftId,
        ownerAddress: activity.nft.ownerAddress,
        metadata: activity.nft.metadata,
        traits: activity.nft.traits,
      };

      // Add optional NFT properties
      if (activity.nft.collectionId) {
        nftActivity.nft.collectionId = activity.nft.collectionId;
      }
      if (activity.nft.imageUrl) {
        nftActivity.nft.imageUrl = activity.nft.imageUrl;
      }

      // Include collection data if available
      if (activity.nft.collection) {
        nftActivity.nft.collection = {
          id: activity.nft.collection.id,
          issuerAddress: activity.nft.collection.issuerAddress,
          taxon: activity.nft.collection.taxon,
        };

        if (activity.nft.collection.name) {
          nftActivity.nft.collection.name = activity.nft.collection.name;
        }
      }
    }

    return nftActivity;
  }

  /**
   * Generate a notification record for a matched alert
   */
  private async generateNotification(
    activity: NftActivityEntity,
    matchResult: AlertMatchResult
  ): Promise<void> {
    try {
      // For now, we'll just log the notification until we implement the full notification system
      // Later we'll need to:
      // 1. Get the alert config to determine user ID and notification channels
      // 2. Create notification records for each channel
      // 3. Queue for actual delivery (Discord, Email, Webhook)
      
      this.logger.log(
        `🚨 ALERT MATCHED: Activity ${activity.id} (${activity.activityType}) matched alert ${matchResult.alertConfigId}. ` +
        `Transaction: ${activity.transactionHash}. ` +
        `Reasons: ${matchResult.reasons?.join(', ') || 'No reasons provided'}`
      );

      // Log additional context if available
      if (activity.nft?.collection?.name) {
        this.logger.log(`Collection: ${activity.nft.collection.name}`);
      }
      if (activity.priceDrops) {
        this.logger.log(`Price: ${activity.priceDrops} drops`);
      }

      // TODO: Implement full notification system:
      // 
      // 1. Get alert configuration with user and notification channels
      // const alertConfig = await this.alertConfigRepository.findById(matchResult.alertConfigId);
      // 
      // 2. For each enabled notification channel, create notification record:
      // for (const channel of alertConfig.notificationChannels.filter(c => c.enabled)) {
      //   const notification = this.notificationRepository.create({
      //     userId: alertConfig.userId,
      //     alertConfigId: matchResult.alertConfigId,
      //     activityId: activity.id,
      //     channel: channel.type,
      //     status: 'pending',
      //     scheduledAt: new Date(),
      //   });
      //   await this.notificationRepository.save(notification);
      // }
      //
      // 3. Queue for delivery via notification service
      
    } catch (error) {
      this.logger.error(
        `Failed to generate notification for activity ${activity.id} and alert ${matchResult.alertConfigId}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Get statistics about alert processing
   */
  async getProcessingStats(): Promise<{
    totalActivitiesProcessed: number;
    totalNotificationsGenerated: number;
    totalAlertMatches: number;
    averageProcessingTimeMs: number;
  }> {
    // TODO: Implement actual statistics tracking
    // This would require storing processing metrics in the database
    return {
      totalActivitiesProcessed: 0,
      totalNotificationsGenerated: 0,
      totalAlertMatches: 0,
      averageProcessingTimeMs: 0,
    };
  }

  /**
   * Health check for the alert notification system
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Check if we can access the alert matching service
      await this.alertMatchingService.findMatchingAlerts({
        id: 'health-check',
        nftId: 'test',
        transactionHash: 'test',
        ledgerIndex: 0,
        activityType: 'mint',
        timestamp: new Date(),
      });
    } catch (error) {
      issues.push(`Alert matching service error: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      // Check database connectivity
      await this.notificationRepository.count();
    } catch (error) {
      issues.push(`Database connectivity error: ${error instanceof Error ? error.message : String(error)}`);
    }

    const status = issues.length === 0 ? 'healthy' : issues.length < 2 ? 'degraded' : 'unhealthy';

    return { status, issues };
  }
}